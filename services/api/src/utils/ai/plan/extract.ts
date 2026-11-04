import JSZip from 'jszip';
import { normalizeText } from './text.js';

// Turns an uploaded requirements document into plain text. The file type is decided by its extension AND its first
// bytes (the type the browser declares is never trusted), and nothing is written anywhere: the file stays in memory.

export type DocumentKind = 'pdf' | 'docx' | 'text';

export const DOCUMENT_MIME: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain',
};

/** Accepted extensions (a map lookup, not a property read from user input). */
const EXTENSIONS = new Map<string, DocumentKind>([
  ['pdf', 'pdf'], ['docx', 'docx'], ['txt', 'text'], ['md', 'text'], ['markdown', 'text'],
]);

const MAX_PDF_PAGES = 400;
/** Stop reading once this many characters are collected (the model never sees more than the configured budget). */
const MAX_COLLECTED_CHARS = 2_000_000;
const MAX_DOCX_ENTRIES = 5000;
/** Sum of the uncompressed sizes a DOCX may declare (guards against zip bombs). */
const MAX_DOCX_UNCOMPRESSED = 60 * 1024 * 1024;
const MAX_DOCX_XML = 40 * 1024 * 1024;

/** A refusal with an HTTP status and a stable code the web app can react to. */
export class DocumentError extends Error {
  constructor(readonly status: 413 | 415 | 422, readonly code: string, message: string) {
    super(message);
    this.name = 'DocumentError';
  }
}

export const extensionOf = (fileName: string): string => {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const UTF16_MARKS = [[0xff, 0xfe], [0xfe, 0xff]];

/** Decides the kind from extension and first bytes; both must agree. Throws a 415 `DocumentError` otherwise. */
export const detectKind = (fileName: string, buffer: Buffer): DocumentKind => {
  const extension = extensionOf(fileName);
  if (extension === 'doc') throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'Old .doc files are not supported. Save the document as .docx, PDF or plain text.');
  const kind = EXTENSIONS.get(extension);
  if (!kind) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'Upload a PDF, DOCX, TXT or Markdown file.');

  if (kind === 'pdf' && !startsWith(buffer, PDF_MAGIC)) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'This file is not a real PDF.');
  if (kind === 'docx' && !startsWith(buffer, ZIP_MAGIC)) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'This file is not a real DOCX document.');
  if (kind === 'text') {
    if (UTF16_MARKS.some(mark => startsWith(buffer, mark))) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'Text files must be saved as UTF-8.');
    // A NUL byte never appears in UTF-8 text; it means a binary file with a text name
    if (buffer.subarray(0, 8192).includes(0)) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'This file is not a text file.');
  }
  return kind;
};

// ----------------------------------------------------------------
// Readers
// ----------------------------------------------------------------
const readText = (buffer: Buffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'Text files must be saved as UTF-8.');
  }
};

