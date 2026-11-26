import { describe, it, expect } from 'vitest';
import { normalizePrListEntry } from '../scripts/auto-merge-shape.mjs';
import { isBotTrainPr, evaluateBotPr } from '../scripts/auto-merge-gate.mjs';

const listEntry = (overrides: Record<string, unknown> = {}) => ({
  number: 238,
  state: 'open',
  draft: false,
  author: null,
  user: { login: 'github-actions[bot]' },
  base: { ref: 'main' },
  head: { ref: 'ci/feed-publish', sha: 'a'.repeat(40) },
  labels: [{ name: 'bot-train' }],
  mergeable_state: null,
  ...overrides,
});

describe('REST list shape adapter', () => {
  it('maps user.login into author so a bot PR is selectable', () => {
    const normalized = normalizePrListEntry(listEntry(), { mergeable_state: 'behind' });
    expect(normalized.author).toEqual({ login: 'github-actions[bot]' });
    expect(isBotTrainPr(normalized)).toBe(true);
  });

  it('takes mergeable_state from the per-PR detail endpoint', () => {
    const normalized = normalizePrListEntry(listEntry(), { mergeable_state: 'behind' });
    expect(normalized.mergeable_state).toBe('behind');
  });

  it('does not exclude a bot candidate because the list said null', () => {
    const normalized = normalizePrListEntry(listEntry(), { mergeable_state: 'behind' });
    const decision = evaluateBotPr({
      pr: normalized, reviews: [], commits: [], checks: [],
    });
    const reasons = decision.reasons.join(' ');
    expect(reasons).not.toMatch(/author|mergeable_state/);
    expect(reasons).toMatch(/approval/);
  });

  it('keeps Dependabot and human PRs excluded', () => {
    const dependabot = normalizePrListEntry(
      listEntry({ number: 206, head: { ref: 'dependabot/npm/x', sha: 'b'.repeat(40) }, user: { login: 'dependabot[bot]' } }),
      { mergeable_state: 'clean' },
    );
    expect(isBotTrainPr(dependabot)).toBe(false);
    const human = normalizePrListEntry(
      listEntry({ number: 243, head: { ref: 'feat/wave68', sha: 'c'.repeat(40) }, user: { login: '10xdev4u-alt' } }),
      { mergeable_state: 'clean' },
    );
    expect(isBotTrainPr(human)).toBe(false);
  });

  it('preserves an explicit author over the derived user', () => {
    const explicit = { login: 'someone-else' };
    expect(normalizePrListEntry(listEntry({ author: explicit }), {}).author).toBe(explicit);
  });
});
