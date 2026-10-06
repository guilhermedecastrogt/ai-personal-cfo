import type { Database } from './database.js';

export type DatabaseExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
