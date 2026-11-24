export interface ReleaseCutResult {
  status: 'cut' | 'none' | 'invalid';
  /** Why no cut was needed, when status is 'none'. */
  reason?: string;
  /** Why the inputs were rejected, when status is 'invalid'. */
  error?: string;
  version?: string;
  bump?: 'minor' | 'patch';
  payloadVersion?: string;
  artifactHash?: string;
  receiptFile?: string;
  receiptAt?: string;
}

export interface TagReadyResult {
  version: string;
}

/**
 * Decides whether the newest verified live receipt justifies a release.
 * Fails closed ('invalid') on any malformed, stale, ambiguous or regressed input.
 */
export function evaluateReleaseCut(root: string, now?: number): ReleaseCutResult;

/**
 * Asserts the recorded cut matches package.json and a committed, fresh,
 * passing live-e2e receipt. Throws on any disagreement.
 */
export function assertTagReady(root: string, now?: number): TagReadyResult;
