/**
 * The custom server (2026-11-15) — TWO listeners, ONE process:
 *
 *   :PORT (default 3000)   the SvelteKit app — adapter-node's handler.js
 *   :METRICS_PORT (9090)   /metrics only — the UNROUTED observability
 *                          listener (Traefik never routes it; the pod's
 *                          prometheus.io/{scrape,port,path} annotations
 *                          opt the scrape in — the no-sidecar contract).
 *
 * This is adapter-node's documented custom-server path (the docs: import
 * `handler.js` for `http.createServer`). The lifecycle envs PORT/HOST
 * that `node build` honors by itself are implemented HERE (the docs warn
 * a custom server must do this) — the Deployment sets PORT, and
 * MELLON_METRICS_PORT defaults 9090, mirroring lumen's listener.
 *
 * Graceful shutdown mirrors adapter-node: SIGTERM/SIGINT close both
 * servers, then close remaining connections after SHUTDOWN_TIMEOUT.
 */
import http from 'node:http';
import { handler } from './build/handler.js';
import { register } from '#lib/server/metrics.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const metricsPort = Number(process.env.MELLON_METRICS_PORT) || 9090;
const shutdownTimeoutMs = (Number(process.env.SHUTDOWN_TIMEOUT) || 30) * 1000;

const appServer = http.createServer((req, res) => {
	handler(req, res, () => {
		res.statusCode = 404;
		res.end();
	});
});

const metricsServer = http.createServer(async (req, res) => {
	if (req.url === '/metrics') {
		res.writeHead(200, { 'content-type': register.contentType });
		res.end(await register.metrics());
		return;
	}
	res.writeHead(404);
	res.end();
});

appServer.listen({ port, host }, () => {
	console.log(`app: listening on ${host}:${port}`);
});
metricsServer.listen({ port: metricsPort, host }, () => {
	console.log(
		`metrics: listening on ${host}:${metricsPort} (unrouted; scrape opt-in via pod annotations)`
	);
});

let shuttingDown = false;
function gracefulShutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	appServer.closeIdleConnections();
	appServer.close(() => {
		metricsServer.close(() => {
			console.log('shutdown: both listeners closed');
		});
	});
	setTimeout(() => {
		appServer.closeAllConnections();
	}, shutdownTimeoutMs).unref(); // a pending timer must not hold the process open
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
