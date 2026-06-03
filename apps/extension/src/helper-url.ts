export const DEFAULT_HELPER_URL = 'http://localhost:3560';

export function normalizeHelperUrl(value: unknown, fallback = DEFAULT_HELPER_URL): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fallback;
    }

    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}
