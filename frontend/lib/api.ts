export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('digirent_token');
  if (!token) { window.location.assign('/login'); throw new Error('Please sign in'); }
  const response = await fetch(`/api/v1${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }, cache: 'no-store' });
  const result = await response.json();
  if (response.status === 401) { sessionStorage.removeItem('digirent_token'); window.location.assign('/login'); }
  if (!response.ok) throw new Error(result.error || result.message || 'Request failed');
  return result as T;
}
