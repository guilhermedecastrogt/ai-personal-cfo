export class MissingRowError extends Error {
  constructor() {
    super('Expected the statement to return a row');
    this.name = MissingRowError.name;
  }
}

export function requireRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows;
  if (row === undefined) {
    throw new MissingRowError();
  }
  return row;
}
