/**
 * Error System Tests
 * Tests for AppError base class, factory, and error utilities
 */

import { describe, it, expect } from 'vitest';
import { AppError } from './app-error';
import { SessionExpiredError } from './session-expired-error';
import { createErrorClass, rethrowUnless, isAppError } from './factory';
import { getErrorMessage, withRetry } from './utils';

// Create a concrete test error class for testing (manual approach)
class TestError extends AppError {
	code: 'test_error' | 'another_error';

	constructor(code: 'test_error' | 'another_error', message: string, statusCode?: number) {
		super(code, message, statusCode);
		this.name = 'TestError';
		this.code = code;
	}
}

// Create a factory-generated error class for testing
type FactoryTestErrorCode = 'factory_error' | 'another_factory_error';
const FactoryTestError = createErrorClass<FactoryTestErrorCode>('FactoryTestError');

describe('AppError', () => {
	it('should create error with code and message', () => {
		const error = new TestError('test_error', 'Test message', 400);

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(AppError);
		expect(error.code).toBe('test_error');
		expect(error.message).toBe('Test message');
		expect(error.statusCode).toBe(400);
		expect(error.name).toBe('TestError');
	});

	it('should default to status code 500 if not provided', () => {
		const error = new TestError('test_error', 'Test message');

		expect(error.statusCode).toBe(500);
	});

	it('should have stack trace', () => {
		const error = new TestError('test_error', 'Test message');

		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('TestError');
	});

	it('should support optional hint and context', () => {
		const error = new TestError('test_error', 'Test message', 400);
		error.hint = 'Try this instead';
		error.context = { userId: '123', action: 'create' };

		expect(error.hint).toBe('Try this instead');
		expect(error.context).toEqual({ userId: '123', action: 'create' });
	});

	it('should work with instanceof checks', () => {
		const error = new TestError('test_error', 'Test message');

		expect(error instanceof AppError).toBe(true);
		expect(error instanceof TestError).toBe(true);
		expect(error instanceof Error).toBe(true);
	});
});

describe('getErrorMessage', () => {
	it('should extract message from AppError', () => {
		const error = new TestError('test_error', 'AppError message');
		const message = getErrorMessage(error);

		expect(message).toBe('AppError message');
	});

	it('should extract message from standard Error', () => {
		const error = new Error('Standard error message');
		const message = getErrorMessage(error);

		expect(message).toBe('Standard error message');
	});

	it('should return string error as-is', () => {
		const message = getErrorMessage('String error message');

		expect(message).toBe('String error message');
	});

	it('should return default fallback for unknown error types', () => {
		const message = getErrorMessage({ unknown: 'object' });

		expect(message).toBe('An unexpected error occurred');
	});

	it('should return custom fallback for unknown error types', () => {
		const message = getErrorMessage({ unknown: 'object' }, 'Custom fallback');

		expect(message).toBe('Custom fallback');
	});

	it('should handle null and undefined', () => {
		expect(getErrorMessage(null)).toBe('An unexpected error occurred');
		expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
		expect(getErrorMessage(null, 'Custom')).toBe('Custom');
		expect(getErrorMessage(undefined, 'Custom')).toBe('Custom');
	});
});

