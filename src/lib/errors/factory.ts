/**
 * Error Factory Utilities
 *
 * Provides factory functions to create typed error classes and handle
 * common error patterns, reducing boilerplate across the codebase.
 */

import { AppError } from './app-error';

/**
 * Type for the constructor of an error class created by the factory
 */
export interface ErrorClassConstructor<C extends string> {
	new (code: C, message: string, statusCode?: number): AppError & { code: C };
	prototype: AppError;
}

/**
 * Create a typed error class that extends AppError
 *
 * This factory eliminates the repetitive boilerplate of defining error classes
 * that all follow the same pattern of (code, message, statusCode).
 *
 * @param name - The name property for the error class (e.g., 'DocumentError')
 * @param defaultStatusCode - Default HTTP status code (default: 400)
 * @returns A new error class constructor
 *
 * @example
 * ```typescript
 * type MyErrorCode = 'not_found' | 'invalid_input';
 * const MyError = createErrorClass<MyErrorCode>('MyError');
 *
 * throw new MyError('not_found', 'Resource not found', 404);
 * ```
 */
export function createErrorClass<C extends string>(
	name: string,
	defaultStatusCode: number = 400
): ErrorClassConstructor<C> {
	// Create the error class
	const ErrorClass = class extends AppError {
		code: C;

		constructor(code: C, message: string, statusCode: number = defaultStatusCode) {
			super(code, message, statusCode);
			this.name = name;
			this.code = code;
		}
	};

	// Set the class name for better debugging
	Object.defineProperty(ErrorClass, 'name', { value: name });

	return ErrorClass as ErrorClassConstructor<C>;
}

/**
 * Rethrow the error if it's already an instance of the specified error class,
 * otherwise transform it using the provided mapper function.
 *
 * This utility eliminates the repetitive pattern:
 * ```typescript
 * catch (error) {
 *   if (error instanceof MyError) throw error;
 *   throw mapError(error);
 * }
 * ```
 *
 * @param error - The caught error
 * @param ErrorClass - The error class to check against
 * @param mapper - Function to transform unknown errors
 * @throws Always throws - either the original error or the mapped result
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   rethrowUnless(error, DocumentError, mapDrizzleError);
 * }
 * ```
 */
export function rethrowUnless<E extends AppError>(
	error: unknown,
	ErrorClass: abstract new (...args: never[]) => E,
	mapper: (error: unknown) => AppError
): never {
	if (error instanceof ErrorClass) {
		throw error;
	}
	throw mapper(error);
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
	return error instanceof AppError;
}
