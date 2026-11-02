import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const folder = await realpath(dirname(fileURLToPath(import.meta.url)));
let portValue = process.env.PORT ?? '8768';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1] !== undefined) portValue = args[++i];
  else if (args[i].startsWith('--port=')) portValue = args[i].slice(7);
  else if (args[i] === '--help') {
    console.log('Usage: node server.mjs [--port 8768]\nDefault: PORT environment variable, otherwise 8768.');
    process.exit(0);
  } else {
    console.error('Unknown or incomplete argument: ' + args[i] + '\nUsage: node server.mjs [--port 8768]');
    process.exit(1);
  }
}
if (!/^\d+$/.test(String(portValue)) || Number(portValue) < 1 || Number(portValue) > 65535) {
  console.error('Port must be an integer from 1 to 65535.');
  process.exit(1);
}
const port = Number(portValue);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
};
function inside(path) {
  const rel = relative(folder, path);
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
function reply(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message + '\n');
}
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    reply(res, 405, 'Only GET and HEAD are supported.');
    return;
  }
  try {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      reply(res, 400, 'Invalid request path.');
      return;
    }
    if (pathname.includes('\0')) {
      reply(res, 400, 'Invalid request path.');
      return;
    }
    if (pathname === '/edge-matched') pathname = '/';
    else if (pathname.startsWith('/edge-matched/')) pathname = pathname.slice('/edge-matched'.length);
    let path = resolve(folder, '.' + pathname.replaceAll('\\', '/'));
    if (!inside(path)) {
      reply(res, 403, 'Access outside the preview folder is not allowed.');
      return;
    }
    path = await realpath(path);
    if (!inside(path)) {
      reply(res, 403, 'Access outside the preview folder is not allowed.');
      return;
    }
    let info = await stat(path);
    if (info.isDirectory()) {
      path = await realpath(resolve(path, 'index.html'));
      if (!inside(path)) {
        reply(res, 403, 'Access outside the preview folder is not allowed.');
        return;
      }
      info = await stat(path);
    }
    if (!info.isFile()) {
      reply(res, 404, 'File not found.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(path).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else await pipeline(createReadStream(path), res);
  } catch (error) {
    if (res.headersSent || res.destroyed) {
      if (!res.destroyed) res.destroy();
      return;
    }
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(res, 404, 'File not found.');
    else if (error.code === 'EACCES' || error.code === 'EPERM') reply(res, 403, 'Access denied.');
    else {
      console.error(error);
      reply(res, 500, 'Unable to read this file.');
    }
  }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error('Port ' + port + ' is already in use. Stop the other server or choose --port NUMBER.');
  else console.error('Could not start preview server: ' + error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('Bunker builder: http://127.0.0.1:' + port + '/');
  console.log('Serving: ' + folder);
  console.log('Press Ctrl+C to stop.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());

