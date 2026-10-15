/** Explorer's Copy as path adds surrounding quotes. Never evaluate or expand it. */
export function normalizeProjectDirectory(value:string):string {
  const trimmed=value.trim();
  return trimmed.startsWith('"')&&trimmed.endsWith('"')?trimmed.slice(1,-1):trimmed;
}
