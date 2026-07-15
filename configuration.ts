import { API_URL } from './config';
import { fetchAvecTimeout } from './fetchAvecTimeout';

export interface ConfigurationApp {
  app_name?: string;
  adresse?: string;
  logo_url?: string;
  [cle: string]: string | undefined;
}

export async function obtenirConfiguration(): Promise<ConfigurationApp> {
  try {
    // Parametre anti-cache : un proxy reseau (mobile) ou un cache CDN en
    // amont peut servir une reponse perimee pour cette URL sinon (vu sur le
    // terrain : app_name/text_fiche periodiquement en retard sur le backoffice).
    const reponse = await fetchAvecTimeout(`${API_URL}/configuration?_=${Date.now()}`);
    if (!reponse.ok) return {};
    return await reponse.json();
  } catch {
    return {};
  }
}
