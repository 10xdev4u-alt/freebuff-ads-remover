/**
 * DOM-level ad removal (opt-in, default off) — shadow-piercing.
 *
 * Emits a self-contained script that removes ad nodes from light DOM, shadow
 * roots, and same-origin iframes. Per-root MutationObservers + an
 * attachShadow hook so roots created after injection are covered.
 *
 * Exposes window.__farBuffDomArmor = { version, stats, removeNow, teardown }.
 */

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
  var VERSION = 2;
  var GUARD = '__farBuffDomArmor_v' + VERSION;
  if (window[GUARD]) return;
  window[GUARD] = true;
  var selectors = ${selectors};
  var debug = ${debug};
  var combined = selectors.join(',');
  var rafPending = false;
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
    // recurse shadow roots + same-origin iframes
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var j = 0; j < all.length; j++) {
      var el = all[j];
      if (el.shadowRoot) removeRoot(el.shadowRoot);
      if (el.tagName === 'IFRAME') {
        try { if (el.contentDocument) removeRoot(el.contentDocument); } catch (e) {}
      }
    }
  }

  function remove() {
    rafPending = false;
    stats.passes++;
    removeRoot(document);
  }

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (cb) { setTimeout(cb, 16); })(remove);
  }

  function observeRoot(root) {
    if (!root) return;
    try {
      var obs = new MutationObserver(schedule);
      obs.observe(root, { childList: true, subtree: true });
      observers.push(obs);
    } catch (e) {}
  }

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
    window.addEventListener('popstate', schedule);
    // iframe load
    window.addEventListener('load', function () { schedule(); }, { once: true });
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

export function buildDomRemoverFromSelectors(): string {
  return buildDomRemoverScript({ selectors: DOM_REMOVAL_SELECTORS, debug: false });
}
