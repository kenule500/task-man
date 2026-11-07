// Writes ten requirement documents of increasing size for the T7.5 latency measurement.
// They are authored for the measurement (not real customer documents) and vary in length and
// section structure so the pipeline sees different inputs: 400 to about 16 000 characters.
import fs from 'node:fs';

const outDir = process.argv[2] ?? '.sdrive/reports/tests/raw/t75-docs';
fs.mkdirSync(outDir, { recursive: true });

const products = [
  { name: 'Shift Swap Board', key: 'SSB', domain: 'retail scheduling' },
  { name: 'Vendor Onboarding', key: 'VON', domain: 'procurement' },
  { name: 'Clinic Intake', key: 'CLI', domain: 'healthcare' },
  { name: 'Freight Tracker', key: 'FRT', domain: 'logistics' },
  { name: 'Grant Review', key: 'GRV', domain: 'public funding' },
  { name: 'Device Fleet', key: 'DFM', domain: 'field hardware' },
  { name: 'Course Builder', key: 'CRB', domain: 'education' },
  { name: 'Claims Triage', key: 'CLT', domain: 'insurance' },
  { name: 'Warehouse Audit', key: 'WHA', domain: 'warehouse operations' },
  { name: 'Partner Portal', key: 'PTP', domain: 'channel sales' },
];

const sizes = [400, 900, 1600, 2600, 3800, 5200, 7000, 9000, 12000, 16000];

const section = (title, lines) => `\n## ${title}\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
const numbered = (title, lines) => `\n### ${title}\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}\n`;

const build = (product, target) => {
  const head = `# ${product.name} — Product Requirements\n\nThis document describes the first release of ${product.name} for the ${product.domain} team.\n`;
  const blocks = [
    section('Goals', [
      `Give the ${product.domain} team one screen for daily work.`,
      'Replace the current spreadsheet with an auditable record.',
      'Reduce the time to answer a customer request.',
    ]),
    section('Personas', [
      'Requestor: raises a request and follows its status.',
      'Handler: claims, works and completes requests.',
      'Manager: reviews volume, ageing and exceptions.',
    ]),
    numbered('Intake', [
      'A request is created with a title, a category and a priority.',
      'The requestor can attach one file up to 10 MB.',
      'Requests are listed newest first with a status filter.',
      'A request can be edited until a handler claims it.',
    ]),
    numbered('Assignment', [
      'The queue proposes handlers whose category matches the request.',
      'A manager can override the proposal.',
      'Claiming a request notifies the requestor by email.',
      'A claimed request cannot be claimed by anyone else.',
    ]),
    numbered('Handling', [
      'A handler moves a request through open, in progress and done.',
      'Every status change records the user and a timestamp.',
      'Closing a request requires a short resolution note.',
      'Reopening a closed request keeps the previous note.',
    ]),
    numbered('Reporting', [
      'Managers export a weekly CSV of open and closed requests.',
      'The report includes the average age of open requests.',
      'Only managers may export personal data columns.',
    ]),
    section('Non-functional requirements', [
      'The list must stay usable on a phone with a weak connection.',
      'Personal data never appears in application logs.',
      'Every change is auditable for twelve months.',
    ]),
    section('Out of scope', ['Billing.', 'Customer self-service.', 'Route optimisation.']),
  ];

  let text = head;
  for (const block of blocks) {
    if (text.length + block.length > target) break;
    text += block;
  }
  // Top up with extra acceptance-criteria detail so the larger sizes stay realistic.
  let extra = 0;
  while (text.length < target) {
    extra += 1;
    const block = numbered(`Edge cases ${extra}`, [
      `A request created twice in one minute is merged into one record (case ${extra}).`,
      `A handler who loses connection mid-update sees the saved status on reconnect (case ${extra}).`,
      `A manager may reassign up to twenty requests at once (case ${extra}).`,
      `An attachment that fails the virus scan is removed with a clear message (case ${extra}).`,
    ]);
    if (text.length + block.length > target + 200) break;
    text += block;
  }
  return text;
};

const written = [];
products.forEach((product, index) => {
  const text = build(product, sizes[index]);
  const file = `${outDir}/${String(index + 1).padStart(2, '0')}-${product.key.toLowerCase()}.md`;
  fs.writeFileSync(file, text);
  written.push({ file, chars: text.length, project: product.name, key: product.key });
});

fs.writeFileSync(`${outDir}/index.json`, JSON.stringify(written, null, 2));
console.log(JSON.stringify(written.map((entry) => ({ file: entry.file, chars: entry.chars })), null, 2));
