const DELAI_PAR_DEFAUT_MS = 15000;

// fetch() n'a aucun delai limite par defaut : si la connexion reseau reste
// "en attente" sans jamais repondre, la promesse ne se resout jamais et
// l'appelant reste bloque indefiniment (ex: bouton de connexion qui tourne
// sans fin). On force un abandon apres un delai, ce qui declenche une
// AbortError capturee normalement par les catch existants.
export async function fetchAvecTimeout(
  url: string,
  options: RequestInit = {},
  delaiMs: number = DELAI_PAR_DEFAUT_MS
): Promise<Response> {
  const controleur = new AbortController();
  const idDelai = setTimeout(() => controleur.abort(), delaiMs);

  try {
    return await fetch(url, { ...options, signal: controleur.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('La connexion prend trop de temps. Verifie ta connexion et reessaie.');
    }
    throw e;
  } finally {
    clearTimeout(idDelai);
  }
}

// Transforme une erreur technique (timeout, "Network request failed", serveur
// injoignable...) en message clair pour un vendeur, sans jargon technique
// (pas de "Laravel", "config.ts", "IP de l'ordinateur"). La cause quasi
// systematique sur le terrain est un internet coupe ou trop lent.
export function messageErreurReseau(e: any): string {
  const msg = typeof e?.message === 'string' ? e.message : '';

  if (msg.includes('trop de temps')) {
    return 'La connexion est trop lente. Rapproche-toi du reseau ou reessaie dans un instant.';
  }

  return "Pas de connexion. Verifie que ton WiFi ou tes donnees mobiles (4G) sont actifs, puis reessaie.";
}
