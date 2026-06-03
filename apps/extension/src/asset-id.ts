const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function extractAssetIdFromUrl(url: string): string | undefined {
  const matches = url.match(uuidPattern);
  return matches?.at(-1)?.toLowerCase();
}
