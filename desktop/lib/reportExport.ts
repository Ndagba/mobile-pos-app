'use client';

import { naira } from '@jaypos/shared';

/**
 * Shared report export/print utilities used by every report page.
 *
 * A page builds a `ReportDoc` (title + meta + summary + one or more tables) from
 * its current, filtered data and hands it to one of three sinks:
 *  - `downloadReportCSV` — UTF-8 (BOM) CSV with raw numeric values for spreadsheets.
 *  - `printReportDoc` — a branded, print-ready A4 document opened in a new window;
 *    used for both "Print" and "Download PDF" (the browser's print dialog saves a
 *    real vector PDF, not a screenshot). No extra PDF dependency is required.
 */

export type Cell = string | number | null | undefined;
export type ColType = 'text' | 'currency' | 'number';

export interface ReportColumn {
  label: string;
  type?: ColType;
  align?: 'left' | 'right';
}

export interface ReportTable {
  heading?: string;
  columns: ReportColumn[];
  rows: Cell[][];
  /** Optional bold totals row rendered in <tfoot> and repeated in CSV. */
  totals?: Cell[];
}

export interface ReportMeta {
  label: string;
  value: string;
}

export interface ReportDoc {
  title: string;
  /** Identifying lines: branch, period, employee, generated date, etc. */
  meta: ReportMeta[];
  /** Headline metrics rendered as cards. */
  summary: ReportMeta[];
  tables: ReportTable[];
}

/** Human-readable cell for print (currency formatted with ₦). */
function fmtCell(v: Cell, type: ColType | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'currency') return naira(Number(v) || 0);
  return String(v);
}

/** Raw cell for CSV: numbers stay numeric so spreadsheets can sum them. */
function csvCell(v: Cell, type: ColType | undefined): string {
  if (v === null || v === undefined) return '';
  if (type === 'currency' || type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(v);
  }
  return String(v);
}

function escCSV(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escHTML(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadReportCSV(filename: string, doc: ReportDoc): void {
  const lines: string[] = [];
  lines.push(escCSV(doc.title));
  doc.meta.forEach((m) => lines.push(`${escCSV(m.label)},${escCSV(m.value)}`));
  lines.push('');

  if (doc.summary.length) {
    lines.push('Summary');
    doc.summary.forEach((s) => lines.push(`${escCSV(s.label)},${escCSV(s.value)}`));
    lines.push('');
  }

  doc.tables.forEach((t) => {
    if (t.heading) lines.push(escCSV(t.heading));
    lines.push(t.columns.map((c) => escCSV(c.label)).join(','));
    t.rows.forEach((r) =>
      lines.push(r.map((v, i) => escCSV(csvCell(v, t.columns[i]?.type))).join(','))
    );
    if (t.totals) {
      lines.push(t.totals.map((v, i) => escCSV(csvCell(v, t.columns[i]?.type))).join(','));
    }
    lines.push('');
  });

  // Prepend a BOM so Excel reads UTF-8 (₦, accented names) correctly.
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const LOGO_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l1-3h18l1 3"/><path d="M4 7v13h16V7"/>' +
  '<path d="M9 21v-6h6v6"/></svg>';

function tableHTML(t: ReportTable): string {
  const head = t.columns
    .map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${escHTML(c.label)}</th>`)
    .join('');
  const body = t.rows
    .map(
      (r) =>
        `<tr>${t.columns
          .map(
            (c, i) =>
              `<td class="${c.align === 'right' ? 'r' : ''}">${escHTML(fmtCell(r[i], c.type))}</td>`
          )
          .join('')}</tr>`
    )
    .join('');
  const foot = t.totals
    ? `<tfoot><tr>${t.columns
        .map(
          (c, i) =>
            `<td class="${c.align === 'right' ? 'r' : ''}">${escHTML(fmtCell(t.totals![i], c.type))}</td>`
        )
        .join('')}</tr></tfoot>`
    : '';
  return `${t.heading ? `<h2>${escHTML(t.heading)}</h2>` : ''}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

/**
 * Open a branded, print-ready A4 version of a report in a new window and trigger
 * the browser print dialog (where the user can print or "Save as PDF"). Returns
 * nothing; throws if the pop-up is blocked.
 */
export function printReportDoc(doc: ReportDoc): void {
  const w = window.open('', '_blank', 'width=960,height=720');
  if (!w) {
    throw new Error('Unable to open the print window. Please allow pop-ups for this application.');
  }

  const metaHTML = doc.meta
    .map((m) => `<div><span class="k">${escHTML(m.label)}</span> ${escHTML(m.value)}</div>`)
    .join('');

  const summaryHTML = doc.summary.length
    ? `<div class="summary">${doc.summary
        .map(
          (s) =>
            `<div class="card"><div class="cl">${escHTML(s.label)}</div><div class="cv">${escHTML(
              s.value
            )}</div></div>`
        )
        .join('')}</div>`
    : '';

  const tablesHTML = doc.tables.map(tableHTML).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<title>${escHTML(doc.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 12px; }
  .brand { display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
  .brand .name { font-size: 18px; font-weight: 700; color: #2563eb; }
  h1 { font-size: 18px; margin: 14px 0 4px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 20px; color: #444; font-size: 11px; margin-bottom: 12px; }
  .meta .k { color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .summary .card { border: 1px solid #e3e3e3; border-radius: 6px; padding: 8px 12px; min-width: 120px; }
  .summary .cl { color: #888; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  .summary .cv { font-size: 15px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #d8d8d8; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  td.r, th.r { text-align: right; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; font-weight: 700; background: #f8f8f8; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 18px; color: #999; font-size: 10px; border-top: 1px solid #eee; padding-top: 6px; }
</style></head>
<body>
  <div class="brand">${LOGO_SVG}<span class="name">JayPOS</span></div>
  <h1>${escHTML(doc.title)}</h1>
  <div class="meta">${metaHTML}</div>
  ${summaryHTML}
  ${tablesHTML}
  <div class="foot">Generated by JayPOS · ${escHTML(new Date().toLocaleString())}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},200);};</script>
</body></html>`;

  w.document.write(html);
  w.document.close();
}
