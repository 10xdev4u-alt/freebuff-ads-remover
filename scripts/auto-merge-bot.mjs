#!/usr/bin/env node
// Enables GitHub auto-merge for the reviewed bot train. Runs only from base
// context (schedule / dispatch / review submission) and never from PR-head
// code. Every decision is made by scripts/auto-merge-gate.mjs; an API error or
// ambiguous response stops the run instead of merging anything.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { evaluateBotPr, isBotTrainPr } from './auto-merge-gate.mjs';
import { normalizePrListEntry } from './auto-merge-shape.mjs';

function ghJson(args) {
  try {
    const out = execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out);
  } catch (error) {
    throw new Error(`gh api ${args.join(' ')} failed: ${error.stderr || error.message}`);
  }
}

// Pages must be drained: a >100-review PR can otherwise hide a newer
// CHANGES_REQUESTED, and a >100-check head can hide a required check.
function ghJsonAll(args) {
  try {
    const out = execFileSync('gh', ['api', '--paginate', '--slurp', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    // --slurp returns an array of pages, each itself an array for list
    // endpoints (object responses stay as page objects). Flatten one level.
    return Array.isArray(parsed) ? parsed.flat() : parsed;
  } catch (error) {
    throw new Error(`gh api --paginate ${args.join(' ')} failed: ${error.stderr || error.message}`);
  }
}

function ghMerge(number) {
  execFileSync('gh', ['pr', 'merge', String(number), '--auto', '--merge'], { stdio: 'inherit' });
}

function ghDisableAuto(number) {
  execFileSync('gh', ['pr', 'merge', String(number), '--disable-auto'], { stdio: 'inherit' });
}

function hasPendingRun(workflow, ref) {
  for (const status of ['queued', 'in_progress']) {
    const page = ghJson([
      `repos/{owner}/{repo}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(ref)}&status=${status}&per_page=1`,
    ]);
    if (page?.total_count > 0) return true;
  }
  return false;
}

// PRs opened by GITHUB_TOKEN get `action_required` CI runs with zero jobs, so
// their required checks never report SUCCESS. Dispatch the two check workflows
// on the bot branch itself; that runs in a normal workflow_dispatch context.
function requestChecks(pr, lines) {
  for (const workflow of ['ci.yml', 'heal-proof.yml']) {
    if (hasPendingRun(workflow, pr.head.ref)) continue;
    try {
      const args = ['workflow', 'run', workflow, '--ref', pr.head.ref];
      // heal-proof also publishes live receipts on dispatch; checks_only keeps
      // this repair from pushing a new commit to another bot PR.
      if (workflow === 'heal-proof.yml') args.push('--field', 'checks_only=true');
      execFileSync('gh', args, { stdio: 'inherit' });
      lines.push(`- #${pr.number} ${pr.head.ref}: requested ${workflow} checks on the PR head`);
    } catch (error) {
      lines.push(`- #${pr.number} ${pr.head.ref}: could not dispatch ${workflow}: ${error.message}`);
    }
  }
}

function main() {
  const prs = ghJsonAll(['repos/{owner}/{repo}/pulls?state=open&per_page=100&sort=created&direction=asc']);
  if (!Array.isArray(prs)) throw new Error('pull list was not an array');

  const lines = [`Bot train: ${prs.length} open PR(s) inspected.`];
  for (const listed of prs) {
    // REST list entries put the author under `user` and leave mergeable_state
    // unresolved. Normalize before allowlisting, then fetch the detail view.
    const candidate = normalizePrListEntry(listed);
    if (!isBotTrainPr(candidate)) continue;
    const detail = ghJson([`repos/{owner}/{repo}/pulls/${candidate.number}`]);
    const pr = normalizePrListEntry(listed, detail);
    const number = pr.number;
    const sha = pr.head.sha;
    const reviews = ghJsonAll([`repos/{owner}/{repo}/pulls/${number}/reviews?per_page=100`]);
    const commits = ghJsonAll([`repos/{owner}/{repo}/pulls/${number}/commits?per_page=100`]);
    const checkPages = ghJsonAll([`repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`]);
    const checks = (Array.isArray(checkPages) ? checkPages : [checkPages])
      .flatMap((page) => (Array.isArray(page?.check_runs) ? page.check_runs : Array.isArray(page) ? page : []));
    const decision = evaluateBotPr({ pr, reviews, commits, checks });

    if (!decision.eligible) {
      lines.push(`- #${number} ${pr.head.ref}: blocked — ${decision.reasons.join('; ')}`);
      // Auto-merge is not a set-and-forget gate: a later hold label or commit
      // must revoke it, because neither is branch protection.
      if (pr.auto_merge) {
        ghDisableAuto(number);
        lines.push(`- #${number} ${pr.head.ref}: auto-merge disabled after re-check`);
      }
      const otherBlockers = decision.reasons.filter((r) => !r.startsWith('check '));
      if (otherBlockers.length === 0) requestChecks(pr, lines);
      continue;
    }
    if (pr.auto_merge) {
      lines.push(`- #${number} ${pr.head.ref}: auto-merge already enabled and still eligible`);
      continue;
    }
    ghMerge(number);
    lines.push(`- #${number} ${pr.head.ref}: auto-merge enabled (--merge)`);
  }

  const summary = lines.join('\n');
  process.stdout.write(`${summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`auto-merge bot failed closed: ${error.message}\n`);
  process.exit(1);
}
