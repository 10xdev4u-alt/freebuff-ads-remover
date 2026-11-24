export interface VersionBumpOptions {
  version: string;
  payloadVersion: string;
  artifactHash: string;
  receiptFile: string;
  receiptAt: string;
  notes: string;
  /** Release date, YYYY-MM-DD. */
  date: string;
}

export interface VersionBumpResult {
  files: string[];
}

/**
 * Applies a release bump to every coupled version surface and records the cut in
 * release/last-cut.json. Validates every expected token before writing, so a
 * missing marker leaves all files untouched.
 */
export function applyVersionBump(root: string, options: VersionBumpOptions): VersionBumpResult;
