import { CategoryTree } from './category-tree.js';

const TREE = new CategoryTree([
  { id: 'food', parentId: null },
  { id: 'groceries', parentId: 'food' },
  { id: 'organic', parentId: 'groceries' },
  { id: 'transport', parentId: null },
]);

describe('CategoryTree', () => {
  it('lists a category followed by its ancestors', () => {
    expect(TREE.lineageOf('organic')).toEqual(['organic', 'groceries', 'food']);
    expect(TREE.lineageOf('food')).toEqual(['food']);
  });

  it('treats an unknown category as its own lineage', () => {
    expect(TREE.lineageOf('unknown')).toEqual(['unknown']);
  });

  it('places a category within itself and its ancestors only', () => {
    expect(TREE.isWithin('groceries', 'food')).toBe(true);
    expect(TREE.isWithin('food', 'food')).toBe(true);
    expect(TREE.isWithin('food', 'groceries')).toBe(false);
    expect(TREE.isWithin('transport', 'food')).toBe(false);
    expect(TREE.isWithin(null, 'food')).toBe(false);
  });

  it('terminates on a cyclic hierarchy', () => {
    const cyclic = new CategoryTree([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);

    expect(cyclic.lineageOf('a')).toEqual(['a', 'b']);
  });
});