describe('withRetry', () => {
	it('should succeed on first attempt', async () => {
		let attempts = 0;
		const fn = async () => {
			attempts++;
			return 'success';
		};

		const result = await withRetry(fn);

		expect(result).toBe('success');
		expect(attempts).toBe(1);
	});

	it('should retry on failure and eventually succeed', async () => {
		let attempts = 0;
		const fn = async () => {
			attempts++;
			if (attempts < 3) {
				throw new Error('Temporary failure');
			}
			return 'success';
		};

		const result = await withRetry(fn, { maxAttempts: 3, delay: 10 });

		expect(result).toBe('success');
		expect(attempts).toBe(3);
	});

	it('should throw error after max attempts', async () => {
		let attempts = 0;
		const fn = async () => {
			attempts++;
			throw new Error('Persistent failure');
		};

		await expect(withRetry(fn, { maxAttempts: 3, delay: 10 })).rejects.toThrow(
			'Persistent failure'
		);
		expect(attempts).toBe(3);
	});

	it('should use exponential backoff', async () => {
		const timestamps: number[] = [];
		let attempts = 0;
		const fn = async () => {
			timestamps.push(Date.now());
			attempts++;
			if (attempts < 3) {
				throw new Error('Retry needed');
			}
			return 'success';
		};

		await withRetry(fn, { maxAttempts: 3, delay: 50, backoff: 2 });

		expect(attempts).toBe(3);
		expect(timestamps.length).toBe(3);

		// Verify delays (with tolerance for timing variations)
		const delay1 = timestamps[1] - timestamps[0];
		const delay2 = timestamps[2] - timestamps[1];

		// First delay should be ~50ms, second should be ~100ms (50 * 2)
		expect(delay1).toBeGreaterThanOrEqual(40); // Allow some tolerance
		expect(delay1).toBeLessThan(80);
		expect(delay2).toBeGreaterThanOrEqual(80);
		expect(delay2).toBeLessThan(150);
	});

	it('should respect shouldRetry predicate', async () => {
		let attempts = 0;
		const fn = async () => {
			attempts++;
			throw new TestError('test_error', 'Test error');
		};

		const shouldRetry = (error: unknown) => {
			// Don't retry for TestError
			return !(error instanceof TestError);
		};

		await expect(withRetry(fn, { maxAttempts: 3, delay: 10, shouldRetry })).rejects.toThrow(
			'Test error'
		);
		expect(attempts).toBe(1); // Should not retry
	});

	it('should use constant delay when backoff is 1', async () => {
		const timestamps: number[] = [];
		let attempts = 0;
		const fn = async () => {
			timestamps.push(Date.now());
			attempts++;
			if (attempts < 3) {
				throw new Error('Retry needed');
			}
			return 'success';
		};

		await withRetry(fn, { maxAttempts: 3, delay: 50, backoff: 1 });

		expect(attempts).toBe(3);

		// Both delays should be approximately the same
		const delay1 = timestamps[1] - timestamps[0];
		const delay2 = timestamps[2] - timestamps[1];

		expect(delay1).toBeGreaterThanOrEqual(40);
		expect(delay1).toBeLessThan(80);
		expect(delay2).toBeGreaterThanOrEqual(40);
		expect(delay2).toBeLessThan(80);
	});
});

describe('createErrorClass', () => {
	it('should create an error class with the specified name', () => {
		const error = new FactoryTestError('factory_error', 'Test message');

		expect(error.name).toBe('FactoryTestError');
	});

	it('should create error with code and message', () => {
		const error = new FactoryTestError('factory_error', 'Test message', 400);

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(AppError);
		expect(error.code).toBe('factory_error');
		expect(error.message).toBe('Test message');
		expect(error.statusCode).toBe(400);
	});

	it('should use default status code of 400', () => {
		const error = new FactoryTestError('factory_error', 'Test message');

		expect(error.statusCode).toBe(400);
	});

	it('should allow custom default status code', () => {
		const ServerError = createErrorClass<'server_error'>('ServerError', 500);
		const error = new ServerError('server_error', 'Server error');

		expect(error.statusCode).toBe(500);
	});

	it('should allow overriding status code per instance', () => {
		const ServerError = createErrorClass<'server_error'>('ServerError', 500);
		const error = new ServerError('server_error', 'Not found', 404);

		expect(error.statusCode).toBe(404);
	});

	it('should work with instanceof checks', () => {
		const error = new FactoryTestError('factory_error', 'Test message');

		expect(error instanceof AppError).toBe(true);
		expect(error instanceof FactoryTestError).toBe(true);
		expect(error instanceof Error).toBe(true);
	});

	it('should have stack trace', () => {
		const error = new FactoryTestError('factory_error', 'Test message');

		expect(error.stack).toBeDefined();
		expect(error.stack).toContain('FactoryTestError');
	});

	it('should support hint and context like manual errors', () => {
		const error = new FactoryTestError('factory_error', 'Test message');
		error.hint = 'Try this instead';
		error.context = { userId: '123' };

		expect(error.hint).toBe('Try this instead');
		expect(error.context).toEqual({ userId: '123' });
	});
});

