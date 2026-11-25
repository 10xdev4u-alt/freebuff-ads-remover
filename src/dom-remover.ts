/**
 * DOM-level ad removal (opt-in, default off) — shadow-piercing.
 *
 * Emits a self-contained script that removes ad nodes from light DOM, shadow
 * roots, and same-origin iframes. Per-root MutationObservers + an
 * attachShadow hook so roots created after injection are covered.
 *
 * Exposes window.__farBuffDomArmor = { version, stats, removeNow, teardown }.
 */

import { AD_CSS_SELECTORS } from './types.js';
import type { AdSurface } from './types.js';

// Derived from the registry so a selector added to AD_CSS_SELECTORS reaches the
// DOM remover without a second hardcoded list drifting behind it.
export const DOM_REMOVAL_SELECTORS: string[] = [
  ...new Set(Object.values(AD_CSS_SELECTORS).flat()),
];

export interface DomRemoverOptions {
  selectors: string[];
  debug?: boolean;
}

export function buildDomRemoverScript(options: DomRemoverOptions): string {
  const selectors = JSON.stringify(options.selectors);
  const debug = options.debug ? 'true' : 'false';
  return `(function () {
  var VERSION = 3;
  var GUARD = '__farBuffDomArmor_v' + VERSION;
  if (window[GUARD]) return;
  window[GUARD] = true;
  var selectors = ${selectors};
  var debug = ${debug};
  var combined = selectors.join(',');
  var rafPending = false;
  var rafId = null;
  var observers = [];
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  var origAttachShadow = Element.prototype.attachShadow;
  var stats = { removed: 0, passes: 0 };
  var teardownFns = [];

  function safeQuery(root) {
    if (!root || !root.querySelectorAll) return [];
    try { return root.querySelectorAll(combined); } catch (e) { return []; }
  }

  function removeRoot(root) {
    if (!root) return;
    var nodes = safeQuery(root);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n && n.parentNode && n !== document.documentElement && n !== document.body) {
        if (debug) console.debug('[farBuff] removing ad node', n);
        n.parentNode.removeChild(n);
        stats.removed++;
      }
    }
    // recurse shadow roots + same-origin iframes; a hostile or partially
    // constructed host must not abort the sweep.
    var all = [];
    try { all = root.querySelectorAll ? root.querySelectorAll('*') : []; } catch (e) { return; }
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      var sr = null;
      try { sr = el.shadowRoot; } catch (e) {}
      if (sr) removeRoot(sr);
      if (el.tagName === 'IFRAME') {
        try {
          if (el.contentDocument) {
            removeRoot(el.contentDocument);
            observeRoot(el.contentDocument);
          }
        } catch (e) {}
      }
    }
  }

  function remove() {
    rafPending = false;
    rafId = null;
    stats.passes++;
    removeRoot(document);
  }

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    rafId = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (cb) { return setTimeout(cb, 16); })(remove);
  }

  function observeRoot(root) {
    if (!root) return;
    try {
      var obs = new MutationObserver(schedule);
      obs.observe(root, { childList: true, subtree: true });
      observers.push(obs);
    } catch (e) {}
  }

  // load does not bubble, so this must be a capture-phase listener on the
  // document to see iframes that navigate or are inserted after start.
  function onFrameLoad(event) {
    var target = event && event.target;
    if (!target || target.tagName !== 'IFRAME') return;
    try { observeRoot(target.contentDocument); } catch (e) {}
    schedule();
  }

  function onPopState() { schedule(); }
  function onWindowLoad() { schedule(); }

  function attachAll() {
    observeRoot(document);
    // observe existing shadow roots
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) observeRoot(all[i].shadowRoot);
    }
  }

  function start() {
    remove();
    attachAll();
    // patch attachShadow
    Element.prototype.attachShadow = function (init) {
      var sr = origAttachShadow.call(this, init);
      observeRoot(sr);
      schedule();
      return sr;
    };
    teardownFns.push(function () { Element.prototype.attachShadow = origAttachShadow; });
    history.pushState = function () { var r = origPush.apply(this, arguments); schedule(); return r; };
    history.replaceState = function () { var r = origReplace.apply(this, arguments); schedule(); return r; };
    window.addEventListener('popstate', onPopState);
    // iframe load (capture phase: load does not bubble)
    document.addEventListener('load', onFrameLoad, true);
    teardownFns.push(function () {
      document.removeEventListener('load', onFrameLoad, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('load', onWindowLoad);
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
      rafPending = false;
    });
    // one-shot window load for the initial document
    window.addEventListener('load', onWindowLoad, { once: true });
  }

  window.__farBuffDomArmor = {
    version: VERSION,
    stats: stats,
    removeNow: function () { remove(); },
    teardown: function () {
      observers.forEach(function (o) { try { o.disconnect(); } catch (e) {} });
      observers = [];
      teardownFns.forEach(function (f) { try { f(); } catch (e) {} });
      teardownFns = [];
      history.pushState = origPush;
      history.replaceState = origReplace;
      delete window[GUARD];
      delete window.__farBuffDomArmor;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();`;
}

/**
 * Selectors to inject for the surfaces the user has enabled. `undefined`
 * means "all surfaces", preserving the legacy no-argument behavior.
 */
export function selectorsForSurfaces(
  surfaces?: Record<AdSurface, boolean>,
  bySurface: Record<string, string[]> = AD_CSS_SELECTORS,
): string[] {
  const entries = Object.entries(bySurface) as [AdSurface, string[]][];
  const selected = surfaces ? entries.filter(([surface]) => surfaces[surface]) : entries;
  return [...new Set(selected.flatMap(([, selectors]) => selectors))];
}

export function buildDomRemoverFromSelectors(config?: { surfaces: Record<AdSurface, boolean> }): string {
  return buildDomRemoverScript({
    selectors: selectorsForSurfaces(config?.surfaces),
    debug: false,
  });
}
