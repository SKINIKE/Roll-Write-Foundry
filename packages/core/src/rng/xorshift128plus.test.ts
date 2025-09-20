import { describe, expect, it } from 'vitest';
import { Xorshift128Plus } from './xorshift128plus';

const seeds = [42, 1337, 20250920] as const;

describe('Xorshift128Plus', () => {
  it('produces deterministic integer sequences for known seeds', () => {
    const sequences = seeds.reduce<Record<number, number[]>>((acc, seed) => {
      const rng = new Xorshift128Plus(seed);
      acc[seed] = Array.from({ length: 100 }, () => rng.nextInt(1_000));
      return acc;
    }, {});
    expect(sequences).toMatchSnapshot('xorshift-sequences');
  });

  it('round-trips through serialization', () => {
    const rng = new Xorshift128Plus(123);
    const first = rng.nextInt(1000);
    const serialized = rng.serialize();
    const restored = new Xorshift128Plus(serialized);
    expect(restored.nextInt(1000)).toBe(rng.nextInt(1000));
    restored.nextInt(1000);
    expect(restored.serialize().state).not.toEqual(serialized.state);
    expect(first).toBeTypeOf('number');
  });

  it('generates bounded ranges without bias', () => {
    const rng = new Xorshift128Plus('range-test');
    const counts = Array.from({ length: 6 }, () => 0);
    const iterations = 6_000;
    for (let i = 0; i < iterations; i += 1) {
      const value = rng.nextRange(0, 6);
      counts[value] += 1;
    }
    const average = iterations / 6;
    counts.forEach((count) => {
      expect(Math.abs(count - average)).toBeLessThan(average * 0.1);
    });
  });
});
