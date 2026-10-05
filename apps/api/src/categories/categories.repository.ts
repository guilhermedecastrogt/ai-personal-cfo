import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { categories } from './categories.schema.js';

export type Category = typeof categories.$inferSelect;

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(): Promise<Category[]> {
    return this.database.select().from(categories).orderBy(asc(categories.name));
  }

  async findById(categoryId: string): Promise<Category | undefined> {
    const [category] = await this.database
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId));
    return category;
  }
}
