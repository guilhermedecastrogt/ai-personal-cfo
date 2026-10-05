import { messageInterpretationJsonSchema } from './message-interpretation.schema.js';

interface JsonSchemaNode {
  readonly type?: unknown;
  readonly properties?: Record<string, JsonSchemaNode>;
  readonly required?: readonly string[];
  readonly additionalProperties?: unknown;
  readonly anyOf?: readonly JsonSchemaNode[];
}

function objectNodes(node: JsonSchemaNode): JsonSchemaNode[] {
  const children = [...Object.values(node.properties ?? {}), ...(node.anyOf ?? [])];
  const nested = children.flatMap(objectNodes);
  return node.type === 'object' ? [node, ...nested] : nested;
}

describe('message interpretation JSON schema', () => {
  const schema = messageInterpretationJsonSchema() as JsonSchemaNode;

  it('is an object at the root without a dialect declaration', () => {
    expect(schema.type).toBe('object');
    expect(Object.keys(schema)).not.toContain('$schema');
  });

  it('closes every object and requires every property, as strict structured output demands', () => {
    const objects = objectNodes(schema);

    expect(objects.length).toBeGreaterThan(3);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect([...(object.required ?? [])].sort()).toEqual(
        Object.keys(object.properties ?? {}).sort(),
      );
    }
  });

  it('offers no property through which a household or member could be chosen', () => {
    const text = JSON.stringify(schema);

    expect(text).not.toMatch(/householdId|household_id|memberId|member_id/);
  });

  it('carries the amount as text so the model performs no conversion', () => {
    const transaction = schema.properties?.transaction?.anyOf?.find(
      (node) => node.type === 'object',
    );

    expect(transaction?.properties?.amount?.type).toEqual(['string', 'null']);
    expect(Object.keys(transaction?.properties ?? {})).not.toContain('amountMinor');
  });
});
