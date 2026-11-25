import { describe, it, expect } from 'vitest';
import { buildDomRemoverScript } from '../src/dom-remover.js';

const script = () => buildDomRemoverScript({ selectors: ['.ad', '.sponsor'], debug: false });

describe('dynamic iframe coverage in the generated DOM remover', () => {
  it('bumps the guard version so an already-armed document re-arms', () => {
    expect(script()).toContain('var VERSION = 3');
  });

  it('observes an iframe document when the recursive sweep finds it', () => {
    expect(script()).toMatch(/removeRoot\(el\.contentDocument\);\s*observeRoot\(el\.contentDocument\);/);
  });

  it('registers a capture-phase load listener for iframes', () => {
    const s = script();
    expect(s).toContain("document.addEventListener('load',");
    expect(s).toMatch(/document\.addEventListener\('load',[^\n]*true\)/);
    expect(s).toContain('observeRoot(target.contentDocument)');
  });

  it('removes the capture-phase load listener on teardown', () => {
    const s = script();
    expect(s).toContain("document.removeEventListener('load',");
    expect(s).toMatch(/document\.removeEventListener\('load',[^\n]*true\)/);
  });

  it('keeps the existing one-shot window load schedule', () => {
    expect(script()).toContain("window.addEventListener('load'");
  });
});
