import Ajv, { JSONSchemaType } from 'ajv';
import {
  ActionDefinition,
  DiceDefinition,
  EndConditionDefinition,
  GameTemplate,
  ResourceDefinition,
  ScoringDefinition,
  TurnStructureDefinition,
} from './types';

export class TemplateValidationError extends Error {
  constructor(message: string, public readonly issues: string[]) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });

const resourceSchema: JSONSchemaType<ResourceDefinition> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'initial'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    initial: { type: 'number' },
    min: { type: 'number', nullable: true },
    max: { type: 'number', nullable: true },
    description: { type: 'string', nullable: true },
  },
};

const diceSchema: JSONSchemaType<DiceDefinition> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'sides', 'count'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    sides: { type: 'integer', minimum: 2 },
    count: { type: 'integer', minimum: 1 },
  },
};

const actionSchema: JSONSchemaType<ActionDefinition> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'priority', 'effects'],
  properties: {
    id: { type: 'string', minLength: 1 },
    label: { type: 'string', minLength: 1 },
    description: { type: 'string', nullable: true },
    priority: { type: 'integer', minimum: 0 },
    condition: { type: 'string', nullable: true },
    oncePerTurn: { type: 'boolean', nullable: true },
    effects: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['resource', 'expression'],
        properties: {
          resource: { type: 'string', minLength: 1 },
          expression: { type: 'string', minLength: 1 },
          clamp: { type: 'boolean', nullable: true },
        },
      },
    },
  },
};

const scoringSchema: JSONSchemaType<ScoringDefinition> = {
  type: 'object',
  additionalProperties: false,
  required: ['total'],
  properties: {
    total: { type: 'string', minLength: 1 },
    components: {
      type: 'object',
      nullable: true,
      additionalProperties: { type: 'string' },
    },
  },
};

const turnSchema: JSONSchemaType<TurnStructureDefinition> = {
  type: 'object',
  additionalProperties: false,
  required: ['limit'],
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
};

const endConditionSchema: JSONSchemaType<EndConditionDefinition> = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'limit'],
      properties: {
        type: { const: 'turnLimit' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'resource', 'comparison', 'value'],
      properties: {
        type: { const: 'resourceThreshold' },
        resource: { type: 'string', minLength: 1 },
        comparison: { enum: ['>', '>=', '<', '<=', '==', '!='] },
        value: { type: 'number' },
      },
    },
  ],
} as JSONSchemaType<EndConditionDefinition>;

const templateSchema: JSONSchemaType<GameTemplate> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'version', 'resources', 'dice', 'actions', 'turn', 'scoring', 'endConditions'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    locale: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    resources: { type: 'array', minItems: 1, items: resourceSchema },
    dice: { type: 'array', minItems: 1, items: diceSchema },
    actions: { type: 'array', minItems: 1, items: actionSchema },
    turn: turnSchema,
    scoring: scoringSchema,
    endConditions: { type: 'array', minItems: 1, items: endConditionSchema },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
  },
};

const validateTemplateSchema = ajv.compile(templateSchema);

function ensureUnique<T extends { id: string }>(items: T[], kind: string) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new TemplateValidationError(`${kind} identifiers must be unique`, [
        `${kind} '${item.id}' is defined more than once`,
      ]);
    }
    seen.add(item.id);
  }
}

function ensureResourceRefs(template: GameTemplate) {
  const resources = new Set(template.resources.map((resource) => resource.id));
  for (const action of template.actions) {
    for (const effect of action.effects) {
      if (!resources.has(effect.resource)) {
        throw new TemplateValidationError('Unknown resource reference', [
          `Action '${action.id}' references missing resource '${effect.resource}'`,
        ]);
      }
    }
  }
}

export function validateTemplate(template: unknown): GameTemplate {
  if (!validateTemplateSchema(template)) {
    const issues = validateTemplateSchema.errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim()) ?? [
      'Unknown validation error',
    ];
    throw new TemplateValidationError('Template validation failed', issues);
  }
  const typedTemplate = template as GameTemplate;
  ensureUnique(typedTemplate.resources, 'Resource');
  ensureUnique(typedTemplate.dice, 'Dice');
  ensureUnique(typedTemplate.actions, 'Action');
  ensureResourceRefs(typedTemplate);
  return typedTemplate;
}
