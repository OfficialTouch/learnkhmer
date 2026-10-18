// Builds grandma-phrases.docx (printable sheet for the "Learn with Grandma" tab) from data.js.
// Usage: npm install docx && node make_doc.js
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  HeadingLevel, AlignmentType, BorderStyle } = require('docx');

const src = fs.readFileSync(__dirname + '/data.js', 'utf8');
const DATA = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const byId = {};
[...DATA.lessons.flatMap(l => l.items), ...DATA.units.flatMap(u => [...u.vocab, ...u.examples]), ...DATA.grandma.flatMap(t => t.items)]
  .forEach(x => { if (typeof x === 'object') byId[x.id] = x; });
const get = x => typeof x === 'string' ? byId[x] : x;

const KHMER = { ascii: 'Khmer UI', hAnsi: 'Khmer UI', cs: 'Khmer UI', eastAsia: 'Khmer UI' };
const COLS = [2700, 2700, 2340, 2340]; // English | Khmer | Say it | Grandma says (sums to 10080 = page minus margins)
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (children, i, header) => new TableCell({
  width: { size: COLS[i], type: WidthType.DXA }, borders,
  margins: { top: 80, bottom: 80, left: 100, right: 100 },
  shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F6E6DA' } : undefined,
  children: [new Paragraph({ children })],
});
const headerRow = new TableRow({ tableHeader: true, children: ['English', 'Khmer', 'Say it', 'Grandma says'].map((t, i) =>
  cell([new TextRun({ text: t, bold: true })], i, true)) });

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Learn with Grandma')] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text:
    'Bring this sheet to Grandma. Ask her each phrase, listen to how she says it, and write her version in the last column. ' +
    'When she says it differently from the app, trust her.', color: '555555' })] }),
];
for (const t of DATA.grandma) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280 }, children: [new TextRun(t.title)] }));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t.intro, italics: true, color: '555555' })] }));
  children.push(new Table({
    width: { size: COLS.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: COLS,
    rows: [headerRow, ...t.items.map(get).map(it => new TableRow({ cantSplit: true, children: [
      cell([new TextRun(it.en)], 0),
      cell([new TextRun({ text: it.km, font: KHMER, size: 26, sizeComplexScript: 26 })], 1),
      cell([new TextRun({ text: it.rom, italics: true })], 2),
      cell([new TextRun('')], 3),
    ] }))],
  }));
}
children.push(new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [
  new TextRun({ text: 'New words Grandma taught me:', bold: true })] }));
const COLS2 = [3360, 3360, 3360]; // English | Khmer / Say it | Notes
children.push(new Table({ width: { size: 10080, type: WidthType.DXA }, columnWidths: COLS2,
  rows: [new TableRow({ tableHeader: true, children: ['English', 'How Grandma says it', 'Notes'].map((t, i) => new TableCell({
    width: { size: COLS2[i], type: WidthType.DXA }, borders, shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6E6DA' },
    margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })] })) }),
  ...Array.from({ length: 16 }, () => new TableRow({ height: { value: 640, rule: 'atLeast' }, children: COLS2.map(w => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, children: [new Paragraph('')] })) }))] }));

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children }],
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(__dirname + '/grandma-phrases.docx', buf); console.log('wrote grandma-phrases.docx'); });
