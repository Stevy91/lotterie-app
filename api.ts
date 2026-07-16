import { API_URL } from './config';
import { obtenirToken } from './auth';
import { fetchAvecTimeout } from './fetchAvecTimeout';

// Gestionnaire appele quand le serveur signale que le compte est suspendu
// (403 + compte_suspendu). App.tsx l'enregistre pour deconnecter aussitot.
let gestionnaireSuspension: (() => void) | null = null;

export function definirGestionnaireSuspension(cb: (() => void) | null): void {
  gestionnaireSuspension = cb;
}

async function verifierSuspension(reponse: Response): Promise<void> {
  if (reponse.status !== 403) return;
  try {
    const data = await reponse.clone().json();
    if (data?.compte_suspendu) {
      gestionnaireSuspension?.();
    }
  } catch {
    // Reponse 403 sans corps JSON exploitable : on ignore.
  }
}

export async function appelApi(chemin: string, options: RequestInit = {}): Promise<Response> {
  const token = await obtenirToken();

  const reponse = await fetchAvecTimeout(`${API_URL}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  await verifierSuspension(reponse);
  return reponse;
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
