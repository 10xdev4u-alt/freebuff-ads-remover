export interface AuditDeltaResult {
  ok: boolean;
  findings: string[];
}

export interface AuditDeltaDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verifyDelta?: (delta: any, registry: any, corpusDir: string) => { pass: boolean; reason?: string | undefined; recall: number; precision: number; missed: string[]; fps: string[] };
  classifyRoute?: (route: string) => { candidate: boolean; confidence: number; signals: string[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RuleRegistry?: new () => any;
}

export function checkAuditDeltas(root: string, deps?: AuditDeltaDeps): AuditDeltaResult;
