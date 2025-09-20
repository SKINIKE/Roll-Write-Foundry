import { evaluateExpression, MiniExprEvaluationError } from './expr';
import { Xorshift128Plus, SeedInput } from './rng/xorshift128plus';
import { compileTemplate } from './template';
import {
  CompiledAction,
  CompiledTemplate,
  DecisionPolicy,
  DecisionPolicyContext,
  GameEvent,
  GamePhase,
  GameSnapshot,
  GameTemplate,
  ReplayRecord,
  ReplayTurn,
  ResourceSnapshot,
  RollResult,
  SerializedRngState,
} from './types';

function cloneResources(resources: ResourceSnapshot): ResourceSnapshot {
  return Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, value]));
}

interface ApplyOutcome {
  deltas: Record<string, number>;
  resulting: ResourceSnapshot;
}

export interface SessionOptions {
  seed?: SeedInput;
}

export class GameSession {
  readonly template: CompiledTemplate;

  readonly rng: Xorshift128Plus;

  private readonly initialSeed: SerializedRngState;

  private _phase: GamePhase = 'setup';

  private _turn = 1;

  private resources: ResourceSnapshot;

  private history: GameEvent[] = [];

  private rollResult?: RollResult;

  private chosenAction?: CompiledAction;

  private replayTurns: ReplayTurn[] = [];

  private currentReplayTurn?: Partial<ReplayTurn>;

  private finalScore: number | null = null;

  private timestampCounter = 0;

  constructor(template: GameTemplate | CompiledTemplate, options: SessionOptions = {}) {
    this.template = 'resourceMap' in template ? (template as CompiledTemplate) : compileTemplate(template);
    this.rng = new Xorshift128Plus(options.seed);
    this.initialSeed = this.rng.serialize();
    this.resources = {};
    for (const resource of this.template.resources) {
      this.resources[resource.id] = resource.initial;
    }
    this.recordEvent({
      type: 'setup',
      phase: 'setup',
      turn: 0,
      resources: cloneResources(this.resources),
      timestamp: this.nextTimestamp(),
    });
    this._phase = 'roll';
  }

  private nextTimestamp(): number {
    this.timestampCounter += 1;
    return this.timestampCounter;
  }

  get phase(): GamePhase {
    return this._phase;
  }

  get turn(): number {
    return this._turn;
  }

  get events(): readonly GameEvent[] {
    return this.history;
  }

  getReplay(): ReplayRecord | null {
    if (this.finalScore === null) {
      return null;
    }
    return {
      templateId: this.template.id,
      templateVersion: this.template.version,
      seed: this.initialSeed,
      turns: this.replayTurns,
      finalScore: this.finalScore,
    };
  }

  getSnapshot(): GameSnapshot {
    return {
      template: this.template,
      phase: this._phase,
      turn: this._turn,
      resources: cloneResources(this.resources),
      roll: this.rollResult,
      availableActions: this.listAvailableActions(),
    };
  }

  private recordEvent(event: GameEvent): void {
    this.history.push(event);
  }

  private startTurnLog(): void {
    this.currentReplayTurn = { turn: this._turn };
  }

  private finalizeTurnLog(): void {
    if (this.currentReplayTurn && this.currentReplayTurn.roll && this.currentReplayTurn.actionId && this.currentReplayTurn.resources) {
      this.replayTurns.push(this.currentReplayTurn as ReplayTurn);
    }
    this.currentReplayTurn = undefined;
  }

  private ensurePhase(expected: GamePhase): void {
    if (this._phase !== expected) {
      throw new Error(`Cannot perform action in phase '${this._phase}'. Expected '${expected}'.`);
    }
  }

  roll(): RollResult {
    this.ensurePhase('roll');
    const dice = this.template.dice[0];
    const values: number[] = [];
    for (let i = 0; i < dice.count; i += 1) {
      values.push(this.rng.nextInt(dice.sides) + 1);
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    const roll: RollResult = {
      diceId: dice.id,
      values,
      total,
      highest: Math.max(...values),
      lowest: Math.min(...values),
    };
    this.rollResult = roll;
    this._phase = 'choose';
    this.startTurnLog();
    this.currentReplayTurn!.roll = roll;
    this.recordEvent({
      type: 'roll',
      phase: 'roll',
      turn: this._turn,
      roll,
      timestamp: this.nextTimestamp(),
    });
    return roll;
  }

  listAvailableActions(): CompiledAction[] {
    if (!this.rollResult) {
      return [];
    }
    const actions: CompiledAction[] = [];
    for (const action of this.template.actions) {
      if (!action.conditionAst) {
        actions.push(action);
        continue;
      }
      const result = evaluateExpression(action.conditionAst, {
        variables: this.createVariables(),
      });
      if (typeof result !== 'boolean') {
        throw new MiniExprEvaluationError(`Condition for action '${action.id}' must evaluate to a boolean`);
      }
      if (result) {
        actions.push(action);
      }
    }
    return actions;
  }

  private createVariables(): Record<string, number> {
    const variables: Record<string, number> = {
      turn: this._turn,
    };
    for (const [key, value] of Object.entries(this.resources)) {
      variables[key] = value;
    }
    if (this.rollResult) {
      variables.roll_total = this.rollResult.total;
      variables.roll_high = this.rollResult.highest;
      variables.roll_low = this.rollResult.lowest;
      this.rollResult.values.forEach((value, index) => {
        variables[`roll_${index + 1}`] = value;
      });
    }
    return variables;
  }

  choose(actionId: string): CompiledAction {
    this.ensurePhase('choose');
    const actions = this.listAvailableActions();
    const action = actions.find((candidate) => candidate.id === actionId);
    if (!action) {
      throw new Error(`Action '${actionId}' is not available during turn ${this._turn}`);
    }
    this.chosenAction = action;
    this._phase = 'apply';
    if (this.currentReplayTurn) {
      this.currentReplayTurn.actionId = action.id;
    }
    this.recordEvent({
      type: 'choose',
      phase: 'choose',
      turn: this._turn,
      actionId: action.id,
      timestamp: this.nextTimestamp(),
    });
    return action;
  }

  private applyChosenAction(): ApplyOutcome {
    if (!this.chosenAction) {
      throw new Error('No action has been chosen.');
    }
    const deltas: Record<string, number> = {};
    const resulting: ResourceSnapshot = cloneResources(this.resources);
    const variables = this.createVariables();
    for (const effect of this.chosenAction.effects) {
      const value = evaluateExpression(effect.ast, { variables });
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new MiniExprEvaluationError(`Effect for resource '${effect.resource}' must evaluate to a number`);
      }
      const definition = this.template.resourceMap[effect.resource];
      if (!definition) {
        throw new Error(`Unknown resource '${effect.resource}' referenced by action '${this.chosenAction.id}'`);
      }
      const previous = resulting[effect.resource];
      const updated = previous + value;
      if (definition.min !== undefined && updated < definition.min) {
        throw new Error(`Resource '${effect.resource}' cannot drop below ${definition.min}`);
      }
      if (definition.max !== undefined && updated > definition.max) {
        if (effect.clamp) {
          deltas[effect.resource] = definition.max - previous;
          resulting[effect.resource] = definition.max;
          variables[effect.resource] = resulting[effect.resource];
          continue;
        }
        throw new Error(`Resource '${effect.resource}' cannot exceed ${definition.max}`);
      }
      deltas[effect.resource] = (deltas[effect.resource] ?? 0) + value;
      resulting[effect.resource] = updated;
      variables[effect.resource] = updated;
    }
    this.resources = resulting;
    return { deltas, resulting: cloneResources(resulting) };
  }

