import { API_URL } from './config';
import { fetchAvecTimeout } from './fetchAvecTimeout';
import { getItem, removeItem, setItem } from './storage';
import { obtenirNumeroSeriePos } from './sunmiPrint';

const CLE_TOKEN = 'auth_token';
const CLE_USER = 'auth_user';

export interface Utilisateur {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: string;
  balance: number | string;
  logo_url: string | null;
  adresse: string | null;
  proprietaire_adresse: string | null;
}

export async function connecter(username: string, password: string): Promise<Utilisateur> {
  // Lu sur le terminal (numero de serie de l'imprimante Sunmi integree) pour
  // verrouiller le compte a son premier appareil cote serveur. Best-effort :
  // null si l'appareil n'est pas un Sunmi ou si la lecture echoue, la
  // connexion se poursuit normalement (retro-compatible).
  const numeroSerieAppareil = await obtenirNumeroSeriePos();

  let reponse: Response;
  try {
    reponse = await fetchAvecTimeout(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password, numero_serie_appareil: numeroSerieAppareil }),
    });
  } catch (e: any) {
    if (e?.message?.includes('trop de temps')) {
      throw e;
    }
    // La requete n'a meme pas atteint le serveur (reseau coupe, serveur eteint...) :
    // on evite d'afficher le texte technique brut du navigateur ("Failed to fetch").
    throw new Error("Impossible de contacter le serveur. Verifie ta connexion et reessaie dans un instant.");
  }

  if (!reponse.ok) {
    const erreur = await reponse.json().catch(() => null);
    throw new Error(erreur?.message ?? "Nom d'utilisateur ou mot de passe incorrect. Verifie tes identifiants et reessaie.");
  }

  const data = await reponse.json();

  await setItem(CLE_TOKEN, data.token);
  await setItem(CLE_USER, JSON.stringify(data.user));

  return data.user as Utilisateur;
}

export async function deconnecter(): Promise<void> {
  const token = await getItem(CLE_TOKEN);

  if (token) {
    await fetchAvecTimeout(`${API_URL}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }).catch(() => null);
  }

  await removeItem(CLE_TOKEN);
  await removeItem(CLE_USER);
}

export async function recupererSession(): Promise<{ token: string; user: Utilisateur } | null> {
  const token = await getItem(CLE_TOKEN);
  const userJson = await getItem(CLE_USER);

  if (!token || !userJson) {
    return null;
  }

  return { token, user: JSON.parse(userJson) as Utilisateur };
}

export async function obtenirToken(): Promise<string | null> {
  return getItem(CLE_TOKEN);
}

export async function mettreAJourUtilisateurStocke(utilisateur: Utilisateur): Promise<void> {
  await setItem(CLE_USER, JSON.stringify(utilisateur));
}
