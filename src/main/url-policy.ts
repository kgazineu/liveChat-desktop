import { API_ORIGIN, APP_ORIGIN } from './constants';

export function parsedHttpUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isAllowedAppUrl(rawUrl: string) {
  const url = parsedHttpUrl(rawUrl);
  return url?.protocol === 'https:' && url.origin === APP_ORIGIN;
}

export function isAllowedApiUrl(rawUrl: string) {
  const url = parsedHttpUrl(rawUrl);
  return url?.protocol === 'https:' && url.origin === API_ORIGIN &&
    url.pathname === '/' && !url.search && !url.hash;
}

export function isSafeExternalUrl(rawUrl: string) {
  const url = parsedHttpUrl(rawUrl);
  return url != null && url.origin !== APP_ORIGIN;
}
