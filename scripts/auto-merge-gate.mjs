#!/usr/bin/env node
// Pure decision function for the Wave 61 bot PR train.
//
// Auto-merge is enabled only when a PR is unmistakably one of our own bot
// PRs, carries the opt-in label, has a fresh approval from a reviewer with
// write access, every required check is SUCCESS on the current head SHA, and
// every commit follows the repo's conventional-commit / identity rules.
// Anything unknown, missing or ambiguous is a blocker, never a pass.

export const REQUIRED_CHECKS = Object.freeze([
  'lint-and-typecheck',
  'test',
  'build',
  'heal-proof',
  'audit-delta-gate',
]);

export const BOT_AUTHOR = 'github-actions[bot]';
export const BOT_BRANCHES = Object.freeze([
  'ci/feed-publish',
  'ci/live-receipt',
  'ci/proof-publish',
]);
export const HEAL_BRANCH_RE = /^ci\/upstream-heal-\d+\.\d+\.\d+$/;
export const APPROVERS = Object.freeze(['10xdev4u-alt']);
export const HOLD_LABELS = Object.freeze(['do-not-merge', 'blocked', 'hold']);
export const COMMIT_IDENTITY = '10xdev4u-alt';
const CONVENTIONAL_RE = /^(feat|fix|refactor|docs|test|chore|perf|ci|build|style)(\([^)]+\))?: .+/;

function allowedBranch(ref) {
  return BOT_BRANCHES.includes(ref) || HEAL_BRANCH_RE.test(ref);
}

/**
 * Cheap prefilter for PRs that look like the bot train. Hold labels are
 * deliberately NOT excluded here: a held PR with auto-merge already enabled
 * must still reach evaluateBotPr so the runner can revoke it.
 */
export function isBotTrainPr(pr) {
  if (!pr || pr.state !== 'open' || pr.draft || pr.merged) return false;
  if (pr.author?.login !== BOT_AUTHOR || pr.base?.ref !== 'main') return false;
  if (!allowedBranch(pr.head?.ref)) return false;
  const labels = Array.isArray(pr.labels) ? pr.labels.map((l) => l.name) : [];
  return labels.includes('bot-train');
}

/**
 * Decides whether `gh pr merge --auto --merge` may be enabled for one PR.
 * Returns { eligible, number, reasons }; an empty reasons list means go.
 */
