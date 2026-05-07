/**
 * Error System Exports
 *
 * Centralized exports for the application error system.
 * Provides base error class, factory functions, and utility functions.
 */

// Base error class
export { AppError } from './app-error';
export { SessionExpiredError } from './session-expired-error';

// Error factory utilities
export { createErrorClass, rethrowUnless, isAppError, type ErrorClassConstructor } from './factory';

// Error utilities
export {
	getErrorMessage,
	withRetry,
	displayError,
	type RetryOptions,
	type DisplayOptions,
	type ToastStore
} from './utils';
