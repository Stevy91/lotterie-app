import { API_URL } from './config';
import { obtenirToken } from './auth';
import { fetchAvecTimeout } from './fetchAvecTimeout';

// Gestionnaire appele quand la session n'est plus valide : compte suspendu
// (403 + compte_suspendu) OU token revoque/expire (401). App.tsx l'enregistre
// pour deconnecter aussitot vers l'ecran de login.
let gestionnaireSuspension: (() => void) | null = null;
// Garde one-shot : evite de declencher plusieurs deconnexions (et plusieurs
// alertes) quand plusieurs appels echouent en meme temps.
let sessionDejaInvalidee = false;

export function definirGestionnaireSuspension(cb: (() => void) | null): void {
  gestionnaireSuspension = cb;
  if (cb) {
    // Nouvelle session active (login) : on reactive la detection.
    sessionDejaInvalidee = false;
  }
}

function signalerSessionInvalide(): void {
  if (sessionDejaInvalidee) return;
  sessionDejaInvalidee = true;
  gestionnaireSuspension?.();
}

async function verifierSession(reponse: Response): Promise<void> {
  // Token revoque (reseau suspendu -> tokens supprimes) ou expire : le serveur
  // repond 401. Sans ca, le sous-agent restait "connecte" et l'app plantait.
  if (reponse.status === 401) {
    signalerSessionInvalide();
    return;
  }

  // Compte suspendu signale explicitement par le backend.
  if (reponse.status === 403) {
    try {
      const data = await reponse.clone().json();
      if (data?.compte_suspendu) {
        signalerSessionInvalide();
      }
    } catch {
      // Reponse 403 sans corps JSON exploitable : on ignore.
    }
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

  if (reponse.ok) {
    // Reponse valide : la session est bien active, on re-arme la detection
    // (utile apres une reconnexion suivant une suspension precedente).
    sessionDejaInvalidee = false;
  } else {
    await verifierSession(reponse);
  }
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
