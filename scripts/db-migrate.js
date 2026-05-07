import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import path from 'path';

const { Pool } = pg;

async function runMigrations() {
	if (!process.env.DATABASE_URL) {
		console.error('❌ DATABASE_URL environment variable is not defined.');
		process.exit(1);
	}

	console.log('Running migrations...');

	const pool = new Pool({
		connectionString: process.env.DATABASE_URL
	});

	const db = drizzle(pool);

	try {
		// Look for migrations in the 'drizzle/migrations' folder relative to the app root
		const migrationsFolder = path.resolve(process.cwd(), 'drizzle/migrations');
		console.log(`Reading migrations from: ${migrationsFolder}`);

		await migrate(db, { migrationsFolder });

		console.log('✅ Migrations completed successfully.');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

runMigrations();
