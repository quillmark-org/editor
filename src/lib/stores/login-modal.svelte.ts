export type LoginModalAction = 'publish' | 'share' | 'save' | 'star' | 'session_expired';

export interface LoginModalOptions {
	documentName?: string;
}

export interface LoginModalState {
	action: LoginModalAction;
	documentName?: string;
}

class LoginModalStore {
	current = $state<LoginModalState | null>(null);

	show(action: LoginModalAction, options: LoginModalOptions = {}): void {
		this.current = {
			action,
			documentName: options.documentName
		};
	}

	hide(): void {
		this.current = null;
	}

	get isOpen(): boolean {
		return this.current !== null;
	}
}

export const loginModalStore = new LoginModalStore();
