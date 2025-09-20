import { SerializedRngState } from '../types';

export type SeedInput = number | bigint | string | [bigint, bigint] | SerializedRngState;

const UINT64_MASK = (1n << 64n) - 1n;

function toUint64(value: bigint): bigint {
  return value & UINT64_MASK;
}

function splitmix64(seed: bigint): () => bigint {
  let state = toUint64(seed);
  return () => {
    state = toUint64(state + 0x9e3779b97f4a7c15n);
    let z = state;
    z = toUint64((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = toUint64((z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return toUint64(z ^ (z >> 31n));
  };
}

function hashString(seed: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= BigInt(seed.charCodeAt(i));
    hash = toUint64(hash * 0x100000001b3n);
  }
  return hash;
}

function normalizeSeed(seed: SeedInput | undefined): [bigint, bigint] {
  if (typeof seed === 'number') {
    return normalizeSeed(BigInt(seed));
  }
  if (typeof seed === 'bigint') {
    const generator = splitmix64(seed);
    return [generator(), generator() || 1n];
  }
  if (typeof seed === 'string') {
    const hash = hashString(seed);
    const generator = splitmix64(hash);
    return [generator(), generator() || 1n];
  }
  if (Array.isArray(seed)) {
    let [s0, s1] = seed;
    if (typeof s0 === 'number') s0 = BigInt(s0);
    if (typeof s1 === 'number') s1 = BigInt(s1);
    s0 = toUint64(BigInt(s0));
    s1 = toUint64(BigInt(s1));
    if (s0 === 0n && s1 === 0n) {
      s1 = 1n;
    }
    return [s0, s1];
  }
  if (seed && 'algorithm' in seed) {
    if (seed.algorithm !== 'xorshift128+') {
      throw new Error(`Unsupported RNG algorithm: ${seed.algorithm}`);
    }
    const [s0, s1] = seed.state;
    let state0 = toUint64(BigInt(s0));
    let state1 = toUint64(BigInt(s1));
    if (state0 === 0n && state1 === 0n) {
      state1 = 1n;
    }
    return [state0, state1];
  }
  return normalizeSeed(1n);
}

function toHex(value: bigint): string {
  return `0x${value.toString(16).padStart(16, '0')}`;
}

export class Xorshift128Plus {
  private state0: bigint;

  private state1: bigint;

  constructor(seed?: SeedInput) {
    const [s0, s1] = normalizeSeed(seed);
    this.state0 = s0;
    this.state1 = s1;
    if (this.state0 === 0n && this.state1 === 0n) {
      this.state1 = 1n;
    }
  }

  static deserialize(serialized: SerializedRngState): Xorshift128Plus {
    return new Xorshift128Plus(serialized);
  }

  clone(): Xorshift128Plus {
    const clone = new Xorshift128Plus();
    clone.state0 = this.state0;
    clone.state1 = this.state1;
    return clone;
  }

  getState(): [bigint, bigint] {
    return [this.state0, this.state1];
  }

  serialize(): SerializedRngState {
    return {
      algorithm: 'xorshift128+',
      state: [toHex(this.state0), toHex(this.state1)],
    };
  }

  nextBigInt(): bigint {
    let s1 = this.state0;
    const s0 = this.state1;
    this.state0 = s0;
    s1 ^= (s1 << 23n) & UINT64_MASK;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.state1 = toUint64(s1);
    const result = toUint64(this.state1 + s0);
    return result;
  }

  nextFloat(): number {
    const value = this.nextBigInt();
    const fraction = Number(value >> 11n) / 2 ** 53;
    return fraction;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }
    const bound = BigInt(maxExclusive);
    const threshold = UINT64_MASK - (UINT64_MASK % bound);
    while (true) {
      const value = this.nextBigInt();
      if (value < threshold) {
        return Number(value % bound);
      }
    }
  }

  nextRange(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new RangeError('Range boundaries must be integers');
    }
    if (maxExclusive <= minInclusive) {
      throw new RangeError('maxExclusive must be greater than minInclusive');
    }
    const delta = maxExclusive - minInclusive;
    return minInclusive + this.nextInt(delta);
  }

  next(): number {
    return this.nextFloat();
  }
}
