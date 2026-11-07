import { describe, it, expect } from 'vitest';
import { runCli } from '../src/cli.js';

describe('cli', () => {
  it('inspect returns 0', () => { expect(runCli(['inspect'])).toBe(0); });
  it('doctor returns 0', () => { expect(runCli(['doctor'])).toBe(0); });
  it('help returns 0', () => { expect(runCli(['help'])).toBe(0); });
  it('unknown returns 0 (help)', () => { expect(runCli([])).toBe(0); });
});

describe('cli extra', () => {
  it('capture status', () => { expect(runCli(['capture'])).toBe(0); });
  it('replay missing file returns 2', () => { expect(runCli(['replay', '--capture', '/nope.jsonl'])).toBe(2); });
  it('discover missing file returns 2', () => { expect(runCli(['discover', '--capture', '/nope.jsonl'])).toBe(2); });
  it('corpus verify', () => { expect(runCli(['corpus'])).toBe(0); });
  it('gate', () => { expect(runCli(['gate'])).toBe(0); });
});
