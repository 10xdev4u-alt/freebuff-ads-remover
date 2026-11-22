export interface LedgerResult {
  ok: boolean;
  findings: string[];
  warnings: string[];
}

export interface LedgerDeps {
  runVitest?: () => { code: number; out: string };
  verifyManifest?: (manifest: unknown, publicKey: string) => boolean | Promise<boolean>;
}

export function checkLedger(root: string, deps?: LedgerDeps): Promise<LedgerResult>;
