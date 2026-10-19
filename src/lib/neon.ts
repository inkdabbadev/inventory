const apiUrl = process.env.EXPO_PUBLIC_NEON_API_URL?.replace(/\/$/, '');
const apiKey = process.env.EXPO_PUBLIC_NEON_SYNC_KEY;

export const isCloudEnabled = Boolean(apiUrl && apiKey);

export async function neonApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl || !apiKey) throw new Error('Neon sync is not configured.');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-inventory-key': apiKey, ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Neon API returned ${response.status}.`);
  return body as T;
}

export async function uploadProductImage(base64: string, contentType: string): Promise<string> {
  const result = await neonApi<{ key: string }>('/images', {
    method: 'POST',
    body: JSON.stringify({ base64, contentType }),
  });
  return result.key;
}

/** Authenticated source accepted by React Native Image for the private Neon bucket. */
export function productImageSource(key: string) {
  if (!apiUrl || !apiKey) return undefined;
  return { uri: `${apiUrl}/images?key=${encodeURIComponent(key)}`, headers: { 'x-inventory-key': apiKey } };
}

export async function productImageDataUri(key: string): Promise<string> {
  const result = await neonApi<{ dataUri: string }>(`/image-data?key=${encodeURIComponent(key)}`);
  return result.dataUri;
}
