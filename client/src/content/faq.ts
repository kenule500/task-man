// Help center content. Plain data plus a pure search helper (unit tested).

export interface FaqItem {
  id: string;
  question: string;
  /** Plain text answer; sentences separated by spaces. Keep it short. */
  answer: string;
}

export interface FaqCategory {
  id: string;
  title: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        id: 'what-is-workspace',
        question: 'What is a workspace?',
        answer:
          'A workspace holds your projects, tasks and team. Everything you see is scoped to the workspace you are in. Use the workspace switcher at the top of the sidebar to move between workspaces.',
      },
      {
        id: 'create-first-task',
        question: 'How do I create my first task?',
        answer:
          'Open Tasks in the sidebar and choose Add Task. Give it a title, a due date and a priority. A start date, assignee, labels and prerequisites are optional.',
      },
      {
        id: 'invite-teammates',
        question: 'How do I invite teammates?',
        answer:
          'Open Team and invite people by email, choosing a role for each invitation. You can also share the invite code from the dashboard or Settings. Anyone who joins with the invite code starts as a Viewer.',
      },
      {
        id: 'regenerate-invite',
        question: 'What happens when I regenerate the invite code?',
        answer:
          'The old code and links stop working straight away. People who already joined keep their access.',
      },
    ],
  },
  {
    id: 'tasks-views',
    title: 'Tasks & views',
    items: [
      {
        id: 'four-views',
        question: 'What are the four task views?',
        answer:
          'List, Board, Calendar and Timeline. They show the same tasks and stay in sync. Switch between them with the view switcher on the Tasks page.',
      },
      {
        id: 'move-board',
        question: 'How do I change a task status on the Board?',
        answer:
          'Drag a card to another column (Pending, In Progress or Completed). Without a mouse, open the card menu and choose Move to.',
      },
      {
        id: 'inline-edit',
        question: 'Can I edit a task without opening it?',
        answer:
          'Yes. In the List view click a title, status, priority or date to edit it inline. The row actions menu is always reachable by keyboard.',
      },
      {
        id: 'dependencies',
        question: 'How do task dependencies work?',
        answer:
          'Pick prerequisites in the task form. The count shows on list rows and board cards, and the Timeline draws arrows between linked bars. Circular dependencies are rejected with the message "This dependency would create a cycle". Deleting a task removes it from the prerequisites of other tasks.',
      },
      {
        id: 'scheduling-conflict',
        question: 'What is a scheduling conflict?',
        answer:
          'A conflict appears when a task starts before its prerequisite is due. The Timeline shows a red dashed arrow so you can move one of the two dates.',
      },
      {
        id: 'subtasks',
        question: 'Can a task have subtasks?',
        answer:
          'Yes. Open a task and add subtasks to break the work into smaller steps. Subtasks belong to their parent task.',
      },
    ],
  },
  {
    id: 'projects-sprints',
    title: 'Projects & sprints',
    items: [
      {
        id: 'scrum-structure',
        question: 'How are projects, sprints and tasks organised?',
        answer:
          'Projects contain sprints, and sprints contain tasks. Tasks can have subtasks. The backlog holds the tasks of a project that are not in any sprint yet.',
      },
      {
        id: 'backlog',
        question: 'What is the backlog?',
        answer:
          'The backlog is every task in a project without a sprint. Plan work by moving backlog tasks into a sprint.',
      },
      {
        id: 'story-points',
        question: 'What are story points?',
        answer:
          'Story points are a relative estimate of effort for a task. Sprints add them up so you can compare planned work with what the team completes.',
      },
      {
        id: 'start-complete-sprint',
        question: 'How do I start and complete a sprint?',
        answer:
          'Open the sprint in your project and choose Start sprint when planning is done. When the work is finished choose Complete sprint. You need permission to edit projects to do this.',
      },
      {
        id: 'burndown',
        question: 'What is the burndown chart?',
        answer:
          'The burndown chart shows the remaining story points of a sprint over time, so you can see whether the team is on track to finish.',
      },
    ],
  },
  {
    id: 'team-roles',
    title: 'Team & roles',
    items: [
      {
        id: 'system-roles',
        question: 'What are the system roles?',
        answer:
          'Product Owner: full control of projects, tasks, team and settings.\nScrum Master: edits projects and tasks, and sees the team and reports.\nDeveloper: edits tasks, and sees projects, the team and reports.\nTeam Member: edits tasks, and sees projects and reports.\nViewer: read-only access to projects, tasks and reports.',
      },
      {
        id: 'custom-roles',
        question: 'Can I create a custom role?',
        answer:
          'Yes. Go to Settings, then Roles and permissions, and choose New role. Tick exactly the permissions you want. System roles cannot be edited or deleted.',
      },
      {
        id: 'change-role',
        question: 'How do I change a member role or remove someone?',
        answer:
          'Owners and anyone allowed to manage users can use the role menu on a member row to change the role, and the bin button to remove the member.',
      },
      {
        id: 'hidden-pages',
        question: 'Why can I not see a page or button?',
        answer:
          'Pages and buttons your role cannot use are hidden. Opening one by link shows an access message instead. Ask a workspace owner to change your role if you need access.',
      },
    ],
  },
  {
    id: 'notifications-account',
    title: 'Notifications & account',
    items: [
      {
        id: 'notifications-what',
        question: 'What notifications do I get?',
        answer:
          'You are notified when someone assigns you a task, completes a task you own or are assigned to, mentions you in a comment, or comments on a task you own or are assigned to. They appear under the bell in the top bar and in your inbox, and are kept for 90 days. You never get a notification for your own actions.',
      },
      {
        id: 'notifications-mention',
        question: 'How do I mention someone in a comment?',
        answer:
          'Type @ in a comment and pick a teammate from the list with the arrow keys and Enter, or tap a name. You can also type @FirstName or @First Last. Mentioned people are notified right away.',
      },
      {
        id: 'notifications-email',
        question: 'How do I choose which emails I get?',
        answer:
          'In-app notifications are always on. Under Settings, then Notifications, turn emails on or off: the general switch controls all emails, Task Assigned also covers mentions and comments on your tasks, and Task Completed covers finished tasks.',
      },
      {
        id: 'edit-profile',
        question: 'Where do I edit my profile?',
        answer: 'Under Settings, then Profile. You can change your name, job title and other details.',
      },
      {
        id: 'change-password',
        question: 'What happens when I change my password?',
        answer:
          'You are signed out of all your other devices. This device stays signed in, and the others must sign in again with the new password.',
      },
      {
        id: 'forgot-password',
        question: 'I forgot my password. What now?',
        answer:
          'Choose Forgot password on the sign-in page and we will email you a reset link.',
      },
      {
        id: 'session-expired',
        question: 'Why was I signed out?',
        answer:
          'You stay signed in for 7 days on each device. After that, or if you sign a device out from Security > Signed-in devices, you return to the sign-in page. Your work is saved on the server.',
      },
    ],
  },
  {
    id: 'mobile-offline',
    title: 'Mobile & offline',
    items: [
      {
        id: 'install-pwa',
        question: 'Can I install TaskMan on my phone or computer?',
        answer:
          'Yes. TaskMan is a progressive web app. Use Add to Home Screen in your phone browser, or the install icon in the address bar on desktop.',
      },
      {
        id: 'bottom-nav',
        question: 'How do I navigate on a phone?',
        answer:
          'On small screens the main pages are in a bottom navigation bar so they are reachable with one thumb. The full menu stays in the sidebar.',
      },
      {
        id: 'offline',
        question: 'Does TaskMan work offline?',
        answer:
          'Partly. The app shell and pages you already opened load without a connection, but offline mode is read-only. Reconnect to create or change anything.',
      },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    items: [
      {
        id: 'global-search',
        question: 'How do I search quickly?',
        answer: 'Press Ctrl+K (Cmd+K on Mac) to open search from anywhere.',
      },
      {
        id: 'gantt-keys',
        question: 'How do I move a bar on the Timeline with the keyboard?',
        answer:
          'Focus a bar and press the left or right arrow to move it one day. Hold Shift with the arrows to resize the bar instead.',
      },
      {
        id: 'send-comment',
        question: 'How do I send a comment from the keyboard?',
        answer: 'Press Ctrl+Enter (Cmd+Enter on Mac) in the comment box.',
      },
      {
        id: 'calendar-today',
        question: 'Is there a shortcut to jump to today in the calendar?',
        answer: 'Yes. Press T in the Calendar view to jump back to today.',
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & privacy',
    items: [
      {
        id: 'data-access',
        question: 'Who can see my workspace data?',
        answer:
          'Only members of the workspace, limited by their role. Every request is checked against your role and the workspace on the server.',
      },
      {
        id: 'other-devices',
        question: 'How do I sign out other devices?',
        answer:
          'Change your password. Doing so signs you out of every other device while keeping this one signed in.',
      },
      {
        id: 'report-problem',
        question: 'How do I report a bug or a security concern?',
        answer:
          'Ask a workspace owner first. For product questions, bug reports or security concerns, email support@taskman.io with the page you were on and what you expected to happen.',
      },
    ],
  },
];

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * Split `text` into segments, flagging the parts that match any query word
 * (case and diacritic insensitive). Used to wrap matches in <mark>.
 */
export const highlightSegments = (text: string, terms: string[]): TextSegment[] => {
  if (terms.length === 0 || !text) return [{ text, match: false }];

  // Normalise per UTF-16 unit while remembering which original index each unit came from
  let normalized = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const unit = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let j = 0; j < unit.length; j += 1) origin.push(i);
    normalized += unit;
  }

  const flagged = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (!term) continue;
    let from = normalized.indexOf(term);
    while (from !== -1) {
      for (let k = from; k < from + term.length; k += 1) flagged[origin[k]] = true;
      from = normalized.indexOf(term, from + 1);
    }
  }

  const segments: TextSegment[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = segments[segments.length - 1];
    if (last && last.match === flagged[i]) last.text += text[i];
    else segments.push({ text: text[i], match: flagged[i] });
  }
  return segments;
};

