#!/usr/bin/env node
// Boundary adapter between GitHub's REST shapes and the pure eligibility gate.
// The list endpoint puts the PR author under `user` (with `author: null`) and
// leaves `mergeable_state` unresolved; the per-PR detail endpoint computes it.
// Normalizing here keeps every gate predicate in auto-merge-gate.mjs unchanged.

/**
 * Merge a REST list entry with its detail response.
 * An explicit `author` always wins over the derived `user`.
 */
export function normalizePrListEntry(summary, detail = {}) {
  return {
    ...summary,
    author: summary.author ?? summary.user ?? null,
    mergeable_state: detail.mergeable_state ?? summary.mergeable_state ?? null,
  };
}
