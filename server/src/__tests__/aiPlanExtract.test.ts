import { DocumentError, detectKind, extensionOf, extractDocument, wordXmlToText } from '../utils/ai/plan/extract.js';
import { findHeadings, normalizeText, previewOf, shortenForModel } from '../utils/ai/plan/text.js';
import { makeDocx, makePdf, makeZip, REQUIREMENTS } from './helpers/documents.js';

const failure = async (run: () => Promise<unknown> | unknown): Promise<DocumentError> => {
  const error = await Promise.resolve().then(run).then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(DocumentError);
  return error as DocumentError;
};

describe('detectKind', () => {
  it('AC-001: needs the extension and the first bytes to agree', () => {
    expect(detectKind('plan.pdf', Buffer.from('%PDF-1.7 ...'))).toBe('pdf');
    expect(detectKind('PLAN.PDF', Buffer.from('%PDF-1.4'))).toBe('pdf');
    expect(detectKind('spec.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toBe('docx');
    expect(detectKind('notes.md', Buffer.from('# Title'))).toBe('text');
    expect(detectKind('notes.markdown', Buffer.from('# Title'))).toBe('text');
    expect(detectKind('notes.txt', Buffer.from('plain'))).toBe('text');
  });

  it('AC-001: refuses a mismatch, an unknown extension and old .doc files with 415', () => {
    for (const [name, bytes] of [
      ['fake.pdf', Buffer.from('hello world')], ['fake.docx', Buffer.from('%PDF-1.4')], ['image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
      ['noextension', Buffer.from('text')], ['old.doc', Buffer.from([0xd0, 0xcf, 0x11, 0xe0])], ['.txt', Buffer.from('hidden file named txt')],
      ['binary.txt', Buffer.from([0x68, 0x00, 0x69])], ['wide.txt', Buffer.from([0xff, 0xfe, 0x68, 0x00])],
    ] as [string, Buffer][]) {
      let caught: unknown;
      try {
        detectKind(name, bytes);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(DocumentError);
      expect((caught as DocumentError).status).toBe(415);
    }
  });

  it('AC-001: reads the extension from the last path segment only', () => {
    expect(extensionOf('a.b/c.TXT')).toBe('txt');
    expect(extensionOf('C:\\docs\\plan.md')).toBe('md');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('extractDocument', () => {
  it('AC-001: reads UTF-8 text and Markdown, with or without a BOM, and cleans it', async () => {
    const raw = `\ufeff# Shop\r\n\r\n\r\n\r\nCustomers   can\tpay\u0007 by card.\u200b\r\n`;
    const result = await extractDocument('shop.md', Buffer.from(raw, 'utf8'));
    expect(result.kind).toBe('text');
    expect(result.mimeType).toBe('text/plain');
    expect(result.text).toBe('# Shop\n\nCustomers can pay by card.');
  });

  it('AC-001: refuses text that is not valid UTF-8', async () => {
    const error = await failure(() => extractDocument('latin.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6d, 0x65, 0x6e, 0x75])));
    expect(error.status).toBe(415);
  });

  it('AC-001: reads a DOCX', async () => {
    const result = await extractDocument('spec.docx', await makeDocx(REQUIREMENTS));
    expect(result.kind).toBe('docx');
    expect(result.mimeType).toContain('wordprocessingml');
    expect(result.text).toContain('Customers can browse the catalogue');
    expect(result.text).toContain('Staff can add new books');
  });

  it('AC-001: refuses a zip that is not a DOCX and a damaged DOCX', async () => {
    const zip = await makeZip();
    expect((await failure(() => extractDocument('x.docx', zip))).status).toBe(415);
    const damaged = (await makeDocx(REQUIREMENTS)).subarray(0, 60);
    expect((await failure(() => extractDocument('x.docx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), damaged])))).status).toBe(422);
  });

  it('AC-001: reads a PDF', async () => {
    const result = await extractDocument('spec.pdf', makePdf(REQUIREMENTS));
    expect(result.kind).toBe('pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.text).toContain('Online Bookshop requirements');
    expect(result.text).toContain('pay by card');
  });

  it('AC-001: answers 422 for a damaged PDF and for a document without text', async () => {
    expect((await failure(() => extractDocument('x.pdf', Buffer.from('%PDF-1.4\nthis is not a real pdf body')))).status).toBe(422);
    const empty = await failure(() => extractDocument('empty.pdf', makePdf([''])));
    expect(empty).toMatchObject({ status: 422, code: 'EMPTY_DOCUMENT' });
    expect((await failure(() => extractDocument('blank.txt', Buffer.from('   \n\n  ')))).code).toBe('EMPTY_DOCUMENT');
    expect((await failure(() => extractDocument('short.txt', Buffer.from('too short')))).status).toBe(422);
  });
});

describe('normalizeText', () => {
  it('AC-012: removes control and invisible characters, joins spaces and limits blank lines', () => {
    expect(normalizeText('a\u0007b\u202ec  d\n\n\n\ne\u00a0\u00a0f\r\n  g  ')).toBe('abc d\n\ne f\ng');
  });

  it('AC-012: is fast on very long runs of spaces', () => {
    const started = Date.now();
    normalizeText(`${' '.repeat(200_000)}x${' '.repeat(200_000)}\n`);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('shortenForModel', () => {
  const heading = (n: number) => `${n}. Section ${n} requirements`;
  const body = (n: number) => `${heading(n)}\n${'The system shall do something useful. '.repeat(40)}`;
  const document = Array.from({ length: 60 }, (_, index) => body(index + 1)).join('\n\n');

  it('AC-012: leaves a short document alone', () => {
    expect(shortenForModel('short text', 100)).toEqual({ text: 'short text', truncated: false, omittedChars: 0 });
  });

  it('AC-006/AC-012: keeps the beginning and the headings of what was left out, within the budget, and says it was cut', () => {
    const result = shortenForModel(document, 20_000);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(20_000);
    expect(result.text.startsWith('1. Section 1 requirements')).toBe(true);
    expect(result.text).toContain('the middle of the document is omitted');
    expect(result.text).toContain('Section headings found in the omitted part:');
    expect(result.text).toContain('- 60. Section 60 requirements');
    expect(result.omittedChars).toBeGreaterThan(0);
  });

  it('AC-012: cuts at a line break when it can', () => {
    const result = shortenForModel(document, 10_000);
    const head = result.text.split('\n\n[...')[0];
    expect(document.startsWith(head)).toBe(true);
    expect(document.charAt(head.length)).toBe('\n');
  });

  it('AC-012: finds Markdown, numbered and capitalised headings only', () => {
    expect(findHeadings('# Goals\nplain sentence here.\n2.1 Login\nTHE SCOPE\nok\nChapter 3 Payments')).toEqual(['# Goals', '2.1 Login', 'THE SCOPE', 'Chapter 3 Payments']);
  });

  it('AC-012: previews the first characters', () => {
    expect(previewOf('abc', 10)).toBe('abc');
    expect(previewOf('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('wordXmlToText', () => {
  const body = (inner: string) => `<w:document><w:body>${inner}</w:body></w:document>`;

  it('AC-001: joins runs into paragraphs and keeps tabs, breaks and table cells apart', () => {
    const xml = body(
      '<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t xml:space="preserve">world</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>one</w:t><w:tab/><w:t>two</w:t><w:br/><w:t>three</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    expect(wordXmlToText(xml)).toBe('Hello world\none\ttwo\nthree\nA1\n\tB1\n\t\n');
  });

  it('AC-001: decodes entities, ignores deleted text and field codes, and survives broken markup', () => {
    expect(wordXmlToText(body('<w:p><w:r><w:t>R&amp;D &lt;5&gt; &#65;&#x42; &unknown;</w:t></w:r></w:p>'))).toBe('R&D <5> AB &unknown;\n');
    expect(wordXmlToText(body('<w:p><w:del><w:r><w:delText>removed</w:delText></w:r></w:del><w:r><w:instrText>FIELD</w:instrText><w:t>kept</w:t></w:r></w:p>'))).toBe('kept\n');
    expect(wordXmlToText('<w:p><w:r><w:t>cut off <w:')).toBe('cut off ');
    expect(wordXmlToText('<w:t/>not text<w:t>text</w:t>')).toBe('text');
  });

  it('AC-001: is fast on hostile input', () => {
    const started = Date.now();
    wordXmlToText(`<w:t>${'<'.repeat(300_000)}`);
    wordXmlToText('<w:p'.repeat(100_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
