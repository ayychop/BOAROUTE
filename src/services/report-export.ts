import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { monthBounds } from '@/lib/history';
import { buildReportHtml, type ReportHtmlInput, type ReportPhoto } from '@/lib/report-html';
import { signMedia } from './media';
import { fetchVisitPhotos, type VisitPhoto } from './visit-photos';

/** Photos embedded in the file until this much image data; the rest are links, so the print WebView never runs out of memory. */
const EMBED_BUDGET_BYTES = 24 * 1024 * 1024;
const MAX_EMBEDDED = 40;
/** Links in the report stay valid for a week. */
const LINK_TTL_S = 7 * 24 * 3600;
/** A4 landscape in points (72 dpi). */
const A4_LANDSCAPE = { width: 842, height: 595 };

export type ExportFormat = 'pdf' | 'html';

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
}

/** Downloads each signed image and inlines it as base64 while the budget lasts. */
async function loadImages(paths: string[], onProgress?: (done: number, total: number) => void): Promise<Record<string, { src: string | null; embedded: boolean }>> {
  const signed = await signMedia(paths, LINK_TTL_S).catch(() => ({}) as Record<string, string>);
  const tmp = new Directory(Paths.cache, `report-${Date.now().toString(36)}`);
  tmp.create({ intermediates: true, idempotent: true });
  const out: Record<string, { src: string | null; embedded: boolean }> = {};
  let used = 0;
  let embedded = 0;
  try {
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const url = signed[path] ?? null;
      out[path] = { src: url, embedded: false };
      if (url && embedded < MAX_EMBEDDED && used < EMBED_BUDGET_BYTES) {
        try {
          const file = await File.downloadFileAsync(url, new File(tmp, `${i}.${path.split('.').pop() ?? 'jpg'}`), { idempotent: true });
          const size = file.size ?? 0;
          if (used + size <= EMBED_BUDGET_BYTES) {
            out[path] = { src: `data:${mimeFor(path)};base64,${await file.base64()}`, embedded: true };
            used += size;
            embedded++;
          }
          file.delete();
        } catch {
          // Keep the link.
        }
      }
      onProgress?.(i + 1, paths.length);
    }
  } finally {
    try {
      tmp.delete();
    } catch {
      // Cache is cleared by the OS anyway.
    }
  }
  return out;
}

export interface ExportInput extends Omit<ReportHtmlInput, 'photosByVisit' | 'otherPhotos' | 'receipts'> {
  userId: string;
}

/** Builds the month's report (visit photos and receipts included) and opens the share sheet. */
export async function exportMonthlyReport(input: ExportInput, format: ExportFormat, onProgress?: (label: string) => void): Promise<void> {
  onProgress?.('Collecting photos');
  const { start, end } = monthBounds(input.month);
  const photos: VisitPhoto[] = await fetchVisitPhotos(input.userId, start, end).catch(() => []);
  const receiptPaths = [...new Set(input.expenses.filter((e) => e.date.slice(0, 7) === input.month).flatMap((e) => e.receipt_paths ?? []))];
  const images = await loadImages([...photos.map((p) => p.path), ...receiptPaths], (d, t) => onProgress?.(`Adding photos ${d} of ${t}`));

  const storeName = new Map(input.stores.map((s) => [s.id, s.name]));
  const visitIds = new Set(input.visits.map((v) => v.id));
  const photosByVisit: Record<string, ReportPhoto[]> = {};
  const otherPhotos: ReportPhoto[] = [];
  for (const p of photos) {
    const img = images[p.path] ?? { src: null, embedded: false };
    const row: ReportPhoto = { storeName: storeName.get(p.store_id) ?? 'Store', takenAt: p.taken_at, ...img };
    if (p.visit_id && visitIds.has(p.visit_id)) (photosByVisit[p.visit_id] ??= []).push(row);
    else otherPhotos.push(row);
  }
  const receipts: Record<string, ReportPhoto> = {};
  for (const path of receiptPaths) receipts[path] = { storeName: 'Receipt', takenAt: new Date().toISOString(), ...(images[path] ?? { src: null, embedded: false }) };

  onProgress?.('Laying out the report');
  const html = buildReportHtml({ ...input, photosByVisit, otherPhotos, receipts });
  const base = `BOAROUTE-report-${input.month}`;

  if (format === 'pdf') {
    onProgress?.('Creating PDF');
    const { uri } = await Print.printToFileAsync({ html, ...A4_LANDSCAPE });
    const pdf = new File(uri);
    const named = new File(Paths.cache, `${base}.pdf`);
    if (named.exists) named.delete();
    pdf.moveSync(named);
    await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Send your monthly report' });
    return;
  }
  const file = new File(Paths.cache, `${base}.html`);
  if (file.exists) file.delete();
  file.create();
  await file.write(html);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/html', UTI: 'public.html', dialogTitle: 'Send your monthly report' });
}
