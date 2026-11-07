/**
 * Post-removal DOM marker cleanup. Strips ad marker attributes from containers.
 */
export function neutralizeMarkers(root: Element, markers: string[]): number {
  let count = 0;
  for (const m of markers) {
    const els = root.querySelectorAll(`[${m}]`);
    els.forEach((el) => {
      el.removeAttribute(m);
      count++;
    });
  }
  // also scan attribute names containing markers
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (markers.some((m) => attr.name.includes(m.replace('data-', '')))) {
        el.removeAttribute(attr.name);
        count++;
      }
    }
  });
  return count;
}

export const DEFAULT_MARKERS = ['data-ad-slot', 'data-ad-client', 'data-google-query-id', 'data-ad-status'];
