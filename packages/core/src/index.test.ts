import { describe, expect, it } from 'vitest';
import {
  Xorshift128Plus,
  autoplay,
  compileTemplate,
  evaluateExpression,
  meteorMinersReplays,
  meteorMinersTemplate,
} from './index';

const compiled = compileTemplate(meteorMinersTemplate);

describe('@rwf/core integration', () => {
  it('evaluates the scoring example to 33 points', () => {
    const variables = {
      ore: 5,
      crystal: 2,
      combo: 2,
      achievements: 0,
      roll_total: 0,
      roll_high: 0,
      roll_low: 0,
      turn: 12,
    } as const;
    const score = evaluateExpression(compiled.scoring.total, { variables });
    expect(score).toBe(33);
  });

  it('replays regenerate the same history under the same seed', () => {
    const seed = 42;
    const replay = meteorMinersReplays[seed];
    const queue = replay.turns.map((turn) => turn.actionId);
    const regenerated = autoplay(
      compiled,
      ({ actions }) => queue.shift() ?? actions[0].id,
      { seed },
    );
    expect(regenerated.turns).toEqual(replay.turns);
  });

  it('xorshift seeds serialise and restore correctly', () => {
    const rng = new Xorshift128Plus({ algorithm: 'xorshift128+', state: ['0x1', '0x2'] });
    const next = rng.nextInt(10);
    const restored = new Xorshift128Plus(rng.serialize());
    expect(restored.nextInt(10)).not.toBe(next); // subsequent numbers diverge after advancing state
  });
});
