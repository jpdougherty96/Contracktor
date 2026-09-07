import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib/dist/pdf-lib.esm.min.js';

import type { InvoiceDocumentInput } from './invoiceDocument';

const pageWidth = 612;
const pageHeight = 792;
const margin = 44;
const ink = rgb(0.12, 0.15, 0.16);
const muted = rgb(0.4, 0.45, 0.51);
const green = rgb(0.16, 0.29, 0.22);
const line = rgb(0.88, 0.85, 0.79);
const paper = rgb(1, 0.995, 0.975);

export async function buildInvoicePdf(input: InvoiceDocumentInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = addPage(document);
  let y = pageHeight - margin;

  page.drawText('INVOICE', { color: ink, font: bold, size: 30, x: margin, y: y - 26 });
  drawRight(page, clean(input.invoiceType), pageWidth - margin, y - 18, bold, 13, green);
  y -= 50;

  page.drawText(clean(input.invoiceNumber), { color: ink, font: bold, size: 14, x: margin, y });
  page.drawText(formatInvoiceDate(input.issueDate), {
    color: muted,
    font: regular,
    size: 11,
    x: margin,
    y: y - 18,
  });
  if (input.dueDate) {
    page.drawText(`Due ${formatInvoiceDate(input.dueDate)}`, {
      color: green,
      font: bold,
      size: 11,
      x: margin,
      y: y - 35,
    });
  }
  y -= 58;

  const partyTop = y;
  drawParty(page, 'FROM', input.fromLines, margin, partyTop, regular, bold);
  drawParty(page, 'BILL TO', input.billToLines, 320, partyTop, regular, bold);
  y -= Math.max(86, Math.max(input.fromLines.length, input.billToLines.length) * 16 + 30);

  ({ page, y } = drawLineHeader(page, y, bold));
  for (const item of input.lines) {
    const labelLines = wrap(clean(item.label), bold, 12, 380);
    const metaLines = item.meta ? wrap(clean(item.meta), regular, 9, 380) : [];
    const rowHeight = Math.max(42, labelLines.length * 15 + metaLines.length * 12 + 16);

    if (y - rowHeight < 185) {
      page = addPage(document);
      y = pageHeight - margin;
      page.drawText(`INVOICE ${clean(input.invoiceNumber)}`, {
        color: ink,
        font: bold,
        size: 14,
        x: margin,
        y,
      });
      y -= 25;
      ({ page, y } = drawLineHeader(page, y, bold));
    }

    let textY = y - 17;
    for (const textLine of labelLines) {
      page.drawText(textLine, { color: ink, font: bold, size: 12, x: margin, y: textY });
      textY -= 15;
    }
    for (const textLine of metaLines) {
      page.drawText(textLine, { color: muted, font: regular, size: 9, x: margin, y: textY });
      textY -= 12;
    }
    drawRight(page, formatCurrency(item.value), pageWidth - margin, y - 17, bold, 12, ink);
    page.drawLine({ color: line, end: { x: pageWidth - margin, y: y - rowHeight }, start: { x: margin, y: y - rowHeight }, thickness: 0.7 });
    y -= rowHeight;
  }

  if (y < 205) {
    page = addPage(document);
    y = pageHeight - margin;
  }

  const totalsX = 330;
  y -= 18;
  y = drawTotal(page, 'Subtotal', input.subtotal, totalsX, y, regular, bold, false);
  if (input.paymentsReceived > 0) {
    y = drawTotal(page, 'Payments received', -input.paymentsReceived, totalsX, y, regular, bold, false);
  }
  page.drawLine({ color: line, end: { x: pageWidth - margin, y: y + 4 }, start: { x: totalsX, y: y + 4 }, thickness: 1 });
  y = drawTotal(page, 'Balance due', input.balanceDue, totalsX, y - 10, bold, bold, true);
  y -= 18;

  const footerHeight = estimateFooterHeight(input, regular);
  if (y - footerHeight < margin + 20) {
    page = addPage(document);
    y = pageHeight - margin;
  }
  if (input.note) y = drawFooterSection(page, 'NOTE', input.note, margin, y, regular, bold);
  if (input.terms) y = drawFooterSection(page, 'TERMS', input.terms, margin, y - 8, regular, bold);

  const pages = document.getPages();
  pages.forEach((pdfPage, index) => {
    const pageLabel = `${index + 1} / ${pages.length}`;
    drawRight(pdfPage, pageLabel, pageWidth - margin, 24, regular, 8, muted);
  });

  document.setTitle(clean(input.fileName));
  document.setSubject(`Invoice ${clean(input.invoiceNumber)}`);
  document.setCreator('conTRACKtor');
  document.setProducer('conTRACKtor');
  return document.save();
}

function addPage(document: PDFDocument) {
  const page = document.addPage([pageWidth, pageHeight]);
  page.drawRectangle({ color: paper, height: pageHeight, width: pageWidth, x: 0, y: 0 });
  return page;
}

function drawParty(
  page: PDFPage,
  heading: string,
  values: string[],
  x: number,
  y: number,
  regular: PDFFont,
  bold: PDFFont
) {
  page.drawText(heading, { color: muted, font: bold, size: 8, x, y });
  values.slice(0, 5).forEach((value, index) => {
    page.drawText(clean(value), {
      color: ink,
      font: index === 0 ? bold : regular,
      size: 10.5,
      x,
      y: y - 18 - index * 15,
    });
  });
}

function drawLineHeader(page: PDFPage, y: number, bold: PDFFont) {
  page.drawRectangle({ color: green, height: 26, width: pageWidth - margin * 2, x: margin, y: y - 26 });
  page.drawText('DESCRIPTION', { color: paper, font: bold, size: 8, x: margin + 10, y: y - 17 });
  drawRight(page, 'AMOUNT', pageWidth - margin - 10, y - 17, bold, 8, paper);
  return { page, y: y - 26 };
}

function drawTotal(
  page: PDFPage,
  label: string,
  value: number,
  x: number,
  y: number,
  labelFont: PDFFont,
  valueFont: PDFFont,
  strong: boolean
) {
  page.drawText(label, { color: strong ? ink : muted, font: labelFont, size: strong ? 14 : 10, x, y });
  const formatted = `${value < 0 ? '-' : ''}${formatCurrency(Math.abs(value))}`;
  drawRight(page, formatted, pageWidth - margin, y, valueFont, strong ? 14 : 10, strong ? green : ink);
  return y - (strong ? 24 : 19);
}

function drawFooterSection(
  page: PDFPage,
  heading: string,
  value: string,
  x: number,
  y: number,
  regular: PDFFont,
  bold: PDFFont
) {
  page.drawText(heading, { color: muted, font: bold, size: 8, x, y });
  let nextY = y - 17;
  for (const textLine of wrap(clean(value), regular, 10, pageWidth - margin * 2)) {
    page.drawText(textLine, { color: ink, font: regular, size: 10, x, y: nextY });
    nextY -= 14;
  }
  return nextY;
}

function estimateFooterHeight(input: InvoiceDocumentInput, font: PDFFont) {
  return [input.note, input.terms]
    .filter(Boolean)
    .reduce((height, value) => height + wrap(clean(value!), font, 10, pageWidth - margin * 2).length * 14 + 28, 0);
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawRight(
  page: PDFPage,
  value: string,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
) {
  page.drawText(value, { color, font, size, x: right - font.widthOfTextAtSize(value, size), y });
}

function clean(value: string) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value ?? 0);
}

function formatInvoiceDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
