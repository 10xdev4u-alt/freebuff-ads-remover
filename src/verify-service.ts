/**
 * Loopback HTTP service exposing the RuntimeVerifier.
 *
 * Endpoints:
 *   GET  /health  -> { ok, version, appVersion }   (no auth)
 *   POST /verify  -> VerificationReport            (Bearer token)
 *   GET  /report  -> last VerificationReport      (Bearer token)
 *
 * Security: binds 127.0.0.1 only, rejects non-loopback Host headers (DNS
 * rebinding defense), requires a random bearer token written to
 * <config-dir>/verify.json (mode 0600). Default off via config.verify.enabled.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from './logger.js';
import type { RuntimeVerifier } from './runtime-verifier.js';
import type { VerificationReport } from './runtime-verifier.js';

export interface VerifyServiceConfig {
  enabled: boolean;
  port: number;
  tokenPath: string;
}

export interface VerifyServiceHandle {
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startVerifyService(
  config: VerifyServiceConfig,
  verifier: RuntimeVerifier,
  logger: Logger,
  appVersion: string,
): Promise<VerifyServiceHandle | null> {
  if (!config.enabled) return null;

  const token = crypto.randomUUID();
  // Persist token for clients (verify-remover.mjs reads it).
  try {
    fs.mkdirSync(path.dirname(config.tokenPath), { recursive: true });
    fs.writeFileSync(config.tokenPath, JSON.stringify({ token, port: 0 }), { mode: 0o600 });
  } catch (err) {
    logger.warn('VerifyService: could not persist token', err);
  }

  const server = http.createServer((req, res) => {
    const host = req.headers.host ?? '';
    if (host && !/^127\.0\.0\.1(:\d+)?$|^localhost(:\d+)?$/.test(host)) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, version: '1.5.1', appVersion }));
      return;
    }

    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${token}`) {
      res.statusCode = 401;
      res.end('unauthorized');
      return;
    }

    if (req.url === '/verify' && req.method === 'POST') {
      void verifier
        .run()
        .then((report: VerificationReport) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(report));
        })
        .catch((err: unknown) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        });
      return;
    }

    if (req.url === '/report' && req.method === 'GET') {
      const report = verifier.getLastReport();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(report ?? { pass: false, reason: 'no-report-yet' }));
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise<VerifyServiceHandle | null>((resolve) => {
    server.listen(config.port, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : config.port;
      // Update token file with actual port.
      try {
        fs.writeFileSync(config.tokenPath, JSON.stringify({ token, port }), { mode: 0o600 });
      } catch {
        /* ignore */
      }
      logger.info('VerifyService listening', { port });
      resolve({
        port,
        token,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => { r(); });
          }),
      });
    });
    server.on('error', (err) => {
      logger.warn('VerifyService failed to bind', err);
      resolve(null);
    });
  });
}
