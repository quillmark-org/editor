import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run preview',
		url: 'http://127.0.0.1:4173/api/health',
		timeout: 120000,
		reuseExistingServer: !process.env.CI
	},
	testDir: 'e2e',
	timeout: 30000,
	use: {
		baseURL: 'http://127.0.0.1:4173'
	}
});
