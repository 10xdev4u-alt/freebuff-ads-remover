export interface PageClientSanitizeResult {
  code: string;
  findings: string[];
  markersRemoved: number;
}

export interface PageClientSmokeResult {
  ok: boolean;
  error?: string;
}

export function sanitizePageClient(source: string): PageClientSanitizeResult;
export function smokeTestPageClient(code: string): PageClientSmokeResult;
