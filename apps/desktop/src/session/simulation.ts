import {
  CompiledTemplate,
  GameEvent,
  GameSnapshot,
  GameSession,
  ReplayRecord,
  SerializedRngState,
  Xorshift128Plus,
} from '@rwf/core';

export type SessionCommand =
  | { type: 'roll' }
  | { type: 'choose'; actionId: string }
  | { type: 'apply' }
  | { type: 'endTurn' };

export interface SimulationResult {
  snapshot: GameSnapshot;
  events: GameEvent[];
  replay: ReplayRecord | null;
  error: string | null;
}

export function createDefaultSeed(): SerializedRngState {
  const generator = new Xorshift128Plus(Date.now());
  return generator.serialize();
}

export function simulateSession(
  template: CompiledTemplate,
  seed: SerializedRngState,
  commands: SessionCommand[],
  pointer: number = commands.length,
): SimulationResult {
  const session = new GameSession(template, { seed });
  let snapshot = session.getSnapshot();
  let error: string | null = null;
  for (let index = 0; index < pointer; index += 1) {
    const command = commands[index];
    try {
      switch (command.type) {
        case 'roll':
          session.roll();
          break;
        case 'choose':
          session.choose(command.actionId);
          break;
        case 'apply':
          session.apply();
          break;
        case 'endTurn':
          session.endTurn();
          break;
        default:
          break;
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      break;
    }
  }
  snapshot = session.getSnapshot();
  return {
    snapshot,
    events: [...session.events],
    replay: session.getReplay(),
    error,
  };
}

export function commandsFromReplay(record: ReplayRecord): SessionCommand[] {
  const commands: SessionCommand[] = [];
  for (const turn of record.turns) {
    commands.push({ type: 'roll' });
    commands.push({ type: 'choose', actionId: turn.actionId });
    commands.push({ type: 'apply' });
    commands.push({ type: 'endTurn' });
  }
  return commands;
}
