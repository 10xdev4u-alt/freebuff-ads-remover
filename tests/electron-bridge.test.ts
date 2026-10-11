import { describe, it, expect } from 'vitest';
import { getElectron } from '../src/electron-bridge.js';

describe('getElectron', () => {
  it('returns null outside an Electron main process', () => {
    expect(getElectron()).toBeNull();
  });
});
