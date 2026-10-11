#!/usr/bin/env node
// Verifies the ads remover inside a *running* Freebuff Desktop instance via
// its Chromium DevTools endpoint.
//
// Launch the app with the endpoint open first:
//   ./scripts/launch-freebuff.sh --remote-debugging-port=9222
// then:
//   node scripts/verify-remover.mjs
//
// The check drives the renderer's own fetch(): ad endpoints must be cancelled
// by the session-level webRequest hook (net::ERR_BLOCKED_BY_CLIENT) while
// control endpoints still reach the local orchestrator.

const port = process.env.FREEBUFF_CDP_PORT || '9222';
const deadlineMs = Number(process.env.FREEBUFF_VERIFY_TIMEOUT || 60000);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function findPageTarget() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`DevTools endpoint returned HTTP ${res.status}`);
  const targets = await res.json();
  return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => { resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { reject(new Error('DevTools WebSocket failed')); }, { once: true });
  });
}

function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = 1;
    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) {
        reject(new Error(msg.error.message));
        return;
      }
      const result = msg.result?.result;
      if (result?.subtype === 'error') {
        reject(new Error(result.description ?? 'evaluation threw'));
        return;
      }
      resolve(result?.value ?? '');
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
    setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('Runtime.evaluate timed out'));
    }, 15000);
  });
}

const PROBE = `
Promise.all([
  fetch('/api/ad/policy').then(
    (r) => 'ad=REACHED:' + r.status,
    (e) => 'ad=BLOCKED:' + (e && e.message ? e.message : String(e)),
  ),
  fetch('/').then(
    (r) => 'control=REACHED:' + r.status,
    (e) => 'control=FAILED:' + (e && e.message ? e.message : String(e)),
  ),
]).then((parts) => parts.join(' | '))
`;

async function main() {
  const startedAt = Date.now();
  let ws = null;
  let lastError = null;

  while (Date.now() - startedAt < deadlineMs) {
    try {
      const target = await findPageTarget();
      if (target) {
        ws = await connect(target.webSocketDebuggerUrl);
        break;
      }
      lastError = 'no page target yet (app still starting?)';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(1000);
  }

  if (!ws) {
    console.error(`[verify] could not attach to the app: ${lastError}`);
    console.error('[verify] start it with: ./scripts/launch-freebuff.sh --remote-debugging-port=9222');
    process.exit(1);
  }

  let verdict = '';
  while (Date.now() - startedAt < deadlineMs) {
    try {
      verdict = await evaluate(ws, PROBE);
      if (verdict.includes('control=REACHED')) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(1000);
  }
  ws.close();

  console.log(`[verify] ${verdict || `probe failed: ${lastError}`}`);

  const adBlocked = verdict.includes('ad=BLOCKED:');
  const controlOk = verdict.includes('control=REACHED:');
  if (adBlocked && controlOk) {
    console.log('[verify] PASS — ad requests are blocked, the app still works');
    process.exit(0);
  }
  if (!controlOk) {
    console.error('[verify] FAIL — control endpoint unreachable; app not ready?');
  } else {
    console.error('[verify] FAIL — ad requests are NOT being blocked');
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[verify] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
