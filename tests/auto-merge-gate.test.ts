import { describe, it, expect } from 'vitest';
import { evaluateBotPr, isBotTrainPr, REQUIRED_CHECKS } from '../scripts/auto-merge-gate.mjs';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-25T12:00:00.000Z');
const headSha = 'a'.repeat(40);

function fixture() {
  return {
    pr: {
      number: 195,
      state: 'open',
      draft: false,
      merged: false,
      mergeable_state: 'clean',
      author: { login: 'github-actions[bot]' },
      base: { ref: 'main' },
      head: { ref: 'ci/feed-publish', sha: headSha },
      labels: [{ name: 'bot-train' }],
    },
    reviews: [
      { user: { login: '10xdev4u-alt' }, state: 'APPROVED', submitted_at: new Date(now - 1000).toISOString(), commit_id: undefined as string | undefined, completed_at: undefined as string | undefined },
    ],
    checks: REQUIRED_CHECKS.map((name) => ({ name, status: 'completed', conclusion: 'success', head_sha: headSha, completed_at: undefined as string | undefined, started_at: undefined as string | undefined })),
    commits: [
      {
        // Real REST shape: top-level author is often null for bot commits.
        author: null,
        commit: {
          author: { name: '10xdev4u-alt' },
          message: 'chore(feed): publish signed manifest',
          committer: { date: new Date(now - 60000).toISOString() },
        },
      },
    ],
    now,
  };
}

type Fixture = ReturnType<typeof fixture>;
function evaluate(f: Fixture) { return evaluateBotPr(f); }
function blockers(f: Fixture) { return evaluate(f).reasons; }