  apply(): ApplyOutcome {
    this.ensurePhase('apply');
    const outcome = this.applyChosenAction();
    this.recordEvent({
      type: 'apply',
      phase: 'apply',
      turn: this._turn,
      deltas: outcome.deltas,
      resulting: cloneResources(this.resources),
      timestamp: this.nextTimestamp(),
    });
    if (this.currentReplayTurn) {
      this.currentReplayTurn.resources = cloneResources(this.resources);
    }
    this.chosenAction = undefined;
    this._phase = 'end';
    return outcome;
  }

  private shouldEndGame(): boolean {
    for (const condition of this.template.endConditions) {
      if (condition.type === 'turnLimit') {
        if (this._turn >= condition.limit) {
          return true;
        }
        continue;
      }
      if (condition.type === 'resourceThreshold') {
        const value = this.resources[condition.resource];
        let satisfied = false;
        switch (condition.comparison) {
          case '>':
            satisfied = value > condition.value;
            break;
          case '>=':
            satisfied = value >= condition.value;
            break;
          case '<':
            satisfied = value < condition.value;
            break;
          case '<=':
            satisfied = value <= condition.value;
            break;
          case '==':
            satisfied = value === condition.value;
            break;
          case '!=':
            satisfied = value !== condition.value;
            break;
          default:
            satisfied = false;
        }
        if (satisfied) {
          return true;
        }
      }
    }
    return false;
  }

  private evaluateScore(): number {
    const total = evaluateExpression(this.template.scoring.total, { variables: this.createVariables() });
    if (typeof total !== 'number' || Number.isNaN(total)) {
      throw new MiniExprEvaluationError('Scoring expression must resolve to a number');
    }
    return total;
  }

  endTurn(): void {
    this.ensurePhase('end');
    this.recordEvent({
      type: 'endTurn',
      phase: 'end',
      turn: this._turn,
      resources: cloneResources(this.resources),
      timestamp: this.nextTimestamp(),
    });
    this.finalizeTurnLog();
    if (this.shouldEndGame()) {
      this.finalScore = this.evaluateScore();
      this._phase = 'complete';
      this.recordEvent({
        type: 'complete',
        phase: 'complete',
        turn: this._turn,
        finalScore: this.finalScore,
        resources: cloneResources(this.resources),
        timestamp: this.nextTimestamp(),
      });
      return;
    }
    this._turn += 1;
    this.rollResult = undefined;
    this.chosenAction = undefined;
    this._phase = 'roll';
  }

  isComplete(): boolean {
    return this._phase === 'complete';
  }

  getScore(): number | null {
    return this.finalScore;
  }
}

export function autoplay(
  template: GameTemplate | CompiledTemplate,
  policy: DecisionPolicy,
  options: SessionOptions = {},
): ReplayRecord {
  const session = new GameSession(template, options);
  while (!session.isComplete()) {
    if (session.phase === 'roll') {
      session.roll();
    }
    if (session.phase === 'choose') {
      const snapshot = session.getSnapshot();
      const context: DecisionPolicyContext = {
        session: snapshot,
        actions: snapshot.availableActions,
      };
      const actionId = policy(context);
      session.choose(actionId);
    }
    if (session.phase === 'apply') {
      session.apply();
    }
    if (session.phase === 'end') {
      session.endTurn();
    }
  }
  const replay = session.getReplay();
  if (!replay) {
    throw new Error('Replay generation failed');
  }
  return replay;
}

export function highestPriorityPolicy(context: DecisionPolicyContext): string {
  if (context.actions.length === 0) {
    throw new Error('No actions available to choose');
  }
  const sorted = [...context.actions].sort((a, b) => b.priority - a.priority);
  return sorted[0].id;
}
