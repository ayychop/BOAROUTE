export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export function formatMiles(km: number): string {
  const mi = kmToMiles(km);
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(d: Date): string {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTime(d: Date): string {
  return `${formatDay(d)}, ${formatTime(d)}`;
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago". */
export function relativeDay(target: Date, now = new Date()): string {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diff = Math.round((b - a) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export function daysSinceLabel(days: number | null): string {
  if (days === null) return 'Not visited yet';
  if (days === 0) return 'Visited today';
  if (days === 1) return 'Visited yesterday';
  return `Visited ${days} days ago`;
}

export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/)[0];
  return email ? email.split('@')[0] : 'there';
}