const XML_ENTITIES = new Map([['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]]);

const decodeEntities = (text: string): string =>
  text.includes('&')
    ? text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (whole, name: string) => {
      if (name.startsWith('#')) {
        const code = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return XML_ENTITIES.get(name) ?? whole;
    })
    : text;

/**
 * The text of a Word document body (word/document.xml): paragraphs, line breaks, tabs and table cells. A single linear
 * scan with `indexOf` (no backtracking regular expressions), so a hostile file cannot make it slow.
 */
export const wordXmlToText = (xml: string): string => {
  let out = '';
  let inText = false;
  let position = 0;
  while (position < xml.length) {
    const open = xml.indexOf('<', position);
    if (open === -1) {
      if (inText) out += decodeEntities(xml.slice(position));
      break;
    }
    if (inText && open > position) out += decodeEntities(xml.slice(position, open));
    const close = xml.indexOf('>', open + 1);
    if (close === -1) break;
    const raw = xml.slice(open + 1, close);
    position = close + 1;

    const closing = raw.startsWith('/');
    const selfClosing = raw.endsWith('/');
    const body = closing ? raw.slice(1) : raw;
    let end = 0;
    while (end < body.length && body[end] !== ' ' && body[end] !== '/' && body[end] !== '\n' && body[end] !== '\t') end += 1;
    const name = body.slice(0, end);

    if (name === 'w:t') inText = !closing && !selfClosing;
    else if (closing && name === 'w:p') out += '\n';
    else if (!closing && (name === 'w:br' || name === 'w:cr')) out += '\n';
    else if (!closing && name === 'w:tab') out += '\t';
    else if (closing && name === 'w:tc') out += '\t';
    else if (closing && name === 'w:tr') out += '\n';
  }
  return out;
};

const readDocx = async (buffer: Buffer): Promise<string> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentError(422, 'UNREADABLE', 'This DOCX file is damaged and could not be read.');
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_DOCX_ENTRIES) throw new DocumentError(422, 'UNREADABLE', 'This DOCX file is not a normal document.');
  const sizeOf = (entry: JSZip.JSZipObject): number => (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  const total = entries.reduce((sum, entry) => sum + sizeOf(entry), 0);
  const body = zip.file('word/document.xml');
  if (!body) throw new DocumentError(415, 'UNSUPPORTED_TYPE', 'This file is not a real DOCX document.');
  if (total > MAX_DOCX_UNCOMPRESSED || sizeOf(body) > MAX_DOCX_XML) {
    throw new DocumentError(422, 'UNREADABLE', 'This DOCX file expands to far more than a normal document.');
  }
  try {
    return wordXmlToText(await body.async('string'));
  } catch {
    throw new DocumentError(422, 'UNREADABLE', 'This DOCX file could not be read.');
  }
};

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

const readPdf = async (buffer: Buffer): Promise<string> => {
  // Loaded on first use: the PDF reader is large and most requests never need it
  const { getDocumentProxy } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  const options: NonNullable<Parameters<typeof getDocumentProxy>[1]> & { isEvalSupported: boolean } = { isEvalSupported: false, useSystemFonts: false, verbosity: 0 };
  try {
    // A copy: PDF.js takes ownership of the array it is given
    pdf = await getDocumentProxy(new Uint8Array(buffer), options);
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'PasswordException') {
      throw new DocumentError(422, 'UNREADABLE', 'This PDF is password protected. Remove the password and upload it again.');
    }
    throw new DocumentError(422, 'UNREADABLE', 'This PDF is damaged and could not be read.');
  }
  try {
    const pages: string[] = [];
    let collected = 0;
    const last = Math.min(pdf.numPages, MAX_PDF_PAGES);
    for (let number = 1; number <= last && collected < MAX_COLLECTED_CHARS; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items as PdfTextItem[]) {
        if (typeof item.str !== 'string') continue;
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
      }
      pages.push(text);
      collected += text.length;
      page.cleanup();
    }
    return pages.join('\n\n');
  } catch {
    throw new DocumentError(422, 'UNREADABLE', 'This PDF could not be read.');
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
};

export interface ExtractedDocument {
  kind: DocumentKind;
  mimeType: string;
  /** Cleaned text of the whole document (not yet shortened for the model). */
  text: string;
}

/** Extracts the cleaned text of an uploaded file. Throws `DocumentError` (415 wrong type, 422 unreadable or empty). */
export const extractDocument = async (fileName: string, buffer: Buffer): Promise<ExtractedDocument> => {
  const kind = detectKind(fileName, buffer);
  const raw = kind === 'pdf' ? await readPdf(buffer) : kind === 'docx' ? await readDocx(buffer) : readText(buffer);
  const text = normalizeText(raw.slice(0, MAX_COLLECTED_CHARS));
  if (text.replace(/\s/g, '').length < 20) {
    throw new DocumentError(422, 'EMPTY_DOCUMENT', kind === 'pdf'
      ? 'No readable text was found in this PDF. If it is a scan, run it through text recognition (OCR) first.'
      : 'This document has no readable text.');
  }
  return { kind, mimeType: DOCUMENT_MIME[kind], text };
};
