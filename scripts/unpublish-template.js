import pg from 'pg';

const { Client } = pg;

const UUID_REGEX =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

async function unpublishTemplate() {
	const templateId = process.argv[2] ?? process.env.TEMPLATE_ID;

	if (!templateId) {
		console.error('ERROR: TEMPLATE_ID is required (UUID).');
		process.exit(1);
	}

	if (!UUID_REGEX.test(templateId)) {
		console.error('ERROR: TEMPLATE_ID must be a valid UUID.');
		process.exit(1);
	}

	if (!process.env.DATABASE_URL) {
		console.error('ERROR: DATABASE_URL environment variable is not defined.');
		process.exit(1);
	}

	const client = new Client({
		connectionString: process.env.DATABASE_URL
	});
	let inTransaction = false;

	try {
		await client.connect();
		await client.query('BEGIN');
		inTransaction = true;

		const templateResult = await client.query(
			`SELECT document_id
			 FROM templates
			 WHERE id = $1::uuid
			   AND is_published = true
			 FOR UPDATE`,
			[templateId]
		);

		if (templateResult.rowCount === 0) {
			throw new Error(`Template ${templateId} was not found or is already unpublished`);
		}

		const documentId = templateResult.rows[0].document_id;

		await client.query(
			`UPDATE templates
			 SET is_published = false,
			     updated_at = NOW()
			 WHERE id = $1::uuid`,
			[templateId]
		);

		if (documentId) {
			await client.query('DELETE FROM documents WHERE id = $1::uuid', [documentId]);
		}

		await client.query('COMMIT');
		inTransaction = false;
		console.log(`Template ${templateId} successfully unpublished.`);
		process.exit(0);
	} catch (error) {
		if (inTransaction) {
			await client.query('ROLLBACK');
		}
		console.error('ERROR: Failed to unpublish template:', error.message);
		process.exit(1);
	} finally {
		await client.end();
	}
}

unpublishTemplate();
