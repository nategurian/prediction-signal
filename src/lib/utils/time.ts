export function minutesUntil(targetTime: string | Date): number {
  const target = typeof targetTime === "string" ? new Date(targetTime) : targetTime;
  const now = new Date();
  return (target.getTime() - now.getTime()) / (1000 * 60);
}

export function hoursAgo(timestamp: string | Date): number {
  const ts = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const now = new Date();
  return (now.getTime() - ts.getTime()) / (1000 * 60 * 60);
}

export function toISOString(date?: Date): string {
  return (date ?? new Date()).toISOString();
}
