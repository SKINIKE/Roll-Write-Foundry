import { describe, expect, it } from 'vitest';
import { GameSession, autoplay, highestPriorityPolicy } from './session';
import { compileTemplate } from './template';
import { meteorMinersReplays, meteorMinersTemplate } from './templates';
import type { GameTemplate } from './types';

const compiledTemplate = compileTemplate(meteorMinersTemplate);

describe('GameSession lifecycle', () => {
  it('initialises with setup event and default resources', () => {
    const session = new GameSession(compiledTemplate, { seed: 42 });
    expect(session.phase).toBe('roll');
    expect(session.turn).toBe(1);
    expect(session.events[0]).toMatchObject({ type: 'setup', resources: { ore: 0, crystal: 0 } });
    expect(session.getReplay()).toBeNull();
  });

  it('progresses through a full turn and updates resources', () => {
    const session = new GameSession(compiledTemplate, { seed: 42 });
    const roll = session.roll();
    expect(roll.values).toHaveLength(2);
    roll.values.forEach((value) => expect(value).toBeGreaterThanOrEqual(1));
    const actions = session.getSnapshot().availableActions.map((action) => action.id);
    expect(actions).toContain('stabilize');
    session.choose(actions.includes('blast-meteor') ? 'blast-meteor' : 'stabilize');
    const outcome = session.apply();
    expect(outcome.resulting.ore).toBeGreaterThan(0);
    session.endTurn();
    expect(session.turn).toBe(2);
    expect(session.phase).toBe('roll');
  });

  it('rejects illegal action selections', () => {
    const session = new GameSession(compiledTemplate, { seed: 42 });
    expect(() => session.choose('blast-meteor')).toThrow();
    session.roll();
    expect(() => session.choose('missing')).toThrow();
  });

  it('prevents resource totals from dropping below minimums', () => {
    const template: GameTemplate = {
      id: 'test-negative',
      name: 'Negative',
      version: '1.0.0',
      resources: [{ id: 'energy', label: 'Energy', initial: 0, min: 0 }],
      dice: [{ id: 'die', label: 'Die', sides: 6, count: 1 }],
      actions: [
        {
          id: 'spend',
          label: 'Spend',
          priority: 1,
          condition: 'roll_total >= 0',
          effects: [{ resource: 'energy', expression: '-1' }],
        },
      ],
      turn: { limit: 1 },
      scoring: { total: 'energy', components: undefined },
      endConditions: [{ type: 'turnLimit', limit: 1 }],
    };
    const session = new GameSession(template, { seed: 1 });
    session.roll();
    session.choose('spend');
    expect(() => session.apply()).toThrow(/cannot drop below/);
  });

  it('generates deterministic replays that match exported fixtures', () => {
    for (const seed of [42, 1337, 20250920] as const) {
      const replay = autoplay(compiledTemplate, highestPriorityPolicy, { seed });
      expect(replay.finalScore).toBe(meteorMinersReplays[seed].finalScore);
      expect(replay.turns).toEqual(meteorMinersReplays[seed].turns);
    }
  });
});
