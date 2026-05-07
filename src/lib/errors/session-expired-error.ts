/**
 * Session Expired Error
 * Thrown when an API call receives a 401 response, indicating the user's session has expired.
 */
export class SessionExpiredError extends Error {
	constructor(message: string = 'Session expired') {
		super(message);
		this.name = 'SessionExpiredError';
	}
}
