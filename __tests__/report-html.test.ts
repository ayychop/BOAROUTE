import { buildReportHtml, esc, safeSrc, type ReportPhoto } from '../src/lib/report-html';

const start = new Date(2026, 9, 5, 10, 0);
const end = new Date(2026, 9, 5, 10, 40);
const visits = [
  { id: 'v1', store_id: 's1', visited_at: end.toISOString(), visit_start_time: start.toISOString(), visit_end_time: end.toISOString(), is_manual: false },
  // Different month: must not appear.
  { id: 'v2', store_id: 's1', visited_at: new Date(2026, 8, 5, 10).toISOString(), visit_start_time: null, visit_end_time: null, is_manual: false },
];
const stores = [{ id: 's1', name: 'Tesco <b>Reading</b>', address: '1 High St & Co', grade: 'A' as const }];
const mileage = [
  { date: '2026-10-03', miles: 12.5, type: 'work' as const, notes: 'To store' },
  { date: '2026-10-04', miles: '3', type: 'personal' as const, notes: null },
  { date: '2026-09-30', miles: 99, type: 'work' as const, notes: null },
];
const expenses = [{ date: '2026-10-06', amount: 12.5, location: 'Reading', recipient: 'Costa', category: 'standard' as const, receipt_paths: ['u/r1.jpg'] }];
const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

const build = (extra: Partial<Parameters<typeof buildReportHtml>[0]> = {}) =>
  buildReportHtml({ month: '2026-10', name: 'Jo <script>', visits, stores, mileage, expenses, generatedAt: new Date(2026, 9, 29, 12), ...extra });

describe('monthly HTML report', () => {
  it('has the four tables a desktop reader needs', () => {
    const html = build();
    expect(html).toContain('Visits &amp; locations (1)');
    expect(html).toContain('<h2>Mileage</h2>');
    expect(html).toContain('<h2>Expenses (1)</h2>');
    expect(html).toContain('<th>Date</th><th>Store</th><th>Location</th>');
    expect(html).toContain('<th class="n">Miles</th>');
    expect(html).toContain('<th class="n">Amount</th>');
    expect(html.match(/<table>/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('is laid out for A4 landscape printing and is self-contained', () => {
    const html = build();
    expect(html).toContain('A4 landscape');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
  });

  it('only includes the chosen month', () => {
    const html = build();
    expect(html).not.toContain('99.0');
    expect(html).toContain('15.5'); // 12.5 work + 3 personal
    expect(html).toContain('12.5');
    expect(html).toContain('05/10/2026');
    expect(html).toContain('40 min');
    expect(html).toContain('£12.50');
  });

  it('escapes names, addresses and notes', () => {
    const html = build();
    expect(html).toContain('Tesco &lt;b&gt;Reading&lt;/b&gt;');
    expect(html).toContain('1 High St &amp; Co');
    expect(html).toContain('Jo &lt;script&gt;');
    expect(html).not.toContain('<b>Reading');
  });

  it('embeds photos taken during a visit and links the rest', () => {
    const embedded: ReportPhoto = { storeName: 'Tesco', takenAt: start.toISOString(), src: pixel, embedded: true };
    const linked: ReportPhoto = { storeName: 'Tesco', takenAt: end.toISOString(), src: 'https://x.supabase.co/sign/a.jpg?token=abc', embedded: false };
    const html = build({ photosByVisit: { v1: [embedded] }, otherPhotos: [linked] });
    expect(html).toContain(`src="${pixel}"`);
    expect(html).toContain('href="https://x.supabase.co/sign/a.jpg?token=abc"');
    expect(html).toContain('Visit photos (2)');
  });

  it('refuses unsafe photo sources', () => {
    const bad: ReportPhoto = { storeName: 'T', takenAt: start.toISOString(), src: 'javascript:alert(1)', embedded: true };
    const html = build({ otherPhotos: [bad] });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Photo unavailable');
  });

  it('shows receipts next to their expense', () => {
    const receipt: ReportPhoto = { storeName: 'Receipt', takenAt: start.toISOString(), src: pixel, embedded: true };
    expect(build({ receipts: { 'u/r1.jpg': receipt } })).toContain('class="thumb"');
    expect(build()).toContain('1 on file');
  });

  it('copes with a month with nothing in it', () => {
    const html = buildReportHtml({ month: '2026-01', visits, stores, mileage, expenses });
    expect(html).toContain('No visits this month.');
    expect(html).toContain('No trips logged this month.');
    expect(html).toContain('No expenses logged this month.');
    expect(html).toContain('No visit photos this month.');
  });
});

describe('html helpers', () => {
  it('escapes the five special characters', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(0)).toBe('0');
  });

  it('allows only image data URIs and https links', () => {
    expect(safeSrc(pixel)).toBe(pixel);
    expect(safeSrc('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(safeSrc('http://example.com/a.jpg')).toBeNull();
    expect(safeSrc('javascript:alert(1)')).toBeNull();
    expect(safeSrc('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeSrc('https://example.com/a" onerror="x')).toBeNull();
    expect(safeSrc(null)).toBeNull();
  });
});
