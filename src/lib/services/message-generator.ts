export type MessageCategory = 'completion' | 'placeholder';

const messages: Record<MessageCategory, string[]> = {
	completion: [
		'All set!',
		'Done!',
		'Complete!',
		'Good to go!',
		'Mission complete!',
		'Finished!',
		'Check!',
		'Squared away!',
		"Job's finished!",
		'Winchester!',
		'Locked in!',
		'Great success!',
		'Very nice!',
		'MILLER TIME!'
	],
	placeholder: [
		'Start writing...',
		'Hello world...',
		'Just write...',
		'Words go here...',
		'Off we go...',
		"Let's roll...",
		'Pen to paper...',
		'Write something...',
		'Start typing...',
		'Just flow...',
		'Dive in...',
		'Full send...'
	]
};

/**
 * Returns a random message for the given category.
 * @param category The category of message to retrieve.
 * @returns A random message string.
 */
export function getRandomMessage(category: MessageCategory): string {
	const categoryMessages = messages[category];
	const randomIndex = Math.floor(Math.random() * categoryMessages.length);
	return categoryMessages[randomIndex];
}
