import pg from 'pg';

const { Pool } = pg;

async function resetMigrationTracking() {
	if (!process.env.DATABASE_URL) {
		console.error('❌ DATABASE_URL environment variable is not defined.');
		process.exit(1);
	}

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });

	try {
		console.log('Clearing drizzle.__drizzle_migrations tracking table...');
		await pool.query('TRUNCATE TABLE drizzle.__drizzle_migrations;');
		console.log(
			'✅ Migration tracking table cleared. Re-run db-migrate.js to re-apply all migrations.'
		);
		process.exit(0);
	} catch (error) {
		if (error.message?.includes('does not exist')) {
			console.log('ℹ️  drizzle.__drizzle_migrations does not exist yet — nothing to clear.');
			process.exit(0);
		}
		console.error('❌ Failed to clear migration tracking table:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

resetMigrationTracking();
