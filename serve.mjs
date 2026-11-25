import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
// Only used to parse the request path; never connected to.
const URL_BASE = 'http://ripple.invalid';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid PORT "${process.env.PORT}". Use an integer from 1 to 65535.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const PLAIN = { 'Content-Type': 'text/plain; charset=utf-8' };

const server = createServer((request, response) => {
  try {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', URL_BASE).pathname);
    } catch {
      response.writeHead(400, PLAIN);
      response.end('Bad request');
      return;
    }
    if (pathname.includes('\0')) {
      response.writeHead(400, PLAIN);
      response.end('Bad request');
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const target = normalize(join(root, pathname));
    if (!target.startsWith(root + sep) && target !== root) {
      response.writeHead(403, PLAIN);
      response.end('Forbidden');
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, PLAIN);
      response.end('Not found');
      return;
    }

    const stream = createReadStream(target);
    stream.on('error', (error) => {
      console.error(error);
      // Headers may already be sent: the best we can do then is drop the connection.
      if (response.headersSent) {
        response.destroy();
        return;
      }
      response.writeHead(500, PLAIN);
      response.end('Server error');
    });
    // Send the headers only once the file is open, so an open failure can still be a 500.
    stream.on('open', () => {
      response.writeHead(200, {
        'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      stream.pipe(response);
    });
  } catch (error) {
    // The message may contain a local absolute path: keep it in the console only.
    console.error(error);
    response.writeHead(500, PLAIN);
    response.end('Server error');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT to another port.`);
  } else {
    console.error(`Server failed to start: ${error.code || error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const shownHost = host.includes(':') ? `[${host}]` : host;
  console.log(`Ripple is live at http://${shownHost}:${port}`);
  console.log('Press Ctrl+C to stop.');
});
