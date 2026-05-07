export interface HotkeyDefinition {
	id: string;
	key: string;
	description: string;
}

export interface HotkeyHandler {
	id: string;
	handler: (event: KeyboardEvent) => boolean | void;
}