export function evaluateBotPr(input) {
  const reasons = [];
  const pr = input.pr;
  const now = input.now ?? Date.now();

  if (!pr || pr.state !== 'open' || pr.draft || pr.merged) {
    reasons.push(`PR must be open and not a draft or merged (state=${pr?.state}, draft=${pr?.draft})`);
  }
  if (pr?.author?.login !== BOT_AUTHOR) {
    reasons.push(`author ${pr?.author?.login} is not ${BOT_AUTHOR}`);
  }
  if (pr?.base?.ref !== 'main') {
    reasons.push(`base ${pr?.base?.ref} is not main`);
  }
  if (!allowedBranch(pr?.head?.ref)) {
    reasons.push(`branch ${pr?.head?.ref} is not an allowlisted bot branch`);
  }

  const labels = Array.isArray(pr?.labels) ? pr.labels.map((l) => l.name) : [];
  if (!labels.includes('bot-train')) reasons.push('bot-train label is missing');
  for (const hold of HOLD_LABELS) {
    if (labels.includes(hold)) reasons.push(`hold label ${hold} is present`);
  }

  // Approvals must come from someone whose review counts (write access) and
  // must be newer than the latest commit on this head.
  const commits = Array.isArray(input.commits) ? input.commits : [];
  if (commits.length === 0) {
    reasons.push('no commits reported for the PR head');
  }
  let latestCommitAt = -Infinity;
  for (const c of commits) {
    const t = Date.parse(c?.commit?.committer?.date);
    if (!Number.isFinite(t)) {
      reasons.push('a commit has a missing or invalid committer date');
      continue;
    }
    latestCommitAt = Math.max(latestCommitAt, t);
  }
  if (!['clean', 'behind'].includes(pr?.mergeable_state)) {
    reasons.push(`mergeable_state ${pr?.mergeable_state} is not clean or behind`);
  }

  const reviews = Array.isArray(input.reviews) ? input.reviews : [];
  // Only the reviewer's *latest* substantive review counts. GitHub ignores
  // COMMENTED when deciding whether an approval still stands, but a later
  // CHANGES_REQUESTED or DISMISSED must override an earlier APPROVED.
  const substantive = ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'];
  const latestByReviewer = new Map();
  for (const r of reviews) {
    if (!APPROVERS.includes(r?.user?.login) || !substantive.includes(r?.state)) continue;
    const t = Date.parse(r.submitted_at);
    const key = r.user.login;
    const prev = latestByReviewer.get(key);
    if (!prev || (Number.isFinite(t) && t >= prev.t)) latestByReviewer.set(key, { review: r, t });
  }
  const finalReviews = [...latestByReviewer.values()].map((v) => v.review);
  const allowedApprovals = finalReviews.filter((r) => r.state === 'APPROVED');
  const approvals = allowedApprovals.filter((r) => {
    if (r.commit_id) return r.commit_id === pr?.head?.sha;
    return Date.parse(r.submitted_at) > latestCommitAt;
  });
  if (approvals.length === 0) {
    if (finalReviews.length > 0) {
      reasons.push('stale approval / no current approval: reviewer approval must be newer than the latest commit');
    } else {
      const named = reviews
        .filter((r) => r?.state === 'APPROVED')
        .map((r) => r?.user?.login)
        .join(', ');
      reasons.push(`no approval from ${APPROVERS.join(' or ')} (approvals: ${named || 'none'})`);
    }
  }

  const checks = Array.isArray(input.checks) ? input.checks : [];
  const sha = pr?.head?.sha;
  // One ordering key for both selection and veto: a run's start time. A newer
  // pending or failed run must outrank an older success even when its
  // completed_at is absent (incomplete runs have no completion time yet).
  const checkOrder = (c) => {
    const t = Date.parse(c?.started_at ?? c?.completed_at ?? '');
    return Number.isFinite(t) ? t : -Infinity;
  };
  for (const name of REQUIRED_CHECKS) {
    const hits = checks.filter((c) => c?.name === name && c?.head_sha === sha);
    if (hits.length === 0) {
      reasons.push(`check ${name} missing for head ${sha}`);
      continue;
    }
    const latest = hits.slice().sort((a, b) => checkOrder(b) - checkOrder(a))[0];
    const failures = hits.filter((c) => c.status !== 'completed' || c.conclusion !== 'success');
    if (failures.some((f) => checkOrder(f) >= checkOrder(latest))) {
      reasons.push(`check ${name} is ${latest?.conclusion ?? latest?.status}`);
    } else if (latest.status !== 'completed' || latest.conclusion !== 'success') {
      reasons.push(`check ${name} is ${latest.conclusion ?? latest.status}`);
    }
  }

  for (const c of commits) {
    // REST pulls/{n}/commits puts the identity under commit.author; the top
    // level `author` is often null for bot-created commits.
    const authorName = c?.commit?.author?.name ?? c?.author?.name;
    if (authorName !== COMMIT_IDENTITY) {
      reasons.push(`commit author ${authorName} is not ${COMMIT_IDENTITY}`);
    }
    const message = c?.commit?.message ?? '';
    const subject = message.split('\n')[0];
    if (!CONVENTIONAL_RE.test(subject)) {
      reasons.push(`commit subject ${JSON.stringify(subject)} is not conventional`);
    } else if (subject.trim().split(/\s+/).length > 6) {
      reasons.push(`commit subject ${JSON.stringify(subject)} exceeds 6 words`);
    }
    if (/Co-authored-by:/i.test(message)) {
      reasons.push('commit carries a Co-authored-by trailer');
    }
  }

  if (!Number.isFinite(now)) reasons.push('clock is invalid');

  return { eligible: reasons.length === 0, number: pr?.number, reasons };
}
