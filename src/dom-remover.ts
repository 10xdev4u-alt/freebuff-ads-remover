/**
 * DOM-level ad removal (opt-in, default off).
 *
 * CSS hiding (css-injector) is the first line of defense but can be defeated by
 * `!important` overrides or partial re-renders that re-show a node. This module
 * emits a self-contained script that *removes* ad nodes from the DOM on every
 * mutation. It is a belt-and-suspenders layer on top of network blocking and
 * CSS, and is OFF by default until verified in the real app.
 *
 * Safety rules:
 *  - Only high-precision selectors (no broad `[class*="..."]` substrings), so we
 *    never delete legitimate UI that happens to contain an ad token.
 *  - Combined into a single querySelectorAll per pass (not 55 separate walks).
 *  - Debounced via requestAnimationFrame to avoid layout thrash.
 *  - Teardown restores patched history methods and disconnects the observer.
 *  - Versioned guard so re-activation works after deactivate().
 */

/** High-precision selectors safe for DOM deletion. Broad substrings stay CSS-only. */
export const DOM_REMOVAL_SELECTORS: string[] = [
  'a.sponsored-ad',
  'a.ad-card',
  '[data-ad-surface]',
  '.ad-banner',
  '.ad-showcase',
];

export interface DomRemoverOptions {
  selectors: string[];
  debug?: boolean;
}

export function buildDomRemoverScript(options: DomRemoverOptions): string {
  const selectors = JSON.stringify(options.selectors);
  const debug = options.debug ? 'true' : 'false';
  return `(function () {
  var VERSION = 1;
  var GUARD = '__farBuffDomRemover_v' + VERSION;
  if (window[GUARD]) return;
  window[GUARD] = true;
  var selectors = ${selectors};
  var debug = ${debug};
  var combined = selectors.join(',');
  var rafPending = false;
  var observer = null;
  var origPush = history.pushState;
  var origReplace = history.replaceState;

  function remove() {
    rafPending = false;
    var nodes;
    try { nodes = document.querySelectorAll(combined); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n && n.parentNode) {
        if (debug) console.debug('[farBuff] removing ad node', n);
        n.parentNode.removeChild(n);
      }
    }
  }
  function schedule() {
    if (rafPending) return;
    rafPending = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (cb) { setTimeout(cb, 16); })(remove);
  }
  function start() {
    remove();
    if (!document.body) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    history.pushState = function () { var r = origPush.apply(this, arguments); schedule(); return r; };
    history.replaceState = function () { var r = origReplace.apply(this, arguments); schedule(); return r; };
    window.addEventListener('popstate', schedule);
  }
  window.__farBuffDomRemoverTeardown = function () {
    if (observer) { observer.disconnect(); observer = null; }
    history.pushState = origPush;
    history.replaceState = origReplace;
    delete window[GUARD];
    delete window.__farBuffDomRemoverTeardown;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();`;
}

export function buildDomRemoverFromSelectors(): string {
  return buildDomRemoverScript({ selectors: DOM_REMOVAL_SELECTORS, debug: false });
}
