import { formatPence, inMonth, summariseMileage, toPence } from './budget';
import { expenseLabel, monthTitle, ukDate } from './report';
import type { Expense, MileageLog, Store, Visit } from './types';
import { formatDuration, visitMinutes, type VisitTimeSummary } from './visit-timer';

/**
 * The monthly report as one self-contained HTML page, laid out for a desktop
 * screen: plain <table>s with header rows, so a block copied from a browser
 * pastes straight into Excel, Concur or a web form with its columns intact.
 * The same HTML prints to an A4 landscape PDF.
 */

export interface ReportPhoto {
  storeName: string;
  takenAt: string;
  /** data: URI when embedded, signed https URL when linked, null when it could not be loaded. */
  src: string | null;
  embedded: boolean;
}

export interface ReportHtmlInput {
  month: string;
  name?: string | null;
  visits: Pick<Visit, 'id' | 'store_id' | 'visited_at' | 'visit_start_time' | 'visit_end_time' | 'is_manual'>[];
  stores: Pick<Store, 'id' | 'name' | 'address' | 'grade'>[];
  mileage: (Pick<MileageLog, 'date' | 'miles' | 'type'> & Partial<Pick<MileageLog, 'notes'>>)[];
  expenses: (Pick<Expense, 'date' | 'amount' | 'location' | 'recipient' | 'category'> & Partial<Pick<Expense, 'custom_label' | 'receipt_paths'>>)[];
  visitTimes?: VisitTimeSummary;
  /** Photos per visit id (taken during that visit). */
  photosByVisit?: Record<string, ReportPhoto[]>;
  /** Photos not linked to a saved visit (e.g. the visit was cancelled). */
  otherPhotos?: ReportPhoto[];
  /** Receipt image per storage path. */
  receipts?: Record<string, ReportPhoto>;
  generatedAt?: Date;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Only our own data URIs and https links reach an src/href. */
export function safeSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^data:image\/(jpeg|png|webp|heic|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) return src;
  if (/^https:\/\/[^\s"'<>]+$/.test(src)) return src;
  return null;
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const monthOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const miles = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function table(headers: string[], rows: string[][], opts: { numeric?: number[]; empty: string; foot?: string[] }): string {
  const num = new Set(opts.numeric ?? []);
  const th = headers.map((h, i) => `<th${num.has(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.length
    ? rows.map((r) => `<tr>${r.map((c, i) => `<td${num.has(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('\n')
    : `<tr><td colspan="${headers.length}" class="empty">${esc(opts.empty)}</td></tr>`;
  const foot = opts.foot ? `<tfoot><tr>${opts.foot.map((c, i) => `<td${num.has(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr></tfoot>` : '';
  return `<table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody>${foot}</table>`;
}

function photoTag(p: ReportPhoto, size: 'thumb' | 'full'): string {
  const src = safeSrc(p.src);
  if (!src) return `<span class="muted">Photo unavailable</span>`;
  const alt = esc(`${p.storeName}, ${localDay(p.takenAt)} ${time(p.takenAt)}`);
  if (p.embedded) return `<img class="${size}" src="${src}" alt="${alt}">`;
  return `<a href="${esc(src)}">Open photo (link valid 7 days)</a>`;
}

export function buildReportHtml(input: ReportHtmlInput): string {
  const { month, name, visitTimes } = input;
  const title = `BOAROUTE monthly report: ${monthTitle(month)}`;
  const storeById = new Map(input.stores.map((s) => [s.id, s]));

  const visits = input.visits.filter((v) => monthOf(v.visited_at) === month).sort((a, b) => a.visited_at.localeCompare(b.visited_at));
  const mileage = input.mileage.filter((m) => inMonth(m.date, month)).sort((a, b) => a.date.localeCompare(b.date));
  const expenses = input.expenses.filter((e) => inMonth(e.date, month) && Number.isFinite(toPence(e.amount))).sort((a, b) => a.date.localeCompare(b.date));
  const mileSum = summariseMileage(mileage, month);
  const expenseTotal = expenses.reduce((a, e) => a + toPence(e.amount), 0);
  const storesVisited = new Set(visits.map((v) => v.store_id)).size;
  const allPhotos = [...Object.values(input.photosByVisit ?? {}).flat(), ...(input.otherPhotos ?? [])];

  const summary = table(
    ['Measure', 'Value'],
    [
      ['Visits', esc(visits.length)],
      ['Stores visited', esc(storesVisited)],
      ['Average time on site', esc(visitTimes?.overallAvgMinutes != null ? formatDuration(visitTimes.overallAvgMinutes) : 'No timed visits')],
      ['Work miles', esc(miles(mileSum.work))],
      ['Personal miles', esc(miles(mileSum.personal))],
      ['Total miles', esc(miles(mileSum.total))],
      ['Expenses', esc(`${expenses.length} · ${formatPence(expenseTotal)}`)],
      ['Visit photos', esc(allPhotos.length)],
    ],
    { empty: '' },
  );

  const visitRows = visits.map((v) => {
    const s = storeById.get(v.store_id);
    const mins = visitMinutes(v);
    const photos = input.photosByVisit?.[v.id] ?? [];
    return [
      esc(localDay(v.visit_end_time ?? v.visited_at)),
      esc(s?.name ?? 'Unknown store'),
      esc(s?.address ?? ''),
      esc(s?.grade ?? ''),
      esc(v.is_manual ? 'Logged by hand' : time(v.visit_start_time)),
      esc(v.is_manual ? '' : time(v.visit_end_time ?? v.visited_at)),
      esc(mins != null ? formatDuration(mins) : ''),
      esc(photos.length || ''),
    ];
  });

  const mileRows = mileage.map((m) => [esc(ukDate(m.date)), esc(m.type === 'work' ? 'Work' : 'Personal'), esc(miles(Number(m.miles))), esc(m.notes ?? '')]);

  const expenseRows = expenses.map((e) => {
    const receipts = (e.receipt_paths ?? []).map((p) => input.receipts?.[p]).filter((r): r is ReportPhoto => !!r);
    return [
      esc(ukDate(e.date)),
      esc(expenseLabel(e)),
      esc(formatPence(toPence(e.amount))),
      esc(e.location),
      esc(e.recipient),
      receipts.length ? receipts.map((r) => photoTag(r, 'thumb')).join(' ') : esc((e.receipt_paths ?? []).length ? `${e.receipt_paths!.length} on file` : ''),
    ];
  });

  const perStore = visitTimes?.perStore.length
    ? table(
        ['Store', 'Timed visits', 'Average time'],
        visitTimes.perStore.map((s) => [esc(s.name), esc(s.visits), esc(formatDuration(s.avgMinutes))]),
        { numeric: [1], empty: '' },
      )
    : '';

  const gallery = allPhotos.length
    ? `<div class="gallery">${allPhotos
        .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
        .map((p) => `<figure>${photoTag(p, 'full')}<figcaption>${esc(p.storeName)} · ${esc(localDay(p.takenAt))} ${esc(time(p.takenAt))}</figcaption></figure>`)
        .join('\n')}</div>`
    : `<p class="muted">No visit photos this month.</p>`;

  const generated = (input.generatedAt ?? new Date()).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 40px; font: 13px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #17181A; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #B8954F; padding-bottom: 12px; margin-bottom: 24px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: .2px; }
  h2 { font-size: 15px; margin: 28px 0 8px; color: #6B5426; text-transform: uppercase; letter-spacing: 1.2px; }
  .meta { color: #5C5F66; text-align: right; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 6px; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #D6D8DC; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #F3EEE3; font-weight: 600; white-space: nowrap; }
  tbody tr:nth-child(even) td { background: #FAFAFB; }
  tfoot td { font-weight: 700; background: #F3EEE3; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty, .muted { color: #8A8D93; font-style: italic; }
  .summary table { width: auto; min-width: 360px; }
  img.thumb { height: 56px; width: auto; border-radius: 4px; border: 1px solid #D6D8DC; vertical-align: middle; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  figure { margin: 0; page-break-inside: avoid; border: 1px solid #D6D8DC; border-radius: 6px; overflow: hidden; }
  figure img.full { display: block; width: 100%; height: 200px; object-fit: cover; background: #F3F3F4; }
  figure a { display: block; padding: 16px; }
  figcaption { padding: 6px 9px; font-size: 12px; color: #3E4046; }
  @media print { body { padding: 0; } a { color: inherit; } }
</style>
</head>
<body>
<header>
  <div><h1>${esc(title)}</h1>${name ? `<div>${esc(name)}</div>` : ''}</div>
  <div class="meta">Generated ${esc(generated)}</div>
</header>

<section class="summary"><h2>Summary</h2>${summary}</section>

<section><h2>Visits &amp; locations (${visits.length})</h2>
${table(['Date', 'Store', 'Location', 'Grade', 'Clock in', 'Clock out', 'Time on site', 'Photos'], visitRows, { numeric: [7], empty: 'No visits this month.' })}
${perStore}
</section>

<section><h2>Mileage</h2>
${table(['Date', 'Type', 'Miles', 'Notes'], mileRows, { numeric: [2], empty: 'No trips logged this month.', foot: ['Total', '', esc(miles(mileSum.total)), `Work ${esc(miles(mileSum.work))} · Personal ${esc(miles(mileSum.personal))}`] })}
</section>

<section><h2>Expenses (${expenses.length})</h2>
${table(['Date', 'Category', 'Amount', 'Location', 'Recipient', 'Receipts'], expenseRows, { numeric: [2], empty: 'No expenses logged this month.', foot: ['Total', '', esc(formatPence(expenseTotal)), '', '', ''] })}
</section>

<section><h2>Visit photos (${allPhotos.length})</h2>
${gallery}
</section>
</body>
</html>`;
}
