export interface ChainTracker {
  record(requestId: string | number, url: string): void;
  redirect(requestId: string | number, url: string): void;
  complete(requestId: string | number): boolean; // returns true if chain was ad
  isAdChain(requestId: string | number): boolean;
}

export function createChainTracker(isAd: (url: string) => boolean): ChainTracker {
  const chains = new Map<string | number, { urls: string[]; ad: boolean }>();
  return {
    record(requestId, url) {
      chains.set(requestId, { urls: [url], ad: isAd(url) });
    },
    redirect(requestId, url) {
      const c = chains.get(requestId);
      if (!c) { chains.set(requestId, { urls: [url], ad: isAd(url) }); return; }
      c.urls.push(url);
      if (isAd(url)) c.ad = true;
    },
    complete(requestId) {
      const c = chains.get(requestId);
      const ad = c?.ad ?? false;
      chains.delete(requestId);
      return ad;
    },
    isAdChain(requestId) {
      return chains.get(requestId)?.ad ?? false;
    },
  };
}
