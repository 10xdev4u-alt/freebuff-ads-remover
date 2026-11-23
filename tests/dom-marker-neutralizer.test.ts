// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { neutralizeMarkers, DEFAULT_MARKERS } from '../src/ghost/dom-marker-neutralizer.js';

describe('neutralizeMarkers', () => {
  it('strips exact marker attributes and counts them', () => {
    const root = document.createElement('div');
    const a = document.createElement('span');
    a.setAttribute('data-ad-slot', '1');
    const b = document.createElement('span');
    b.setAttribute('data-ad-client', '2');
    root.append(a, b);

    expect(neutralizeMarkers(root, ['data-ad-slot', 'data-ad-client'])).toBe(2);
    expect(a.hasAttribute('data-ad-slot')).toBe(false);
    expect(b.hasAttribute('data-ad-client')).toBe(false);
  });

  it('strips attributes whose names contain a marker stem', () => {
    const root = document.createElement('div');
    const el = document.createElement('span');
    el.setAttribute('data-ad-slot-extra', 'x');
    el.setAttribute('data-google-query-id', 'y');
    root.appendChild(el);

    expect(neutralizeMarkers(root, ['data-ad-slot', 'data-google-query-id'])).toBe(2);
    expect(el.hasAttribute('data-ad-slot-extra')).toBe(false);
    expect(el.hasAttribute('data-google-query-id')).toBe(false);
  });

  it('leaves unrelated attributes alone', () => {
    const root = document.createElement('div');
    const el = document.createElement('span');
    el.setAttribute('data-thread-id', 'keep');
    el.setAttribute('class', 'x');
    root.appendChild(el);

    expect(neutralizeMarkers(root, DEFAULT_MARKERS)).toBe(0);
    expect(el.getAttribute('data-thread-id')).toBe('keep');
  });

  it('handles an empty marker list and an empty root', () => {
    const root = document.createElement('div');
    expect(neutralizeMarkers(root, [])).toBe(0);
    expect(neutralizeMarkers(root, DEFAULT_MARKERS)).toBe(0);
  });

  it('scans nested descendants', () => {
    const root = document.createElement('div');
    const wrapper = document.createElement('section');
    const nested = document.createElement('i');
    nested.setAttribute('data-ad-status', 'loaded');
    wrapper.appendChild(nested);
    root.appendChild(wrapper);

    expect(neutralizeMarkers(root, ['data-ad-status'])).toBe(1);
  });
});
