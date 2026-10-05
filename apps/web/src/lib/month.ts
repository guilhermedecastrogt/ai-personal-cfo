const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export type SearchParameters = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function requestedMonth(searchParams: SearchParameters): Promise<string | undefined> {
  const month = single((await searchParams).month);
  return month !== undefined && MONTH_KEY.test(month) ? month : undefined;
}
