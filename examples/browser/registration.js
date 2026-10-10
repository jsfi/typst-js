// Registering the service worker that compiles, and waiting until it controls the page.

import { CLAIM, MODULE_PATH } from './protocol.js';

/**
 * Resolves once the service worker controls this page, which the first visit has to wait for while
 * it loads the module; `statusLine` says so meanwhile. Throws where service workers, or module
 * service workers, are not available.
 */
export async function serviceWorker(statusLine) {
	if (!('serviceWorker' in navigator)) {
		throw new Error(
			'This browser has no service workers, or the page is not served over HTTPS or localhost.',
		);
	}
	try {
		await navigator.serviceWorker.register('./service-worker.js', { type: 'module' });
	} catch (error) {
		throw new Error(
			`The service worker could not be registered (${error.message}). It is an ES module, which Firefox ` +
				'does not support in service workers; use a Chromium-based browser or Safari.',
		);
	}
	if (navigator.serviceWorker.controller) return;
	const size = await moduleSize();
	statusLine.textContent = `Loading Typst (${size ? `${size} MB` : 'the module'} and its fonts, cached for later visits)…`;
	const controlled = new Promise((resolve) =>
		navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
	);
	// A first visit is claimed once the worker has activated. A hard reload bypasses an active worker,
	// which then has to be asked to claim the page.
	const registration = await navigator.serviceWorker.ready;
	if (navigator.serviceWorker.controller) return;
	registration.active?.postMessage(CLAIM);
	const declined = new Promise((_, reject) =>
		setTimeout(
			() =>
				reject(new Error('The service worker did not take over this page; reload it normally.')),
			CLAIM_TIMEOUT_MS,
		),
	);
	await Promise.race([controlled, declined]);
}

/** How long a worker, once asked, may take to claim the page before the page gives up. */
const CLAIM_TIMEOUT_MS = 5000;

/** The module's download size in MB as the server reports it, or `undefined`. */
async function moduleSize() {
	try {
		const response = await fetch(new URL(MODULE_PATH, location.href), {
			method: 'HEAD',
		});
		const bytes = Number(response.headers.get('Content-Length'));
		return bytes > 0 ? Math.round(bytes / 1e6) : undefined;
	} catch {
		return undefined;
	}
}
