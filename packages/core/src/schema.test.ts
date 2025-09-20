import { describe, expect, it } from 'vitest';
import { TemplateValidationError, validateTemplate } from './schema';
import { meteorMinersTemplate } from './templates';

const baseTemplate = validateTemplate(meteorMinersTemplate);

describe('Template schema', () => {
  it('accepts the Meteor Miners template', () => {
    expect(baseTemplate.id).toBe('meteor-miners');
    expect(baseTemplate.actions).toHaveLength(5);
  });

  it('rejects duplicate resource identifiers', () => {
    const invalid = {
      ...baseTemplate,
      resources: [
        { id: 'dup', label: 'Duplicate', initial: 0 },
        { id: 'dup', label: 'Duplicate Again', initial: 1 },
      ],
    };
    expect(() => validateTemplate(invalid)).toThrow(TemplateValidationError);
  });

  it('rejects actions that reference unknown resources', () => {
    const invalid = {
      ...baseTemplate,
      actions: [
        {
          id: 'bad',
          label: 'Bad',
          priority: 0,
          effects: [{ resource: 'missing', expression: '1' }],
        },
      ],
    };
    expect(() => validateTemplate(invalid)).toThrow(TemplateValidationError);
  });
});
