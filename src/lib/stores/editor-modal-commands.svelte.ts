export type EditorModalKey = 'info' | 'import' | 'publish' | 'share';

type EditorModalCommand =
	| { type: 'open'; key: EditorModalKey; token: number }
	| { type: 'closeAll'; token: number };

class EditorModalCommandsStore {
	command = $state<EditorModalCommand | null>(null);
	private tokenCounter = 0;

	openModal(key: EditorModalKey): void {
		this.tokenCounter += 1;
		this.command = { type: 'open', key, token: this.tokenCounter };
	}

	closeAll(): void {
		this.tokenCounter += 1;
		this.command = { type: 'closeAll', token: this.tokenCounter };
	}
}

export const editorModalCommandsStore = new EditorModalCommandsStore();
