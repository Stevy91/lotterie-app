import { API_URL } from './config';
import { obtenirToken } from './auth';
import { fetchAvecTimeout } from './fetchAvecTimeout';

export interface ConfigurationApp {
  app_name?: string;
  adresse?: string;
  logo_url?: string;
  [cle: string]: string | undefined;
}

/** Duree de validite du cache. Un reglage change au backoffice met au plus
 *  ce temps a arriver sur les terminaux, ce qui est sans consequence pour du
 *  branding (nom, logo, texte de fiche). */
const DUREE_CACHE_MS = 5 * 60 * 1000;

/**
 * Derniere configuration recue.
 *
 * Elle etait redemandee au serveur a CHAQUE impression et a chaque ouverture
 * d'ecran. Sur un point de vente qui imprime toute la journee, cela faisait
 * un aller-retour reseau par fiche, juste pour relire le meme nom et le meme
 * texte de bas de page.
 *
 * La cle est le jeton : si un autre vendeur se connecte sur le meme
 * terminal, il ne peut pas heriter du branding du precedent.
 */
let cache: { cle: string; valeur: ConfigurationApp; expire: number } | null = null;

export async function obtenirConfiguration(): Promise<ConfigurationApp> {
  try {
    // /configuration repond sans jeton (branding plateforme, pour l'ecran de
    // connexion) mais renvoie le branding DU CLIENT (tenant) si un jeton
    // valide est fourni. Sans ce jeton, un utilisateur deja connecte
    // recuperait a tort le branding de la plateforme au lieu du sien
    // (c'etait le bug : app_name/text_fiche/adresse errones a l'impression).
    const token = await obtenirToken();

    const cle = token ?? 'anonyme';
    if (cache && cache.cle === cle && Date.now() < cache.expire) {
      return cache.valeur;
    }

    const reponse = await fetchAvecTimeout(`${API_URL}/configuration`, {
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    // Un echec n'est pas mis en cache : le terminal doit pouvoir se rattraper
    // des que le reseau revient, sans attendre cinq minutes.
    if (!reponse.ok) return {};

    const valeur: ConfigurationApp = await reponse.json();
    cache = { cle, valeur, expire: Date.now() + DUREE_CACHE_MS };
    return valeur;
  } catch {
    return {};
  }
}
