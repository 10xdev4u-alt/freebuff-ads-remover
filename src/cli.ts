/* v8 ignore file */
/**
 * farbuff CLI — thin wrapper over library functions.
 * No reimplemented logic: every command delegates to src/*.
 */
import { loadConfig, getConfigDir } from './config.js';
import { AdInterceptor } from './interceptor.js';
import { Logger } from './logger.js';
import { replay } from './replay.js';
import { discover } from './discovery.js';
import { runGate } from './gate.js';
import { verifyCorpus } from './corpus.js';
import { synthesizeDelta } from './rule-synthesis.js';
import { buildTrustReport } from './trust-report.js';
import { RuleRegistry } from './rule-registry.js';
import { runAutopilot } from './autopilot.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string | boolean>; positional: string[] } {
  const cmd = argv[0] || 'help';
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { cmd, flags, positional };
}

function cmdInspect(): number {
  const config = loadConfig();
  const logger = new Logger('error', false);
  const interceptor = new AdInterceptor(config, logger);
  console.log('Config dir:', getConfigDir());
  console.log('Enabled:', config.enabled);
  console.log('Preset:', config.preset);
  console.log('Block tracking:', config.blockTracking);
  console.log('DOM removal:', config.domRemoval);
  console.log('Shadow capture:', config.shadow.enabled, config.shadow.dryRun ? '(dry-run)' : '');
  console.log('Patterns:', (interceptor as unknown as { patterns?: unknown[] }).patterns?.length ?? 'n/a');
  console.log('Surfaces:', Object.entries(config.surfaces).filter(([, v]) => v).map(([k]) => k).join(', '));
  return 0;
}

function cmdDoctor(): number {
  const dir = getConfigDir();
  console.log('Config dir:', dir);
  console.log('Config exists:', fs.existsSync(path.join(dir, 'config.json')));
  console.log('Node:', process.version);
  console.log('Platform:', process.platform, process.arch);
  // check dist
  const distIndex = path.join(process.cwd(), 'dist', 'index.js');
  console.log('dist/index.js exists:', fs.existsSync(distIndex));
  return 0;
}

function cmdCaptureStatus(): number {
  const config = loadConfig();
  const dir = config.shadow.captureDir || path.join(getConfigDir(), 'captures');
  console.log('Capture dir:', dir);
  if (!fs.existsSync(dir)) { console.log('No captures yet.'); return 0; }
  for (const f of fs.readdirSync(dir)) {
    const st = fs.statSync(path.join(dir, f));
    console.log(`  ${f}: ${String(st.size)} bytes`);
  }
  return 0;
}

function cmdReplay(flags: Record<string, string | boolean>): number {
  const capturePath = flags['capture'] as string;
  /* v8 ignore next 3 */
  if (!capturePath || !fs.existsSync(capturePath)) {
    console.error('Usage: farbuff replay --capture <file>');
    return 2;
  }
  const lines = fs.readFileSync(capturePath, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map((l) => JSON.parse(l) as unknown);
  const config = loadConfig();
  const logger = new Logger('error', false);
  const interceptor = new AdInterceptor(config, logger);
  const matcher = {
    isBlocked: (p: string) => interceptor.intercept(`https://x${p}`).blocked,
    endpoints: ((interceptor as unknown as { patterns?: unknown[] }).patterns?.length) ?? 0,
  };
  const report = replay(entries as never, matcher, { recallFloor: config.shadow.recallFloor, precisionFloor: config.shadow.precisionFloor });
  console.log(JSON.stringify(report, null, 2));
  return report.pass ? 0 : 1;
}

function cmdDiscover(flags: Record<string, string | boolean>): number {
  const capturePath = flags['capture'] as string;
  /* v8 ignore next 3 */
  if (!capturePath || !fs.existsSync(capturePath)) {
    console.error('Usage: farbuff discover --capture <file>');
    return 2;
  }
  const lines = fs.readFileSync(capturePath, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map((l) => JSON.parse(l) as unknown);
  const minCount = Number(flags['min-count'] ?? 3);
  const cands = discover(entries as never, minCount);
  console.log(JSON.stringify(cands, null, 2));
  return 0;
}

function cmdAudit(positional: string[]): number {
  const resources = positional[0];
  /* v8 ignore next */ if (!resources) { console.error('Usage: farbuff audit <resources-dir>'); return 2; }
  // delegate to script via child process
  const r = spawnSync('node', [path.join(process.cwd(), 'scripts', 'audit-endpoints.mjs'), resources], { stdio: 'inherit' });
  return r.status ?? 1;
}

function cmdGate(flags: Record<string, string | boolean>): number {
  const dir = (flags['corpus'] as string) || path.join(process.cwd(), 'corpus');
  const r = runGate(dir);
  console.log(JSON.stringify(r, null, 2));
  return r.pass ? 0 : 1;
}

function cmdCorpusVerify(flags: Record<string, string | boolean>): number {
  const dir = (flags['dir'] as string) || path.join(process.cwd(), 'corpus');
  console.log('corpus valid:', verifyCorpus(dir));
  return verifyCorpus(dir) ? 0 : 1;
}

function cmdSynthesize(flags: Record<string, string | boolean>): number {
  const auditPath = flags['audit'] as string;
  if (!auditPath) { console.error('Usage: farbuff synthesize --audit <file>'); return 2; }
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as { routes?: { missing?: string[] } };
  const gaps = (audit.routes?.missing ?? []).map((r: string) => ({ route: r }));
  const delta = synthesizeDelta(gaps, 'audit');
  console.log(JSON.stringify(delta, null, 2));
  return delta ? 0 : 1;
}

function cmdTrust(): number {
  const reg = new RuleRegistry();
  const report = buildTrustReport(reg, 0);
  console.log(JSON.stringify(report, null, 2));
  return 0;
}

function cmdAutopilot(flags: Record<string, string | boolean>): number {
  const auditPath = flags['audit'] as string;
  if (!auditPath) { console.error('Usage: farbuff autopilot --audit <file> [--dry-run]'); return 2; }
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as { routes?: { missing?: string[] } };
  const corpusDir = (flags['corpus'] as string) || (process.cwd() + '/corpus');
  const dryRun = Boolean(flags['dry-run']);
  const r = runAutopilot(audit, corpusDir, dryRun);
  console.log(JSON.stringify(r, null, 2));
  return r.gate.pass ? 0 : 1;
}

function cmdHelp(): number {
  console.log(`farbuff — Freebuff Ads Remover CLI

Commands:
  inspect              Show config, patterns, surfaces
  doctor               Diagnose installation
  capture status       Show capture files
  replay --capture F   Replay capture against current blocklist
  discover --capture F Discover new ad-endpoint candidates
  audit <resources>    Run endpoint audit
  gate [--corpus DIR]  Run replay gate against golden corpus
  corpus [--dir DIR]   Verify golden corpus integrity
  help                 This help
`);
  return 0;
}

export function runCli(argv: string[]): number {
  const { cmd, flags, positional } = parseArgs(argv);
  switch (cmd) {
    case 'inspect': return cmdInspect();
    case 'doctor': return cmdDoctor();
    case 'capture': return cmdCaptureStatus();
    case 'replay': return cmdReplay(flags);
    case 'discover': return cmdDiscover(flags);
    case 'audit': return cmdAudit(positional);
    case 'gate': return cmdGate(flags);
    case 'corpus': return cmdCorpusVerify(flags);
    case 'synthesize': return cmdSynthesize(flags);
    case 'trust': return cmdTrust();
    case 'autopilot': return cmdAutopilot(flags);
    case 'help':
    default: return cmdHelp();
  }
}

