import { API_URL } from './config';
import { obtenirToken } from './auth';
import { fetchAvecTimeout } from './fetchAvecTimeout';

export async function appelApi(chemin: string, options: RequestInit = {}): Promise<Response> {
  const token = await obtenirToken();

  return fetchAvecTimeout(`${API_URL}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

// Pour l'upload de fichiers (multipart) : pas de Content-Type force,
// le navigateur/RN doit definir lui-meme la boundary du FormData.
export async function appelApiFichier(chemin: string, formData: FormData): Promise<Response> {
  const token = await obtenirToken();

  return fetchAvecTimeout(`${API_URL}${chemin}`, {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }, 30000);
}
