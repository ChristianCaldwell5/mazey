import { getCurrentUserIdToken } from './firebase';

export interface ApiUserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  bestTimes: Record<string, number>;
  totalEscapes: number;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api').replace(
  /\/$/,
  '',
);

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const idToken = await getCurrentUserIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function getCurrentUserProfile(): Promise<ApiUserProfile> {
  return apiRequest<ApiUserProfile>('/users/me');
}

export async function updateBestTime(
  levelId: number,
  time: number,
): Promise<ApiUserProfile> {
  return apiRequest<ApiUserProfile>('/users/me/best-times', {
    method: 'PATCH',
    body: JSON.stringify({ levelId, time }),
  });
}