describe('evaluateBotPr', () => {
  it('allows a reviewed, label-tagged bot PR whose required checks are green', () => {
    const r = evaluate(fixture());
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.number).toBe(195);
  });

  it('allows a heal-branch bot PR', () => {
    const f = fixture();
    f.pr.head.ref = 'ci/upstream-heal-0.0.205';
    expect(evaluate(f).eligible).toBe(true);
  });

  it('rejects human, Dependabot and unlisted-branch PRs', () => {
    const human = fixture();
    human.pr.author.login = '10xdev4u-alt';
    expect(blockers(human).join(' ')).toMatch(/author/);
    const dep = fixture();
    dep.pr.author.login = 'dependabot[bot]';
    expect(blockers(dep).join(' ')).toMatch(/author/);
    const branch = fixture();
    branch.pr.head.ref = 'feat/anything';
    expect(blockers(branch).join(' ')).toMatch(/branch/);
  });

  it('rejects drafts, closed PRs and a non-main base', () => {
    const draft = fixture();
    draft.pr.draft = true;
    expect(blockers(draft).join(' ')).toMatch(/draft/);
    const closed = fixture();
    closed.pr.state = 'closed';
    expect(blockers(closed).join(' ')).toMatch(/open/);
    const base = fixture();
    base.pr.base.ref = 'release';
    expect(blockers(base).join(' ')).toMatch(/base/);
  });

  it('rejects missing bot-train and present hold labels', () => {
    const missing = fixture();
    missing.pr.labels = [];
    expect(blockers(missing).join(' ')).toMatch(/bot-train/);
    const held = fixture();
    held.pr.labels = [{ name: 'bot-train' }, { name: 'do-not-merge' }];
    expect(blockers(held).join(' ')).toMatch(/do-not-merge/);
  });

  it('requires a fresh approval from a write-access reviewer', () => {
    const stale = fixture();
    stale.reviews[0]!.submitted_at = new Date(now - DAY).toISOString();
    expect(blockers(stale).join(' ')).toMatch(/stale approval/);
    const wrong = fixture();
    wrong.reviews[0]!.user.login = 'the-ai-developer';
    expect(blockers(wrong).join(' ')).toMatch(/approval/);
    const bot = fixture();
    bot.reviews[0]!.user.login = 'github-actions[bot]';
    expect(blockers(bot).join(' ')).toMatch(/approval/);
    const changes = fixture();
    changes.reviews[0]!.state = 'CHANGES_REQUESTED';
    expect(blockers(changes).join(' ')).toMatch(/approval/);
  });

  it('rejects approvals from after a newer commit', () => {
    const f = fixture();
    f.commits[0]!.commit.committer.date = new Date(now + 1000).toISOString();
    expect(blockers(f).join(' ')).toMatch(/stale approval/);
  });

  it('uses the review commit_id when GitHub supplies it', () => {
    const pinned = fixture();
    pinned.reviews[0]!.commit_id = headSha;
    pinned.reviews[0]!.submitted_at = new Date(now - DAY).toISOString();
    expect(blockers(pinned)).toEqual([]);
    const wrong = fixture();
    wrong.reviews[0]!.commit_id = 'b'.repeat(40);
    expect(blockers(wrong).join(' ')).toMatch(/stale approval/);
  });

  it('uses the reviewer latest state, so a later CHANGES_REQUESTED vetoes', () => {
    const f = fixture();
    f.reviews = [
      { user: { login: '10xdev4u-alt' }, state: 'APPROVED', submitted_at: new Date(now - 2000).toISOString(), commit_id: headSha, completed_at: undefined },
      { user: { login: '10xdev4u-alt' }, state: 'CHANGES_REQUESTED', submitted_at: new Date(now - 1000).toISOString(), commit_id: headSha, completed_at: undefined },
    ];
    expect(blockers(f).join(' ')).toMatch(/no current approval/);
  });

  it('ignores a stale successful check when a newer failure exists', () => {
    const f = fixture();
    f.checks = f.checks.map((c) => ({
      ...c,
      completed_at: c.name === 'test'
        ? new Date(now - 5000).toISOString()
        : new Date(now - 1000).toISOString(),
    }));
    f.checks.push({
      name: 'test',
      status: 'completed',
      conclusion: 'failure',
      head_sha: headSha,
      completed_at: new Date(now - 500).toISOString(),
      started_at: undefined,
    });
    expect(blockers(f).join(' ')).toMatch(/check test is failure/);
  });

  it('lets a newer pending check run block an older success', () => {
    const f = fixture();
    f.checks = f.checks.map((c) => c.name === 'test'
      ? { ...c, started_at: new Date(now - 5000).toISOString(), completed_at: new Date(now - 4000).toISOString() }
      : c);
    f.checks.push({
      name: 'test',
      status: 'in_progress',
      conclusion: null as unknown as string,
      head_sha: headSha,
      completed_at: undefined,
      started_at: new Date(now - 1000).toISOString(),
    });
    expect(blockers(f).join(' ')).toMatch(/check test is in_progress/);
  });

  it('lets a queued rerun block an older success', () => {
    const f = fixture();
    f.checks = f.checks.map((c) => c.name === 'test'
      ? { ...c, started_at: new Date(now - 5000).toISOString(), completed_at: new Date(now - 4000).toISOString() }
      : c);
    f.checks.push({
      name: 'test',
      status: 'queued',
      conclusion: null as unknown as string,
      head_sha: headSha,
      started_at: undefined,
      completed_at: undefined,
    });
    expect(blockers(f).join(' ')).toMatch(/check test is queued/);
  });

  it.each(['in_progress', 'waiting'])('lets an untimed %s run block an older success', (status) => {
    const f = fixture();
    f.checks = f.checks.map((c) => c.name === 'test'
      ? { ...c, started_at: new Date(now - 5000).toISOString(), completed_at: new Date(now - 4000).toISOString() }
      : c);
    f.checks.push({
      name: 'test',
      status,
      conclusion: null as unknown as string,
      head_sha: headSha,
      started_at: undefined,
      completed_at: undefined,
    });
    expect(blockers(f).join(' ')).toMatch(new RegExp(`check test is ${status}`));
  });

  it('fails closed when a required check is missing, pending or action_required', () => {
    const missing = fixture();
    missing.checks = missing.checks.filter((c) => c.name !== 'test');
    expect(blockers(missing).join(' ')).toMatch(/test.*missing/);
    const pending = fixture();
    pending.checks = pending.checks.map((c) => c.name === 'build' ? { ...c, status: 'in_progress' } : c);
    expect(blockers(pending).join(' ')).toMatch(/build/);
    const action = fixture();
    action.checks = action.checks.map((c) => c.name === 'heal-proof' ? { ...c, conclusion: 'action_required' } : c);
    expect(blockers(action).join(' ')).toMatch(/heal-proof/);
  });

  it('ignores checks reported against an older head SHA', () => {
    const f = fixture();
    f.checks = f.checks.map((c) => ({ ...c, head_sha: 'b'.repeat(40) }));
    expect(blockers(f).join(' ')).toMatch(/test.*missing/);
  });

  it('rejects non-clean merge state and missing commits', () => {
    const behind = fixture();
    behind.pr.mergeable_state = 'behind';
    expect(blockers(behind)).toEqual([]);
    const dirty = fixture();
    dirty.pr.mergeable_state = 'dirty';
    expect(blockers(dirty).join(' ')).toMatch(/mergeable_state/);
    const none = fixture();
    none.commits = [];
    expect(blockers(none).join(' ')).toMatch(/commit/);
  });

  it('requires conventional commit subjects from the configured identity', () => {
    const bad = fixture();
    bad.commits[0]!.commit.message = 'update stuff';
    expect(blockers(bad).join(' ')).toMatch(/conventional/);
    const author = fixture();
    author.commits[0]!.commit.author.name = 'someone-else';
    expect(blockers(author).join(' ')).toMatch(/author/);
    const long = fixture();
    long.commits[0]!.commit.message = 'chore(feed): publish the newly signed manifest for the live feed today';
    expect(blockers(long).join(' ')).toMatch(/6 words/);
    const trailer = fixture();
    trailer.commits[0]!.commit.message = 'chore(feed): publish manifest\n\nCo-authored-by: someone <x@y.z>';
    expect(blockers(trailer).join(' ')).toMatch(/Co-authored-by/);
  });
});

describe('isBotTrainPr', () => {
  it('accepts only allowlisted, opt-in, open bot PRs', () => {
    const f = fixture();
    expect(isBotTrainPr(f.pr)).toBe(true);
    const human = fixture();
    human.pr.author.login = '10xdev4u-alt';
    expect(isBotTrainPr(human.pr)).toBe(false);
    const healled = fixture();
    healled.pr.head.ref = 'ci/upstream-heal-0.0.205';
    expect(isBotTrainPr(healled.pr)).toBe(true);
    const held = fixture();
    held.pr.labels.push({ name: 'hold' });
    // Held PRs are candidates, not eligible: the runner must still reach them
    // so it can revoke auto-merge that was enabled before the hold.
    expect(isBotTrainPr(held.pr)).toBe(true);
    expect(blockers(held).join(' ')).toMatch(/do-not-merge|hold|blocked/);
  });
});
