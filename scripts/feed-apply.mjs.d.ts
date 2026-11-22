export interface FeedReceipt {
  healHash: string;
  version: number;
  appliedAt: string;
}

export interface FeedRules {
  addEndpoints: string[];
  addSelectors: Record<string, string[]>;
  source: string;
  healHash: string;
}

export interface ApplyFeedResult {
  receipt: FeedReceipt;
  rules: FeedRules;
  extraEndpoints: string[];
}

export interface ApplyFeedOptions {
  manifest: string;
  configDir: string;
  publicKey: string;
  previousPublicKey?: string;
}

export function applyFeed(options: ApplyFeedOptions): ApplyFeedResult;
