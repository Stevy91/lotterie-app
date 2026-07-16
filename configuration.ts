import { API_URL } from './config';
import { obtenirToken } from './auth';
import { fetchAvecTimeout } from './fetchAvecTimeout';

export interface ConfigurationApp {
  app_name?: string;
  adresse?: string;
  logo_url?: string;
  [cle: string]: string | undefined;
}

export async function obtenirConfiguration(): Promise<ConfigurationApp> {
  try {
    // /configuration repond sans jeton (branding plateforme, pour l'ecran de
    // connexion) mais renvoie le branding DU CLIENT (tenant) si un jeton
    // valide est fourni. Sans ce jeton, un utilisateur deja connecte
    // recuperait a tort le branding de la plateforme au lieu du sien
    // (c'etait le bug : app_name/text_fiche/adresse errones a l'impression).
    const token = await obtenirToken();
    const reponse = await fetchAvecTimeout(`${API_URL}/configuration`, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!reponse.ok) return {};
    return await reponse.json();
  } catch {
    return {};
  }
}
