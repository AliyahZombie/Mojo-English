/**
 * In dev mode the proxy server runs on :5174 and Vite forwards /api/proxy to it.
 * Wrap external LLM endpoints with this so all requests go through the local proxy,
 * avoiding CORS restrictions.
 *
 * Pass `-- --no-proxy` to `npm run dev` to disable.
 */
const useProxy = import.meta.env.DEV && import.meta.env.VITE_NO_PROXY !== 'true';

export function proxyUrl(url: string): string {
  if (!useProxy) return url;
  return `/api/proxy?target=${encodeURIComponent(url)}`;
}
