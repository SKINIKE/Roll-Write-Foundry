import type { CompiledExpression } from './expr';

export interface ResourceDefinition {
  id: string;
  label: string;
  initial: number;
  min?: number;
  max?: number;
  description?: string;
}

export interface DiceDefinition {
  id: string;
  label: string;
  sides: number;
  count: number;
}

export interface ActionEffectDefinition {
  resource: string;
  expression: string;
  clamp?: boolean;
}

export interface ActionDefinition {
  id: string;
  label: string;
  description?: string;
  priority: number;
  condition?: string;
  effects: ActionEffectDefinition[];
  oncePerTurn?: boolean;
}

export type EndConditionDefinition =
  | { type: 'turnLimit'; limit: number }
  | { type: 'resourceThreshold'; resource: string; comparison: '>' | '>=' | '<' | '<=' | '==' | '!='; value: number };

export interface ScoringDefinition {
  total: string;
  components?: Record<string, string>;
}

export interface TurnStructureDefinition {
  limit: number;
}

export interface GameTemplate {
  id: string;
  name: string;
  version: string;
  locale?: string;
  description?: string;
  resources: ResourceDefinition[];
  dice: DiceDefinition[];
  actions: ActionDefinition[];
  turn: TurnStructureDefinition;
  scoring: ScoringDefinition;
  endConditions: EndConditionDefinition[];
  metadata?: Record<string, unknown>;
}

export interface CompiledActionEffect extends ActionEffectDefinition {
  ast: CompiledExpression;
}

export interface CompiledAction extends Omit<ActionDefinition, 'effects' | 'condition'> {
  effects: CompiledActionEffect[];
  conditionAst?: CompiledExpression;
}

export interface CompiledTemplate extends GameTemplate {
  actions: CompiledAction[];
  scoring: {
    total: CompiledExpression;
    components?: Record<string, CompiledExpression>;
  };
  resourceMap: Record<string, ResourceDefinition>;
}

export type ResourceSnapshot = Record<string, number>;

export interface RollResult {
  diceId: string;
  values: number[];
  total: number;
  highest: number;
  lowest: number;
}

export type GamePhase = 'setup' | 'roll' | 'choose' | 'apply' | 'end' | 'complete';

export interface GameEventBase {
  turn: number;
  phase: GamePhase;
  timestamp: number;
}

export interface SetupEvent extends GameEventBase {
  type: 'setup';
  resources: ResourceSnapshot;
}

export interface RollEvent extends GameEventBase {
  type: 'roll';
  roll: RollResult;
}

export interface ChooseEvent extends GameEventBase {
  type: 'choose';
  actionId: string;
}

export interface ApplyEvent extends GameEventBase {
  type: 'apply';
  deltas: Record<string, number>;
  resulting: ResourceSnapshot;
}

export interface EndTurnEvent extends GameEventBase {
  type: 'endTurn';
  resources: ResourceSnapshot;
}

export interface CompleteEvent extends GameEventBase {
  type: 'complete';
  finalScore: number;
  resources: ResourceSnapshot;
}

export type GameEvent = SetupEvent | RollEvent | ChooseEvent | ApplyEvent | EndTurnEvent | CompleteEvent;

export interface ReplayTurn {
  turn: number;
  roll: RollResult;
  actionId: string;
  resources: ResourceSnapshot;
}

export interface ReplayRecord {
  templateId: string;
  templateVersion: string;
  seed: SerializedRngState;
  turns: ReplayTurn[];
  finalScore: number;
}

export interface SerializedRngState {
  algorithm: 'xorshift128+';
  state: [string, string];
}

export interface GameSnapshot {
  template: CompiledTemplate;
  phase: GamePhase;
  turn: number;
  resources: ResourceSnapshot;
  roll?: RollResult;
  availableActions: CompiledAction[];
}

export interface DecisionPolicyContext {
  session: GameSnapshot;
  actions: CompiledAction[];
}

export type DecisionPolicy = (context: DecisionPolicyContext) => string;
