import { describe, it, expect } from 'vitest';
import { runCli } from '../src/cli.js';

describe('cli', () => {
  it('inspect returns 0', () => { expect(runCli(['inspect'])).toBe(0); });
  it('doctor returns 0', () => { expect(runCli(['doctor'])).toBe(0); });
  it('help returns 0', () => { expect(runCli(['help'])).toBe(0); });
  it('unknown returns 0 (help)', () => { expect(runCli([])).toBe(0); });
});
