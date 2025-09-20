import { compileExpression } from './expr';
import { validateTemplate } from './schema';
import type {
  ActionDefinition,
  CompiledAction,
  CompiledActionEffect,
  CompiledTemplate,
  GameTemplate,
} from './types';

function compileAction(action: ActionDefinition): CompiledAction {
  const conditionAst = action.condition ? compileExpression(action.condition) : undefined;
  const effects: CompiledActionEffect[] = action.effects.map((effect) => ({
    ...effect,
    ast: compileExpression(effect.expression),
  }));
  return {
    ...action,
    conditionAst,
    effects,
  };
}

export function compileTemplate(template: GameTemplate): CompiledTemplate {
  const validated = validateTemplate(template);
  const actions = validated.actions.map((action) => compileAction(action));
  const components = validated.scoring.components
    ? Object.fromEntries(
        Object.entries(validated.scoring.components).map(([key, expression]) => [
          key,
          compileExpression(expression),
        ]),
      )
    : undefined;

  const resourceMap = Object.fromEntries(validated.resources.map((resource) => [resource.id, resource]));

  return {
    ...validated,
    actions,
    scoring: {
      total: compileExpression(validated.scoring.total),
      components,
    },
    resourceMap,
  };
}