describe('rethrowUnless', () => {
	it('should rethrow AppError instances without mapping', () => {
		const originalError = new FactoryTestError('factory_error', 'Original error', 400);
		const mapper = () => new FactoryTestError('another_factory_error', 'Mapped error', 500);

		expect(() => {
			rethrowUnless(originalError, AppError, mapper);
		}).toThrow(originalError);
	});

	it('should map non-AppError instances', () => {
		const originalError = new Error('Standard error');
		const mappedError = new FactoryTestError('another_factory_error', 'Mapped error', 500);
		const mapper = () => mappedError;

		expect(() => {
			rethrowUnless(originalError, AppError, mapper);
		}).toThrow(mappedError);
	});

	it('should pass unknown error to mapper', () => {
		const originalError = { custom: 'error' };
		let receivedError: unknown;
		const mapper = (err: unknown) => {
			receivedError = err;
			return new FactoryTestError('factory_error', 'Mapped', 500);
		};

		try {
			rethrowUnless(originalError, AppError, mapper);
		} catch {
			// Expected
		}

		expect(receivedError).toBe(originalError);
	});

	it('should work with specific error subclasses', () => {
		const factoryError = new FactoryTestError('factory_error', 'Factory error');
		const testError = new TestError('test_error', 'Test error');
		const mapper = () => new FactoryTestError('another_factory_error', 'Mapped', 500);

		// FactoryTestError should be rethrown when checking against AppError
		expect(() => {
			rethrowUnless(factoryError, AppError, mapper);
		}).toThrow(factoryError);

		// TestError should also be rethrown when checking against AppError
		expect(() => {
			rethrowUnless(testError, AppError, mapper);
		}).toThrow(testError);
	});
});

describe('isAppError', () => {
	it('should return true for AppError instances', () => {
		const error = new FactoryTestError('factory_error', 'Test');

		expect(isAppError(error)).toBe(true);
	});

	it('should return true for manual AppError subclasses', () => {
		const error = new TestError('test_error', 'Test');

		expect(isAppError(error)).toBe(true);
	});

	it('should return false for standard Error', () => {
		const error = new Error('Standard error');

		expect(isAppError(error)).toBe(false);
	});

	it('should return false for non-Error objects', () => {
		expect(isAppError({ message: 'fake error' })).toBe(false);
		expect(isAppError('string error')).toBe(false);
		expect(isAppError(null)).toBe(false);
		expect(isAppError(undefined)).toBe(false);
	});
});

describe('SessionExpiredError', () => {
	it('should create error with default message', () => {
		const error = new SessionExpiredError();

		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(SessionExpiredError);
		expect(error.name).toBe('SessionExpiredError');
		expect(error.message).toBe('Session expired');
	});

	it('should create error with custom message', () => {
		const error = new SessionExpiredError('Custom expired message');

		expect(error.message).toBe('Custom expired message');
		expect(error.name).toBe('SessionExpiredError');
	});

	it('should be distinguishable via instanceof', () => {
		const sessionError = new SessionExpiredError();
		const genericError = new Error('Generic error');

		expect(sessionError instanceof SessionExpiredError).toBe(true);
		expect(genericError instanceof SessionExpiredError).toBe(false);
	});

	it('should work with getErrorMessage', () => {
		const error = new SessionExpiredError();

		expect(getErrorMessage(error)).toBe('Session expired');
	});
});
