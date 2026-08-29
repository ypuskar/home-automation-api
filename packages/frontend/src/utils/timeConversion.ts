/**
 * Convert milliseconds to a human-readable duration string.
 * Format: "X.X Sec" / "X.X Min" / "X.X Hrs" / "X.X Days"
 *
 * Requirements: 8.9
 */
export function timeConversion(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} Sec`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} Min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} Hrs`;
  const days = hours / 24;
  return `${days.toFixed(1)} Days`;
}
