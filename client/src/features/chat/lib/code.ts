/**
 * Recognising and describing a code snippet in a chat message.
 *
 * All of this is pure so it can be unit tested without a DOM (CON-202): the composer asks whether a
 * paste is code, the message renderer asks how to split a body into prose and fenced blocks, and the
 * code card asks what to call the download.
 */

/** Languages the highlighter is allowed to be asked for. Anything else renders as `text` (AC-086). */
export const CODE_LANGUAGES = [
  'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql', 'html', 'java', 'javascript', 'json',
  'jsx', 'markdown', 'php', 'python', 'ruby', 'rust', 'sql', 'swift', 'toml', 'tsx', 'typescript',
  'yaml',
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** Above this size a snippet is shown as plain monospace instead of being tokenised (NFR-032). */
export const MAX_HIGHLIGHT_LENGTH = 20_000;

/** A fence is ``` optionally followed by a language, at the start of a line. */
const FENCE_PATTERN = /^\s*```([\w+#-]*)\s*$/;

/** Markers that make a line look like code rather than prose (EC-035). */
const CODE_SIGNALS: readonly RegExp[] = [
  /^\s*(?:import|from|export|const|let|var|function|class|def|async|await|return|if|for|while|switch|case|try|catch|finally|throw|new|public|private|protected|static|void|type|interface|enum|package|using|namespace)\b/,
  /^\s*[})]?\s*[;{}]\s*$/,
  /=>/,
  /^\s*[#*/-]?\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i,
  /^\s*(?:console|Math|JSON|window|document|require|print|printf|fmt|os)\.\w+/,
  /^\s*<\/?[A-Za-z][\w-]*(?:\s|>|\/)/,
  /^\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[{;]?\s*$/,
  /^\s*[A-Za-z_$][\w$]*\s*(?:=|\+=|-=|\*=|\/=|:=)\s*\S/,
  /^\s*(?:\/\/|#\s|\/\*|\*\s)/,
  /^\s*[\w.]+\s*\((?:.*,.*)\)/,
];

const hasBalancedNoise = (line: string): boolean => line.length > 4 && !/^\s*$/.test(line);

/** How many lines of a block look like code. */
const signalCount = (lines: readonly string[]): number =>
  lines.filter(line => hasBalancedNoise(line) && CODE_SIGNALS.some(pattern => pattern.test(line))).length;

/** True when the text already carries a fence, so the composer must not wrap it again (EC-034). */
export const isFenced = (text: string): boolean => text.includes('```');

/**
 * Should a paste be offered as — or inserted as — a code block?
 *
 * Code detection needs a *signal*, not just a line break, so a two-line sentence stays prose
 * (EC-035). Text that is already fenced is never treated as a new snippet; the composer leaves it
 * alone (EC-034).
 */
export const detectSnippet = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length < 1) return false;
  // A paste that already carries its own fence needs no help and must not be double-wrapped
  if (isFenced(trimmed)) return false;

  const lines = trimmed.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return false;

  // One line of code is still code when it is unmistakable (e.g. `const x = 1;`)
  if (lines.length === 1) return signalCount(lines) === 1;
  // Several lines: require more than one signal spread across the block, so a sentence that wraps
  // and happens to start with "If" is not mistaken for code
  return signalCount(lines) >= 2;
};

