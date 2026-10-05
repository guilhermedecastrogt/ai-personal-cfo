import { pngImage } from '../../media/testing/fake-media-source.fixture.js';
import { AIProviderError } from '../ai-provider.js';
import { FakeAIProvider, imageReading } from '../testing/fake-ai-provider.fixture.js';
import { imageExtractionJsonSchema } from './image-extraction.schema.js';
import { ImageTransactionReader } from './image-transaction-reader.js';

const REQUEST = {
  image: { mimeType: 'image/png' as const, bytes: pngImage() },
  caption: null,
  accountNames: ['Joint Account'],
  categories: [],
};

async function read(output: unknown): Promise<unknown> {
  return new ImageTransactionReader(new FakeAIProvider().willReadImageAs(output)).read(REQUEST);
}

async function failureOf(output: unknown): Promise<string> {
  try {
    await read(output);
  } catch (error) {
    return error instanceof AIProviderError ? error.category : 'unexpected error';
  }
  return 'no failure';
}

describe('ImageTransactionReader', () => {
  it('returns the single transaction an image shows', async () => {
    expect(await read(imageReading({ amount: '23.50', merchant: 'Tesco' }))).toMatchObject({
      kind: 'SINGLE_TRANSACTION',
      transaction: { amount: '23.50', merchant: 'Tesco' },
    });
  });

  it('reports several transactions without choosing one', async () => {
    const output = { kind: 'MULTIPLE_TRANSACTIONS', transaction: null, transactionCount: 12 };

    expect(await read(output)).toEqual({ kind: 'MULTIPLE_TRANSACTIONS', transactionCount: 12 });
  });

  it('ignores a transaction attached to an image reported as holding several', async () => {
    const output = {
      ...(imageReading() as object),
      kind: 'MULTIPLE_TRANSACTIONS',
      transactionCount: null,
    };

    expect(await read(output)).toEqual({ kind: 'MULTIPLE_TRANSACTIONS', transactionCount: null });
  });

  it.each(['NOT_FINANCIAL', 'UNREADABLE'])('reports an image that is %s', async (kind) => {
    expect(await read({ kind, transaction: null, transactionCount: null })).toEqual({ kind });
  });

  it.each([
    ['prose', 'This is a Tesco receipt for 23.50'],
    ['an unknown kind', { kind: 'RECEIPT', transaction: null, transactionCount: null }],
    [
      'a single transaction without the transaction',
      { kind: 'SINGLE_TRANSACTION', transaction: null, transactionCount: null },
    ],
    ['a numeric amount', imageReading({ amount: 23.5 as unknown as string })],
    [
      'an array of transactions',
      { kind: 'SINGLE_TRANSACTION', transaction: [], transactionCount: null },
    ],
  ])('rejects %s as an invalid response', async (_description, output) => {
    expect(await failureOf(output)).toBe('INVALID_RESPONSE');
  });

  it('uses the same candidate schema as text extraction', () => {
    const schema = imageExtractionJsonSchema() as {
      properties: { transaction: { anyOf: { properties?: Record<string, unknown> }[] } };
    };
    const candidate = schema.properties.transaction.anyOf.find(
      (node) => node.properties !== undefined,
    );

    expect(Object.keys(candidate?.properties ?? {}).sort()).toEqual([
      'account',
      'amount',
      'category',
      'confidence',
      'currency',
      'date',
      'description',
      'merchant',
      'paymentMethod',
      'transferAccount',
      'type',
    ]);
    expect(JSON.stringify(schema)).not.toMatch(/householdId|memberId|url/i);
  });
});
