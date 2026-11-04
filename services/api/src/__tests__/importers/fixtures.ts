// Small, realistic exports used by the importer unit tests and the import integration tests.

/** A Trello board export: three open lists, one archived list, one archived card, a checklist and a comment. */
export const trelloBoard = {
  id: 'board1',
  name: 'Website relaunch',
  lists: [
    { id: 'l-todo', name: 'To Do', closed: false, pos: 1000 },
    { id: 'l-doing', name: 'Doing', closed: false, pos: 2000 },
    { id: 'l-done', name: 'Done', closed: false, pos: 3000 },
    { id: 'l-old', name: 'Old ideas', closed: true, pos: 4000 },
  ],
  members: [
    { id: 'm1', fullName: 'Dan Developer', username: 'dan' },
    { id: 'm2', fullName: 'Grace Hopper', username: 'grace' },
  ],
  labels: [
    { id: 'lb1', name: 'design', color: 'green' },
    { id: 'lb2', name: '', color: 'red' },
  ],
  cards: [
    {
      id: 'c1', name: 'Design landing page', desc: 'Hero, pricing and footer.', idList: 'l-doing', pos: 2048, closed: false,
      due: '2030-06-15T12:00:00.000Z', start: '2030-06-01T00:00:00.000Z', idMembers: ['m1'], idChecklists: ['ck1'],
      labels: [{ id: 'lb1', name: 'design', color: 'green' }, { id: 'lb2', name: '', color: 'red' }],
    },
    { id: 'c2', name: 'Write copy', desc: '', idList: 'l-todo', pos: 1024, closed: false, due: null, idMembers: ['m2'], labels: [] },
    { id: 'c3', name: 'Ship it', desc: '', idList: 'l-done', pos: 1024, closed: false, due: '2030-07-01T09:00:00.000Z', idMembers: [], labels: [] },
    { id: 'c4', name: 'Archived card', desc: '', idList: 'l-todo', pos: 3072, closed: true, due: null, idMembers: [], labels: [] },
    { id: 'c5', name: 'In an archived list', desc: '', idList: 'l-old', pos: 1024, closed: false, due: null, idMembers: [], labels: [] },
  ],
  checklists: [
    {
      id: 'ck1', idCard: 'c1', name: 'Launch checks',
      checkItems: [{ name: 'Mobile layout', state: 'complete' }, { name: 'Dark mode', state: 'incomplete' }],
    },
  ],
  actions: [
    {
      type: 'commentCard', date: '2030-05-20T10:30:00.000Z', idMemberCreator: 'm2',
      memberCreator: { id: 'm2', fullName: 'Grace Hopper', username: 'grace' },
      data: { text: 'Use the new brand colours.', card: { id: 'c1', name: 'Design landing page' } },
    },
    { type: 'updateCard', date: '2030-05-21T10:30:00.000Z', data: { card: { id: 'c1' } } },
  ],
};

export const trelloJson = (): string => JSON.stringify(trelloBoard);

const q = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Jira "Export issues > CSV": repeated Labels / Sprint / Comment columns, parents by issue id, an epic, a sub-task. */
export const jiraCsv = (): string => {
  const header = [
    'Summary', 'Issue key', 'Issue id', 'Issue Type', 'Status', 'Priority', 'Assignee', 'Reporter', 'Created', 'Due date',
    'Labels', 'Labels', 'Parent', 'Sprint', 'Sprint', 'Custom field (Story Points)', 'Description', 'Comment',
  ];
  const rows = [
    ['Checkout epic', 'PAY-1', '10001', 'Epic', 'To Do', 'High', '', 'Olivia Owner', '12/Mar/24 9:30 AM', '', '', '', '', '', '', '', 'Everything about paying', ''],
    [
      'Add card form', 'PAY-2', '10002', 'Story', 'In Progress', 'Medium', 'Dan Developer', 'Olivia Owner', '13/Mar/24 10:00 AM', '20/Mar/24 12:00 AM',
      'frontend', 'payments', '10001', 'Sprint 1', 'Sprint 2', '5', 'Line one\nline two with "quotes"',
      '14/Mar/24 2:15 PM;5b10a2844c20165700ede21g;Looks good; ship it',
    ],
    ['Validate card number', 'PAY-3', '10003', 'Sub-task', 'To Do', 'Low', 'Dan Developer', 'Olivia Owner', '13/Mar/24 11:00 AM', '', '', '', '10002', 'Sprint 2', '', '2', '', ''],
    ['Fix crash on submit', 'PAY-4', '10004', 'Bug', 'Done', 'Highest', '', 'Olivia Owner', '15/Mar/24 8:00 AM', '18/Mar/24 12:00 AM', 'urgent', '', '', 'Sprint 1', '', '3', '', ''],
  ];
  return [header, ...rows].map(row => row.map(q).join(',')).join('\r\n') + '\r\n';
};

/** The template of the import page, filled in. */
export const genericCsv = (): string => [
  'title,description,status,priority,type,labels,assignee_email,due_date,start_date,story_points,parent_id,id',
  'Design login,"Wireframes, prototype",In progress,high,story,"design,ux",DAN@example.com,2030-06-15,2030-06-01,5,,T-1',
  'Review copy,,To do,medium,task,content,,2030-06-20,,,T-1,T-2',
  'Deploy,,Done,low,bug,,,2030-06-25,,,,T-3',
].join('\r\n') + '\r\n';
