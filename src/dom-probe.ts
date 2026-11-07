export interface DomProbeResult {
  pass: boolean;
  installed: boolean;
  lightRemoved: boolean;
  shadowRemoved: boolean;
  controlSurvived: boolean;
}

export function buildDomProbeScript(): string {
  return `(function () {
  var armor = window.__farBuffDomArmor;
  var installed = !!armor;
  // light canary
  var light = document.createElement('div');
  light.setAttribute('data-ad-surface', 'far-canary');
  document.body.appendChild(light);
  // shadow canary
  var host = document.createElement('div');
  document.body.appendChild(host);
  var sr = host.attachShadow({ mode: 'open' });
  var shadow = document.createElement('div');
  shadow.setAttribute('data-ad-surface', 'far-canary');
  sr.appendChild(shadow);
  // control
  var control = document.createElement('div');
  control.setAttribute('data-far-control', '1');
  document.body.appendChild(control);

  function check() {
    var lightGone = !document.querySelector('[data-ad-surface="far-canary"]');
    var shadowGone = !sr.querySelector('[data-ad-surface="far-canary"]');
    var controlAlive = !!document.querySelector('[data-far-control="1"]');
    var removedOk = armor && armor.stats && armor.stats.removed >= 2;
    return { lightGone: lightGone, shadowGone: shadowGone, controlAlive: controlAlive, removedOk: !!removedOk };
  }

  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (armor && typeof armor.removeNow === 'function') armor.removeNow();
        var r = check();
        var pass = installed && r.lightGone && r.shadowGone && r.controlAlive;
        resolve({ pass: pass, installed: installed, lightRemoved: r.lightGone, shadowRemoved: r.shadowGone, controlSurvived: r.controlAlive });
      });
    });
  });
})();`;
}
