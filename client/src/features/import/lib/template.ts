export const CSV_TEMPLATE_HEADERS = [
  'title', 'description', 'status', 'priority', 'type', 'labels', 'assignee_email', 'due_date', 'start_date',
  'story_points', 'parent_id', 'id',
] as const;

const cell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const EXAMPLES: string[][] = [
  ['Design the login page', 'Wireframes and a clickable prototype', 'In progress', 'high', 'story', 'design,ux', 'ada@example.com', '2030-06-15', '2030-06-01', '5', '', 'T-1'],
  ['Review the copy', '', 'To do', 'medium', 'task', 'content', '', '2030-06-20', '', '', 'T-1', 'T-2'],
];

/** The CSV the template button downloads: the header row and two example rows (CRLF, as RFC 4180 asks). */
export const csvTemplate = (): string =>
  [CSV_TEMPLATE_HEADERS.join(','), ...EXAMPLES.map(row => row.map(cell).join(','))].join('\r\n') + '\r\n';

/** Saves text as a file through a temporary link (UTF-8 with a byte order mark, so Excel reads accents). */
export const downloadTextFile = (filename: string, text: string): void => {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
