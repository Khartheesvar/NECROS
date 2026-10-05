// Format visible copy only; live event payloads remain unchanged.
export function uiText(value) {
  if (typeof value !== 'string') return value
  if (value === '\u2014') return 'N/A'
  return value.replace(/\s*\u2014\s*/g, ': ')
}
