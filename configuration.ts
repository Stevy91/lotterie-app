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
    const reponse = await fetchAvecTimeout(`${API_URL}/configuration`);
    if (!reponse.ok) return {};
    return await reponse.json();
  } catch {
    return {};
  }
}
