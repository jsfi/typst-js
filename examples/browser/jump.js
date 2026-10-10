// The link-like buttons in the diagnostics and the outline, which jump to a place.

/** A button reading `text` that runs `onClick`; `title` says where it jumps. */
export function jumpButton(text, title, onClick) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'jump';
	button.textContent = text;
	if (title) button.title = title;
	button.addEventListener('click', onClick);
	return button;
}
