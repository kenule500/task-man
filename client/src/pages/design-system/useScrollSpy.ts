import { useEffect, useState } from 'react';

/**
 * Tracks which section (by element id) is nearest the top of the viewport.
 * Without IntersectionObserver (old browsers, jsdom) it keeps the first id.
 */
export const useScrollSpy = (ids: string[]): [string, (id: string) => void] => {
  const [active, setActive] = useState(ids[0] ?? '');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || ids.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const [first] = [...visible.entries()].sort((a, b) => a[1] - b[1]);
        if (first) setActive(first[0]);
      },
      // Active zone: from just under the sticky header to 40% down the viewport.
      { rootMargin: '-96px 0px -60% 0px' },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);

  return [ids.includes(active) ? active : (ids[0] ?? ''), setActive];
};
