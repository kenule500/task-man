import { useEffect, useState } from 'react';

export interface OutlineItem {
  id: string;
  label: string;
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The sub-headings (h4) of one section, for the "On this page" rail. Headings inside live examples are skipped.
 * Sub-headings are plain markup without ids, so each gets one here (`<section>--<text>-<n>`) to be linkable.
 */
export const useSectionOutline = (sectionId: string): OutlineItem[] => {
  const [items, setItems] = useState<OutlineItem[]>([]);

  useEffect(() => {
    const root = document.getElementById(sectionId);
    const headings = Array.from(root?.querySelectorAll('h4') ?? []).filter(heading => !heading.closest('[data-demo]'));
    const next = headings.map((heading, index) => {
      if (!heading.id) heading.id = `${sectionId}--${slug(heading.textContent ?? '')}-${index}`;
      return { id: heading.id, label: heading.textContent ?? '' };
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(next);
  }, [sectionId]);

  return items;
};
