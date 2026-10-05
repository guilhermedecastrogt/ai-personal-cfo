export interface CategoryNode {
  readonly id: string;
  readonly parentId: string | null;
}

export class CategoryTree {
  private readonly parentById: ReadonlyMap<string, string | null>;

  constructor(nodes: readonly CategoryNode[]) {
    this.parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  }

  lineageOf(categoryId: string): string[] {
    const lineage: string[] = [];
    let current: string | null | undefined = categoryId;
    while (current !== null && current !== undefined && !lineage.includes(current)) {
      lineage.push(current);
      current = this.parentById.get(current);
    }
    return lineage;
  }

  isWithin(categoryId: string | null, ancestorId: string): boolean {
    return categoryId !== null && this.lineageOf(categoryId).includes(ancestorId);
  }
}
