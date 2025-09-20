import { GameEvent } from '@rwf/core';

export function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case 'setup':
      return `Setup: ${Object.entries(event.resources)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')}`;
    case 'roll':
      return `Roll (turn ${event.turn}): [${event.roll.values.join(', ')}] → total ${event.roll.total}`;
    case 'choose':
      return `Choose action '${event.actionId}'`;
    case 'apply':
      return `Apply: ${Object.entries(event.deltas)
        .map(([key, value]) => `${key}${value >= 0 ? '+' : ''}${value}`)
        .join(', ')}`;
    case 'endTurn':
      return `End turn ${event.turn}`;
    case 'complete':
      return `Game complete — score ${event.finalScore}`;
    default:
      return event.type;
  }
}
