import { createServer, type Server } from 'node:http';
import type { ApiRequest, ApiResponse } from './http';

/** Serves the API from a plain Node server. Used for local development and by the tests that need a real socket. */
export function serve(api: (request: ApiRequest) => Promise<ApiResponse>, port = 0): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[key.toLowerCase()] = value;
      void api({ method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body: Buffer.concat(chunks).toString('utf8') }).then((response) => {
        res.writeHead(response.status, { 'content-type': 'application/json; charset=utf-8', ...response.headers });
        res.end(response.body === null || response.body === undefined ? '' : JSON.stringify(response.body));
      });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    resolve({ server, url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}` });
  }));
}
