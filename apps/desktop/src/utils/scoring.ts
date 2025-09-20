import { CompiledTemplate, GameSnapshot, evaluateExpression } from '@rwf/core';

function buildVariables(snapshot: GameSnapshot): Record<string, number> {
  const variables: Record<string, number> = { turn: snapshot.turn };
  for (const [key, value] of Object.entries(snapshot.resources)) {
    variables[key] = value;
  }
  if (snapshot.roll) {
    variables.roll_total = snapshot.roll.total;
    variables.roll_high = snapshot.roll.highest;
    variables.roll_low = snapshot.roll.lowest;
    snapshot.roll.values.forEach((value, index) => {
      variables[`roll_${index + 1}`] = value;
    });
  }
  return variables;
}

function normalize(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return value;
}

export interface ScoreBreakdown {
  total: number;
  components: Record<string, number> | null;
}

export function evaluateScore(
  template: CompiledTemplate,
  snapshot: GameSnapshot,
): ScoreBreakdown {
  const variables = buildVariables(snapshot);
  const total = normalize(evaluateExpression(template.scoring.total, { variables }));
  const components: Record<string, number> | null = template.scoring.components
    ? Object.fromEntries(
        Object.entries(template.scoring.components).map(([key, expression]) => [
          key,
          normalize(evaluateExpression(expression, { variables })),
        ]),
      )
    : null;
  return { total, components };
}
