import { arrangeByHierarchy, type CategoryTotal } from './category-hierarchy.js';
import { CategoryTree } from './category-tree.js';

const TREE = new CategoryTree([
  { id: 'housing', parentId: null },
  { id: 'rent', parentId: 'housing' },
  { id: 'food', parentId: null },
  { id: 'coffee', parentId: 'food' },
  { id: 'groceries', parentId: 'food' },
  { id: 'organic', parentId: 'groceries' },
  { id: 'transport', parentId: null },
]);

const row = (categoryId: string | null, totalMinor: number): CategoryTotal => ({
  categoryId,
  totalMinor,
});

const order = (rows: readonly CategoryTotal[]): (string | null)[] => rows.map((r) => r.categoryId);

describe('arrangeByHierarchy', () => {
  it('places every subcategory directly under its own parent', () => {
    const arranged = arrangeByHierarchy(
      [
        row('housing', 1800),
        row('rent', 1800),
        row('food', 420),
        row('transport', 60),
        row('coffee', 50),
      ],
      TREE,
    );

    expect(order(arranged)).toEqual(['housing', 'rent', 'food', 'coffee', 'transport']);
    expect(arranged.map((r) => r.parentId)).toEqual([null, 'housing', null, 'food', null]);
  });

  it('orders siblings by total and gives each child its share of the parent', () => {
    const arranged = arrangeByHierarchy(
      [row('food', 400), row('coffee', 100), row('groceries', 300)],
      TREE,
    );

    expect(order(arranged)).toEqual(['food', 'groceries', 'coffee']);
    expect(arranged.map((r) => r.shareOfParentBasisPoints)).toEqual([null, 7500, 2500]);
  });

  it('keeps uncategorised spending among the top-level rows by its total', () => {
    const arranged = arrangeByHierarchy(
      [row('food', 500), row('coffee', 500), row(null, 200), row('transport', 100)],
      TREE,
    );

    expect(order(arranged)).toEqual(['food', 'coffee', null, 'transport']);
  });

  it('walks deeper levels depth first', () => {
    const arranged = arrangeByHierarchy(
      [row('food', 900), row('groceries', 600), row('organic', 200), row('coffee', 300)],
      TREE,
    );

    expect(order(arranged)).toEqual(['food', 'groceries', 'organic', 'coffee']);
    expect(arranged[2]).toMatchObject({ parentId: 'groceries', shareOfParentBasisPoints: 3333 });
  });

  it('attaches a row to its nearest ancestor present in the list', () => {
    const arranged = arrangeByHierarchy([row('food', 900), row('organic', 200)], TREE);

    expect(arranged[1]).toMatchObject({ categoryId: 'organic', parentId: 'food' });
  });

  it('treats a row whose parent is missing as top level', () => {
    expect(arrangeByHierarchy([row('coffee', 50)], TREE)[0]).toMatchObject({
      parentId: null,
      shareOfParentBasisPoints: null,
    });
  });

  it('keeps every row of a cyclic hierarchy', () => {
    const cyclic = new CategoryTree([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);

    expect(order(arrangeByHierarchy([row('a', 2), row('b', 1)], cyclic)).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('carries the other fields of each row', () => {
    const arranged = arrangeByHierarchy([{ ...row('food', 10), label: 'Food' }], TREE);

    expect(arranged[0]).toMatchObject({ label: 'Food' });
  });
});
