import { single } from './month';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORTS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const;
const MAXIMUM_TEXT_LENGTH = 100;

export interface TransactionQuery {
  readonly type?: string | undefined;
  readonly category?: string | undefined;
  readonly account?: string | undefined;
  readonly member?: string | undefined;
  readonly q?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly sort?: string | undefined;
}

type Parameters = Readonly<Record<string, string | string[] | undefined>>;

function dateOrNothing(value: string | undefined): string | undefined {
  return value !== undefined && ISO_DATE.test(value) ? value : undefined;
}

function textOrNothing(value: string | undefined): string | undefined {
  const text = value?.trim().slice(0, MAXIMUM_TEXT_LENGTH);
  return text === undefined || text === '' ? undefined : text;
}

export function readTransactionQuery(parameters: Parameters): TransactionQuery {
  const sort = single(parameters.sort);
  return {
    type: single(parameters.type),
    category: single(parameters.category),
    account: single(parameters.account),
    member: single(parameters.member),
    q: textOrNothing(single(parameters.q)),
    from: dateOrNothing(single(parameters.from)),
    to: dateOrNothing(single(parameters.to)),
    sort: SORTS.find((option) => option === sort),
  };
}

export function withoutRange(query: TransactionQuery): TransactionQuery {
  return { ...query, from: undefined, to: undefined };
}
