export function normalizeEstimate(value: string) {
  const trimmedValue = value.trim();

  if (/^[+-]?\d+\.0+$/.test(trimmedValue)) {
    return String(Number.parseInt(trimmedValue, 10));
  }

  return trimmedValue;
}
