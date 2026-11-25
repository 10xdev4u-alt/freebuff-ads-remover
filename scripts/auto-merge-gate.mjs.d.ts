export interface BotPrInput {
  pr: {
    number: number;
    state: string;
    draft: boolean;
    merged?: boolean;
    mergeable_state: string;
    author: { login: string } | null;
    base: { ref: string };
    head: { ref: string; sha: string };
    labels: Array<{ name: string }>;
  };
  reviews: Array<{
    user: { login: string };
    state: string;
    submitted_at: string;
    commit_id?: string | undefined;
  }>;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    completed_at?: string | undefined;
    started_at?: string | undefined;
  }>;
  commits: Array<{
    author: { name: string } | null;
    commit: {
      author?: { name: string } | undefined;
      message: string;
      committer: { date: string };
    };
  }>;
  now?: number;
}

export interface BotPrDecision {
  eligible: boolean;
  number: number;
  reasons: string[];
}

export const REQUIRED_CHECKS: readonly string[];

export function evaluateBotPr(input: BotPrInput): BotPrDecision;

export function isBotTrainPr(pr: BotPrInput["pr"]): boolean;
