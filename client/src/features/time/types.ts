export interface TimeUser {
  _id: string;
  name: string;
  avatarUrl?: string;
}

/** One block of work logged against a task (a stopped timer or a manual entry). */
export interface TimeEntry {
  _id: string;
  task: string;
  user: TimeUser;
  startedAt: string;
  /** null while the timer is running. */
  endedAt: string | null;
  /** Whole minutes; 0 while the timer is running. */
  minutes: number;
  note: string;
  running: boolean;
  createdAt: string;
}

/** Response of GET /tasks/:id/time. */
export interface TaskTime {
  estimateMinutes: number | null;
  loggedMinutes: number;
  /** The caller's running timer when it runs on this task. */
  running: TimeEntry | null;
  entries: TimeEntry[];
}

export interface TimeTask {
  _id: string;
  title: string;
  /** "WEB-12"; empty for tasks without a number. */
  key: string;
  project?: string;
}

/** An entry as the timesheet lists it (task and user filled in). */
export interface SheetEntry {
  _id: string;
  user: TimeUser;
  task: TimeTask;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  note?: string;
}

export interface Timesheet {
  entries: SheetEntry[];
  totals: {
    minutes: number;
    byUser: { user: string; name: string; minutes: number }[];
    byDay: { day: string; minutes: number }[];
    byTask: { task: string; title: string; key: string; minutes: number }[];
  };
  /** More entries matched than were returned. */
  truncated: boolean;
}

/** The caller's running timer in the workspace (GET /time/running). */
export interface RunningTimer {
  _id: string;
  startedAt: string;
  task: TimeTask;
}

export interface LogTimeInput {
  minutes: number;
  /** ISO instant the work started; omitted = just now. */
  startedAt?: string;
  note?: string;
}
