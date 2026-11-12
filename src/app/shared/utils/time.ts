const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
});

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function isSameDay(a: string | Date, b: string | Date): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export function formatMessageTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

export function formatFullDate(value: string): string {
  return fullDateFormatter.format(new Date(value));
}

export function formatDayDivider(value: string, now = new Date()): string {
  const date = new Date(value);

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  const diff = now.getTime() - date.getTime();
  if (diff < 7 * 24 * 60 * 60 * 1000 && diff >= 0) {
    return weekdayFormatter.format(date);
  }

  return monthDayFormatter.format(date);
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const then = new Date(value).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));

  if (seconds < 45) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 172_800) return 'yesterday';
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d`;
  if (seconds < 2_592_000) return `${Math.round(seconds / 604_800)}w`;

  return monthDayFormatter.format(new Date(value));
}

export function formatPresenceLabel(lastSeen?: string | null): string {
  return lastSeen ? `Last seen ${formatRelativeTime(lastSeen)} ago` : 'Offline';
}

export function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

export function isToday(value: string): boolean {
  return isSameDay(value, new Date());
}

export function clampDate(value: string, fallback = new Date()): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
