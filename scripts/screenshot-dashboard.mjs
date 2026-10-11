#!/usr/bin/env node
// Opens the shield dashboard inside a running Freebuff Desktop instance and
// captures a screenshot of it via the Chromium DevTools endpoint.
//
//   ./scripts/launch-freebuff.sh --remote-debugging-port=9222
//   node scripts/verify-remover.mjs      (produces one real blocked event)
//   node scripts/screenshot-dashboard.mjs [out.png]

import { writeFileSync } from 'node:fs';

const port = process.env.FREEBUFF_CDP_PORT || '9222';
const outPath = process.argv[2] || 'dashboard-screenshot.png';
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

let nextId = 0;
const pending = new Map();

function attachPump(ws) {
  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error) {
      waiter.reject(new Error(msg.error.message));
      return;
    }
    waiter.resolve(msg.result);
  });
}

function send(ws, method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 15000);
  });
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result?.result;
  if (value?.subtype === 'error') {
    throw new Error(value.description ?? 'evaluation threw');
  }
  return value?.value ?? '';
}

async function main() {
  const startedAt = Date.now();
  let ws = null;
  let lastError = null;

  while (Date.now() - startedAt < deadlineMs) {
    try {
      const target = await findPageTarget();
      if (target) {
        ws = await connect(target.webSocketDebuggerUrl);
        attachPump(ws);
        break;
      }
      lastError = 'no page target yet (app still starting?)';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(1000);
  }

  if (!ws) {
    console.error(`[screenshot] could not attach to the app: ${lastError}`);
    process.exit(1);
  }

  const opened = await evaluate(ws, `
    (() => {
      const host = document.querySelector('#far-shield-host');
      if (!host || !host.shadowRoot) return 'no-dashboard';
      const badge = host.shadowRoot.querySelector('.badge');
      if (!badge) return 'no-badge';
      badge.click();
      return 'opened';
    })()
  `);
  console.log(`[screenshot] dashboard: ${opened}`);
  if (opened !== 'opened') {
    ws.close();
    process.exit(1);
  }

  await sleep(2200);

  const summary = await evaluate(ws, `
    (() => {
      const root = document.querySelector('#far-shield-host')?.shadowRoot;
      if (!root) return 'gone';
      const total = root.querySelector('.header-total')?.textContent ?? '?';
      const stages = [...root.querySelectorAll('.stage')]
        .map((n) => n.getAttribute('data-stage') + '=' + (n.querySelector('.stage-count')?.textContent ?? '?'))
        .join(' ');
      const events = root.querySelector('.events')?.textContent ?? '';
      return total + ' | ' + stages + ' | ' + events.slice(0, 160);
    })()
  `);
  console.log(`[screenshot] panel state: ${summary}`);

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`[screenshot] saved ${outPath}`);

  ws.close();
}

main().catch((err) => {
  console.error('[screenshot] error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
