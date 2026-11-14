/**
 * Composition des commandes ESC/POS.
 *
 * Les trois premiers terminaux (Sunmi, SENRAISE, iPos) exposent un service
 * Android a qui l'on demande « imprime ce texte, centre, en gras ». Le
 * quatrieme n'expose rien du tout : son imprimante integree se presente comme
 * une imprimante Bluetooth, et il faut lui envoyer les commandes brutes de la
 * norme ESC/POS.
 *
 * Tout est ici plutot que dans le module natif : ces commandes se lisent, se
 * corrigent et se testent sans recompiler quoi que ce soit.
 */

/** 58 mm a la taille par defaut : 384 points / 12 points par caractere. */
export const CARACTERES_PAR_LIGNE = 31;

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Accents remplaces par leur lettre nue.
 *
 * Une imprimante ESC/POS n'a pas d'Unicode : elle a des pages de code, qui
 * varient d'un modele a l'autre. Envoyer « è » sans connaitre la bonne page
 * sort un caractere au hasard. « Apre » se lit ; un symbole arbitraire au
 * milieu d'un mot, non.
 */
const SANS_ACCENT: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ÿ: 'y',
  À: 'A', Â: 'A', Ä: 'A', Á: 'A', Ã: 'A', Å: 'A',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Ö: 'O', Õ: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U',
  Ç: 'C', Ñ: 'N',
  '«': '"', '»': '"', '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...',
};

/** Le texte ramene a des caracteres que toute imprimante ESC/POS sait rendre. */
export function texteImprimable(contenu: string): string {
  let sortie = '';

  for (const caractere of contenu) {
    const remplacement = SANS_ACCENT[caractere];

    if (remplacement !== undefined) {
      sortie += remplacement;
    } else if (caractere.charCodeAt(0) < 127 || caractere === '\n') {
      sortie += caractere;
    } else {
      // Caractere inconnu de l'imprimante : un espace passe mieux qu'un
      // symbole surgi de nulle part au milieu d'un mot.
      sortie += ' ';
    }
  }

  return sortie;
}

/** Octets d'un texte deja nettoye. */
function octetsTexte(contenu: string): number[] {
  const octets: number[] = [];

  for (const caractere of texteImprimable(contenu)) {
    octets.push(caractere.charCodeAt(0) & 0x7f);
  }

  return octets;
}

const TABLE_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Octets en base64, pour les passer au module natif.
 *
 * Ecrit a la main : Buffer n'existe pas dans React Native, et btoa n'est pas
 * garanti sur tous les moteurs. Quinze lignes valent mieux qu'une dependance
 * de plus a embarquer dans l'APK.
 */
export function enBase64(octets: number[]): string {
  let sortie = '';

  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i] & 0xff;
    const b = i + 1 < octets.length ? octets[i + 1] & 0xff : 0;
    const c = i + 2 < octets.length ? octets[i + 2] & 0xff : 0;
    const groupe = (a << 16) | (b << 8) | c;

    sortie += TABLE_BASE64[(groupe >> 18) & 0x3f];
    sortie += TABLE_BASE64[(groupe >> 12) & 0x3f];
    sortie += i + 1 < octets.length ? TABLE_BASE64[(groupe >> 6) & 0x3f] : '=';
    sortie += i + 2 < octets.length ? TABLE_BASE64[groupe & 0x3f] : '=';
  }

  return sortie;
}

/** Remet l'imprimante dans son etat par defaut : a faire au debut de chaque fiche. */
export const initialiser = (): number[] => [ESC, 0x40];

/** 0 = gauche, 1 = centre, 2 = droite. */
export const alignement = (valeur: number): number[] => [ESC, 0x61, Math.max(0, Math.min(2, valeur))];

export const gras = (actif: boolean): number[] => [ESC, 0x45, actif ? 1 : 0];

/**
 * Taille des caracteres. ESC/POS ne connait pas les tailles en points, mais
 * des multiplicateurs : on double la HAUTEUR seulement, jamais la largeur.
 * Doubler la largeur ramenerait la ligne a 15 caracteres et couperait les noms
 * de compagnie un peu longs.
 */
export const taille = (points: number): number[] => [GS, 0x21, points >= 28 ? 0x01 : 0x00];

export const sauterLignes = (nombre: number): number[] => [ESC, 0x64, Math.max(0, Math.min(255, nombre))];

export const texte = (contenu: string): number[] => octetsTexte(contenu);

/**
 * QR code, en quatre commandes : modele, taille de module, correction
 * d'erreur, puis donnees et impression.
 */
export function qrCode(donnees: string, tailleModule: number, correction: number): number[] {
  const charge = octetsTexte(donnees);
  // La longueur annoncee couvre les trois octets d'en-tete qui precedent les
  // donnees (0x31, 0x50, 0x30).
  const longueur = charge.length + 3;

  return [
    // Modele 2, le seul que lisent les telephones courants.
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, tailleModule)),
    // Correction d'erreur : 48 = L, 49 = M, 50 = Q, 51 = H.
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 48 + Math.max(0, Math.min(3, correction)),
    GS, 0x28, 0x6b, longueur & 0xff, (longueur >> 8) & 0xff, 0x31, 0x50, 0x30, ...charge,
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}
