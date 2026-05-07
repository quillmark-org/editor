/**
 * Database Factory
 * Creates Drizzle ORM database instances. Driver is selected by db.driver in
 * deployment YAML; DATABASE_URL secret is asserted at boot for pg/neon.
 *
 * Supported drivers:
 * - pglite: In-memory PostgreSQL for local development
 * - neon: Neon serverless driver (WebSocket) for cloud deployments
 * - pg: node-postgres for self-hosted PostgreSQL
 */

import { env } from '$env/dynamic/private';
import { getServerConfig } from '$lib/config/load.server';
import * as schema from './schema';

type DatabaseInstance = Awaited<ReturnType<typeof createDatabase>>;

let db: DatabaseInstance | null = null;
let dbInitPromise: Promise<DatabaseInstance> | null = null;

async function createDatabase() {
	const driver = getServerConfig().db.driver;

	console.log(`[DB] Initializing database with driver: ${driver}`);
	if (driver === 'pglite') {
		console.warn('[DB] ⚠️  Using in-memory database (pglite). Data will be lost on restart.');
	}

	switch (driver) {
		case 'pglite': {
			const { PGlite } = await import('@electric-sql/pglite');
			const { drizzle } = await import('drizzle-orm/pglite');
			const client = new PGlite();
			await applyMigrations(client);
			return drizzle(client, { schema });
		}
		case 'neon': {
			const { Pool } = await import('@neondatabase/serverless');
			const { drizzle } = await import('drizzle-orm/neon-serverless');
			const pool = new Pool({ connectionString: env.DATABASE_URL });
			return drizzle(pool, { schema });
		}
		case 'pg': {
			const { Pool } = await import('pg');
			const { drizzle } = await import('drizzle-orm/node-postgres');
			const pool = new Pool({ connectionString: env.DATABASE_URL });
			return drizzle(pool, { schema });
		}
	}
}

/**
 * Apply database migrations using Drizzle-generated SQL
 * This reads and executes migrations from the drizzle/migrations directory
 */
async function applyMigrations(client: InstanceType<typeof import('@electric-sql/pglite').PGlite>) {
	// Read and execute migration file(s)
	// For pglite we use the Drizzle-generated migration SQL
	const fs = await import('fs');
	const path = await import('path');

	const migrationsDir = path.resolve(process.cwd(), 'drizzle/migrations');

	// Check if migrations directory exists
	if (!fs.existsSync(migrationsDir)) {
		throw new Error(
			`Migrations directory not found at ${migrationsDir}. pglite requires local migrations to boot.`
		);
	}

	console.log(`[DB] 📂 Found migrations directory at ${migrationsDir}`);

	try {
		const files = fs
			.readdirSync(migrationsDir)
			.filter((f: string) => f.endsWith('.sql'))
			.sort();

		console.log(`[DB] 📜 Found ${files.length} migration files: ${files.join(', ')}`);

		for (const file of files) {
			console.log(`[DB] 🚀 Applying migration: ${file}`);
			const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
			// Split by Drizzle's statement separator
			const statements = sql.split('--> statement-breakpoint');

			console.log(`[DB] 🔢 Found ${statements.length} statements in ${file}`);

			for (let i = 0; i < statements.length; i++) {
				const statement = statements[i];
				const trimmed = statement.trim();
				if (trimmed) {
					try {
						await client.exec(trimmed);
					} catch (stmtError: unknown) {
						const message =
							stmtError instanceof Error ? stmtError.message : 'Unknown migration execution error';
						console.error(`[DB] ❌ Error in statement ${i + 1} of ${file}:`, message);
						console.error(`[DB] 📝 Statement: ${trimmed.substring(0, 100)}...`);
						throw stmtError;
					}
				}
			}
		}
		console.log(`[DB] ✅ Applied ${files.length} migration(s) to pglite`);
	} catch (error) {
		console.error('[DB] ❌ Failed to apply migrations:', error);
		throw error;
	}
}
/**
 * Get the singleton database instance
 * Creates a new connection on first call, reuses existing connection thereafter
 */
export async function getDb(): Promise<DatabaseInstance> {
	if (db) return db;

	if (!dbInitPromise) {
		dbInitPromise = createDatabase()
			.then((instance) => {
				db = instance;
				return instance;
			})
			.finally(() => {
				dbInitPromise = null;
			});
	}

	return dbInitPromise;
}

/**
 * Reset the database connection (for testing)
 */
export function resetDb(): void {
	db = null;
	dbInitPromise = null;
}

// Re-export schema for convenience
export { schema };
