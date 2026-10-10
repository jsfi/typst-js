// Serves the example and pkg/ on http://localhost, the two directories of the repository the page and
// its service worker load (service workers need HTTPS or localhost). No dependencies:
//
//   node examples/browser/serve.mjs [port]   or   npm run example
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8000);

const types = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.otf': 'font/otf',
	'.ttf': 'font/ttf',
	'.typ': 'text/plain; charset=utf-8',
	'.bib': 'text/plain; charset=utf-8',
};

const PAGE = '/examples/browser/';
/** The directories served, each with its separator, so that `/pkg-other` is not inside `/pkg`. */
const served = ['examples/browser', 'pkg'].map((directory) => join(root, directory) + sep);

/** Answers a request: a file of the example or of pkg/, a redirect to the page, or an error. */
async function handle(request, response) {
	const reply = (status, text, headers = {}) =>
		response.writeHead(status, { 'Content-Type': 'text/plain', ...headers }).end(text);
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });
		return;
	}
	// Only a path, as browsers send it; an absolute URL as the target would name another host.
	if (!request.url.startsWith('/')) {
		reply(400, 'Bad request');
		return;
	}
	let path;
	try {
		path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
	} catch {
		reply(400, 'Bad request');
		return;
	}
	if (path === '/' || path === PAGE.slice(0, -1)) {
		// The query keeps a link's `?example=`.
		reply(302, '', { Location: PAGE + new URL(request.url, 'http://localhost').search });
		return;
	}
	const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
	const info = served.some((directory) => file.startsWith(directory))
		? await stat(file).catch(() => undefined)
		: undefined;
	if (!info?.isFile()) {
		reply(404, 'Not found');
		return;
	}
	response.writeHead(200, {
		'Content-Type': types[extname(file)] ?? 'application/octet-stream',
		'Content-Length': info.size,
		'Last-Modified': info.mtime.toUTCString(),
		// Revalidated on every load, so that a rebuilt pkg/ or an edited example shows at once.
		'Cache-Control': 'no-cache',
	});
	if (request.method === 'HEAD') {
		response.end();
		return;
	}
	createReadStream(file).pipe(response);
}

// `localhost` may resolve to either loopback address, so the server listens on both.
for (const host of ['127.0.0.1', '::1']) {
	createServer(handle)
		.on('error', (error) => console.warn(`Not serving on ${host}: ${error.message}`))
		.listen(port, host);
}
console.log(`Serving the example at http://localhost:${port}${PAGE}`);
