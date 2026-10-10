// Text and value clean-up shared by the importers and the commit step.
import type { ImportPriority } from './types.js';

// C0 control characters except tab and newline, plus DEL and the C1 range
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_AND_ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Strips control characters, normalises line breaks and trims; `multiline` keeps newlines and tabs. */
export const cleanText = (value: unknown, max: number, multiline = false): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let text = String(value).replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').replace(BIDI_AND_ZERO_WIDTH, '');
  text = multiline ? text.replace(/[ \t]+\n/g, '\n').trim() : text.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() : text;
};

/** True when `cleanText` would have to cut the value. */
export const exceeds = (value: unknown, max: number): boolean =>
  typeof value === 'string' && value.replace(/\r\n?/g, '\n').trim().length > max;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const validDay = (year: number, month: number, day: number): string | null => {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const monthNumber = (name: string): number => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const fullYear = (year: string): number => (year.length <= 2 ? 2000 + Number(year) : Number(year));

/**
 * A calendar day (YYYY-MM-DD) from the formats tools export: ISO, "12/Mar/24", "12 Mar 2024",
 * "2024/03/12" and numeric day/month/year when only one reading is possible. Null when unknown or ambiguous.
 */
export const parseCalendarDate = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(text);
  if (match) return validDay(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[\s/-]+([A-Za-z]{3,9})\.?[\s/,-]+(\d{2,4})(?!\d)/.exec(text);
  if (match && monthNumber(match[2]) > 0) return validDay(fullYear(match[3]), monthNumber(match[2]), Number(match[1]));

  match = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/.exec(text);
  if (match && monthNumber(match[1]) > 0) return validDay(Number(match[3]), monthNumber(match[1]), Number(match[2]));

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?!\d)/.exec(text);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    if (first > 12 && second <= 12) return validDay(year, second, first);
    if (second > 12 && first <= 12) return validDay(year, first, second);
    return null;
  }
  return null;
};

/** ISO date-time from an ISO string or a Jira style "12/Mar/24 9:30 AM"; a bare day becomes midnight UTC. */
export const parseDateTime = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const day = parseCalendarDate(text);
  if (!day) return null;
  const time = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/.exec(text);
  let hours = 0;
  let minutes = 0;
  if (time) {
    hours = Number(time[1]);
    minutes = Number(time[2]);
    const meridiem = time[3]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) {
      hours = 0;
      minutes = 0;
    }
  }
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, hours, minutes)).toISOString();
};

const PRIORITY_WORDS: Record<string, ImportPriority> = {
  highest: 'high', critical: 'high', blocker: 'high', urgent: 'high', high: 'high', major: 'high', p0: 'high', p1: 'high', '1': 'high',
  medium: 'medium', normal: 'medium', moderate: 'medium', p2: 'medium', '2': 'medium', '3': 'medium',
  low: 'low', lowest: 'low', minor: 'low', trivial: 'low', p3: 'low', p4: 'low', '4': 'low', '5': 'low',
};

export const normalizePriority = (raw: unknown): ImportPriority | null => {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return Object.hasOwn(PRIORITY_WORDS, key) ? PRIORITY_WORDS[key] : null;
};

/** A story point estimate: a number from 0 to 100, rounded; null when absent or out of range. */
export const parseStoryPoints = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return parseStoryPoints(Number(text));
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const looksLikeEmail = (value: string): boolean => EMAIL.test(value);

/** Splits a cell holding several values ("a, b; c") into trimmed, unique, non-empty parts. */
export const splitList = (raw: unknown, separators = /[,;\n]/): string[] => {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(separators)) {
    const value = part.trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      result.push(value);
    }
  }
  return result;
};

/** Suggested task status group for a raw status or list name. */
export const suggestStatus = (raw: string): 'pending' | 'in-progress' | 'completed' => {
  const name = raw.trim().toLowerCase();
  if (/\b(done|closed|complete|completed|resolved|finished|shipped|released|fixed|cancelled|canceled|archived)\b/.test(name)) return 'completed';
  if (/(in[\s-]?progress|doing|started|working|review|testing|\bqa\b|verify|active|ongoing|\bwip\b|develop)/.test(name)) return 'in-progress';
  return 'pending';
};

/** Suggested task type for a raw issue type. */
export const suggestType = (raw: string): 'story' | 'task' | 'bug' | 'spike' | 'epic' => {
  const name = raw.trim().toLowerCase();
  if (name.includes('epic')) return 'epic';
  if (name.includes('bug') || name.includes('defect') || name.includes('incident')) return 'bug';
  if (name.includes('story') || name.includes('feature') || name.includes('improvement')) return 'story';
  if (name.includes('spike') || name.includes('research')) return 'spike';
  return 'task';
};