export interface FaqResult extends FaqItem {
  categoryId: string;
  categoryTitle: string;
  score: number;
}

/** Lowercase, strip diacritics, collapse whitespace. */
export const normalizeText = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Split a query into normalised words. */
export const queryTerms = (query: string): string[] => normalizeText(query).split(' ').filter(Boolean);

/**
 * Ranked search. Every word must appear in the question or the answer
 * (case and diacritic insensitive). Question hits outrank answer hits;
 * a whole-phrase match in the question ranks highest. Ties keep source order.
 * An empty query returns every entry in source order.
 */
export const searchFaq = (query: string, categories: FaqCategory[] = FAQ_CATEGORIES): FaqResult[] => {
  const terms = queryTerms(query);
  const phrase = terms.join(' ');
  const results: (FaqResult & { order: number })[] = [];
  let order = 0;

  for (const category of categories) {
    for (const item of category.items) {
      order += 1;
      const question = normalizeText(item.question);
      const answer = normalizeText(item.answer);
      let score = 0;
      let matches = true;

      for (const term of terms) {
        if (question.includes(term)) score += 10;
        else if (answer.includes(term)) score += 1;
        else {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      if (terms.length > 1 && question.includes(phrase)) score += 20;

      results.push({ ...item, categoryId: category.id, categoryTitle: category.title, score, order });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => {
      const { order, ...result } = entry;
      void order;
      return result;
    });
};
