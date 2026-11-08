import { describe, it, expect } from 'vitest';
import { isWallText } from '../src/wall-detector.js';

describe('wall-detector', () => {
  it('detects wall text', () => {
    expect(isWallText('Please allow ads on Freebuff. Ads keep your coding agent free.')).toBe(true);
  });
  it('ignores normal page', () => {
    expect(isWallText('Welcome to Freebuff')).toBe(false);
  });
  it('empty is false', () => {
    expect(isWallText('')).toBe(false);
  });
});