/** Best-guess language for a snippet, or `text` when nothing is obvious. */
export const inferLanguage = (text: string): string => {
  const sample = text.trim();
  if (!sample) return 'text';

  // An existing fence already states the language; trust it over guessing
  for (const line of sample.split('\n')) {
    const match = FENCE_PATTERN.exec(line);
    if (match?.[1]) return normaliseLanguage(match[1]);
  }

  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(sample)) return 'sql';
  if (/^\s*<\?php/.test(sample)) return 'php';
  if (/(?:^|\s)(?:def|import)\s+\w+|^\s*from\s+\w+\s+import\s+/m.test(sample)) return 'python';
  if (/^\s*package\s+\w+|^\s*func\s+\w+\s*\(/m.test(sample)) return 'go';
  if (/^\s*(?:public\s+)?(?:class|interface)\s+\w+|System\.out\.println|^\s*import\s+java\./m.test(sample)) return 'java';
  if (/^\s*(?:fn|let\s+mut|use\s+\w+::|impl\s+\w+)/m.test(sample)) return 'rust';
  if (/^\s*(?:func|var|package)\s+\w+|\.swift$/.test(sample)) return 'swift';
  if (/^\s*(?:<[a-z!][\w-]*(?:\s|>)|<!DOCTYPE)/i.test(sample) && /<\/[a-z][\w-]*>/i.test(sample)) return 'html';
  if (/^\s*[.[\w"'-]+\s*[:{]/m.test(sample) && /^\s*[}\]]\s*,?\s*$/m.test(sample)) return 'json';
  if (/^\s*(?:[.#]?[\w-]+\s*\{[^}]*:[^}]*;)/m.test(sample)) return 'css';
  if (/^\s*(?:interface|type)\s+\w+\s*[={]|:\s*(?:string|number|boolean)\b/m.test(sample)) return 'typescript';
  if (/^\s*(?:import|export|const|let|var|function|class|async|await)\b/m.test(sample)) return 'javascript';
  if (/^\s*(?:#!\/|(?:\$\s|[A-Z_]+=\S))/m.test(sample)) return 'bash';

  return 'text';
};

/** Maps a free-form language label onto the set the highlighter knows, defaulting to `text`. */
export const normaliseLanguage = (raw: string | null | undefined): string => {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'text';
  const aliases: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', sh: 'bash',
    shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', rb: 'ruby', rs: 'rust',
    'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', md: 'markdown', html5: 'html', plaintext: 'text',
    txt: 'text', text: 'text',
  };
  const mapped = aliases[value] ?? value;
  return (CODE_LANGUAGES as readonly string[]).includes(mapped) ? mapped : 'text';
};

/**
 * Wraps a pasted snippet in a fence, unless it already has one (EC-034).
 * The language tag is inferred so the receiving renderer can highlight without guessing again.
 */
export const fenceOf = (text: string): string => {
  const trimmed = text.replace(/^\n+|\n+$/g, '');
  if (isFenced(trimmed)) return trimmed;
  const language = inferLanguage(trimmed);
  return `\`\`\`${language === 'text' ? '' : language}\n${trimmed}\n\`\`\``;
};

/** File extension used when the snippet is downloaded (AC-085). */
export const extensionOf = (language: string | null | undefined): string => {
  const extensions: Record<string, string> = {
    bash: 'sh', c: 'c', cpp: 'cpp', csharp: 'cs', css: 'css', diff: 'diff', go: 'go',
    graphql: 'graphql', html: 'html', java: 'java', javascript: 'js', json: 'json', jsx: 'jsx',
    markdown: 'md', php: 'php', python: 'py', ruby: 'rb', rust: 'rs', sql: 'sql', swift: 'swift',
    toml: 'toml', tsx: 'tsx', typescript: 'ts', yaml: 'yml',
  };
  return extensions[normaliseLanguage(language)] ?? 'txt';
};

/** One fenced block found inside a message body. */
export interface CodeSegment {
  kind: 'code';
  /** The code without its fences. This is what Copy puts on the clipboard (AC-085). */
  code: string;
  /** A language the highlighter knows, or `text`. */
  language: string;
  /** Raw language tag as written, for the label when it is more specific than the mapped one. */
  label: string;
}

/** Prose between (or around) fenced blocks. */
export interface TextSegment {
  kind: 'text';
  text: string;
}

export type BodySegment = TextSegment | CodeSegment;

/**
 * Splits a message body into prose and fenced blocks, in order (FR-081, NFR-037).
 *
 * Only real fences produce code segments: a message is not re-interpreted as markdown, and no segment
 * is ever turned into HTML — the renderer walks these segments into React nodes.
 */
export const parseBody = (body: string): BodySegment[] => {
  const text = body ?? '';
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const segments: BodySegment[] = [];
  let prose: string[] = [];
  let index = 0;

  const flushProse = () => {
    const joined = prose.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined.trim()) segments.push({ kind: 'text', text: joined });
    prose = [];
  };

  while (index < lines.length) {
    const opening = FENCE_PATTERN.exec(lines[index]);
    if (!opening) {
      prose.push(lines[index]);
      index += 1;
      continue;
    }

    // Find the closing fence; an unterminated block runs to the end of the message
    let end = index + 1;
    while (end < lines.length && !FENCE_PATTERN.test(lines[end])) end += 1;

    flushProse();
    const code = lines.slice(index + 1, end).join('\n');
    const declared = opening[1] || '';
    // An empty block is not worth a card
    if (code.trim()) {
      segments.push({
        kind: 'code',
        code,
        language: normaliseLanguage(declared || inferLanguage(code)),
        label: declared.trim().toLowerCase() || normaliseLanguage(declared || inferLanguage(code)),
      });
    }
    index = end + 1;
  }

  flushProse();
  return segments;
};

/** True when a message body should render at least one code card (FR-081). */
export const hasCode = (body: string): boolean =>
  parseBody(body).some(segment => segment.kind === 'code');

/**
 * A body that is clearly code but was never fenced — the "pasted without the composer" case.
 * Returns it as a single code segment so the reader still gets the card (AC-084).
 */
export const codeOnlySegment = (body: string): CodeSegment | null => {
  if (!detectSnippet(body)) return null;
  return {
    kind: 'code',
    code: body.trim(),
    language: normaliseLanguage(inferLanguage(body)),
    label: normaliseLanguage(inferLanguage(body)),
  };
};

/** Above the cap a snippet is not tokenised at all (NFR-032). */
export const shouldHighlight = (code: string, language: string): boolean =>
  code.length <= MAX_HIGHLIGHT_LENGTH && normaliseLanguage(language) !== 'text';