export interface PrListEntry {
  number: number;
  author?: { login: string } | null;
  user?: { login: string } | null;
  [key: string]: unknown;
}

/** Merge the per-PR detail endpoint's fields into a REST list entry. */
export function normalizePrListEntry<T extends PrListEntry>(
  summary: T,
  detail?: { mergeable_state?: string | null },
): T & { author: { login: string } | null; mergeable_state: string | null };
