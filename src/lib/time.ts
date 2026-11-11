/** "HH:MM:SS" → "H" or "H:MM"（分が 00 のとき省略） */
export function fmtHour(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`
}

/** "HH:MM:SS", "HH:MM:SS" → "10-15" or "10:30-15" */
export function fmtTimeRange(start: string, end: string): string {
  return `${fmtHour(start)}-${fmtHour(end)}`
}
