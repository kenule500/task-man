// Search by prop name. Component pages render their props table from handwritten data, so the names are read back
// from the rendered page once (every page is mounted before anyone has typed in the search box).

/** Prop names documented on each page, joined by spaces, keyed by section id. */
export const collectPropNames = (ids: string[]): Record<string, string> => {
  const index: Record<string, string> = {};
  for (const id of ids) {
    const names = Array.from(document.getElementById(id)?.querySelectorAll('[data-prop-name]') ?? [])
      .map(node => node.textContent ?? '')
      .join(' ');
    if (names) index[id] = names;
  }
  return index;
};
