// Detects the anti-ad-block wall Freebuff renders when its AccessMonitor
// probe sees ad slots hidden via CSS (display:none / visibility:hidden /
// opacity:0). The wall text is the giveaway; network blocking alone never
// triggers it.

export const WALL_MARKERS = [
  'Please allow ads on Freebuff',
  'Ads keep your coding agent free',
  'Disable your ad blocker for this site',
  'Ads are still hidden',
  'Disable cosmetic filtering',
];

export function isWallText(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return WALL_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export function wallDetectorScript(): string {
  // Runs in the page. Returns true if the wall is currently rendered.
  return `(function(){try{var t=document.body?document.body.innerText||'':'';var m=${JSON.stringify(WALL_MARKERS)};return m.some(function(x){return t.toLowerCase().indexOf(x.toLowerCase())!==-1;});}catch(e){return false;}})()`;
}
