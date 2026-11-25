export interface DocsDeps {
  defaults: {
    promoteAfter: number;
    maxPromotedRules: number;
    surfaces: string[];
  };
  payloadVersion: string;
}

export interface DocsResult {
  ok: boolean;
  findings: string[];
  warnings: string[];
}

export function checkDocs(root: string, deps?: DocsDeps): Promise<DocsResult>;
