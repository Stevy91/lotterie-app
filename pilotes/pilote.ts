import { Platform } from 'react-native';
import * as SunmiPrinterLibrary from '@mitsuharu/react-native-sunmi-printer-library';

import SenraisePrinter from '../modules/senraise-printer';

/**
 * Choix du pilote d'impression selon le terminal.
 *
 * Deux materiels, deux SDK incompatibles : Sunmi (V2...) et SENRAISE (H10S...).
 * Ce fichier expose UNE SEULE interface, calquee sur celle de Sunmi pour que la
 * mise en page des fiches (sunmiPrint.ts) n'ait pas a connaitre le materiel.
 *
 * Ajouter une marque se fait ici, sans toucher a une seule ligne de mise en page.
 */

export type Alignement = 'left' | 'center' | 'right';
export type NiveauQr = 'low' | 'middle' | 'quartile' | 'high';

export interface Pilote {
  readonly nom: 'sunmi' | 'senraise';
  prepare(): Promise<void>;
  /** Numero de serie du terminal, ou null si le materiel n'en expose pas. */
  numeroSerie(): Promise<string | null>;
  debuter(): Promise<void>;
  terminer(): Promise<void>;
  setAlignment(alignement: Alignement): Promise<void>;
  printText(texte: string): Promise<void>;
  printColumnsText(textes: string[], largeurs: number[], alignements: Alignement[]): Promise<void>;
  setTextStyle(style: 'bold', actif: boolean): Promise<void>;
  setFontSize(taille: number): Promise<void>;
  setDefaultFontSize(): Promise<void>;
  lineWrap(lignes: number): Promise<void>;
  printQRCode(donnees: string, taille: number, niveau: NiveauQr): Promise<void>;
  /** Image deja redimensionnee, en data URI (data:image/png;base64,...). */
  printImage(dataUri: string, largeur: number): Promise<void>;
  cutPaper(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sunmi : l'implementation historique, inchangee.
// ---------------------------------------------------------------------------

const TAILLE_POLICE_DEFAUT = 24;

const piloteSunmi: Pilote = {
  nom: 'sunmi',

  async prepare() {
    const pret = await SunmiPrinterLibrary.prepare();
    if (!pret) {
      throw new Error('Aucune imprimante Sunmi detectee sur cet appareil (prepare a retourne false).');
    }
  },

  async numeroSerie() {
    const { serialNumber } = await SunmiPrinterLibrary.getPrinterInfo();
    return serialNumber || null;
  },

  // Sunmi imprime au fil de l'eau : rien a encadrer.
  async debuter() {},
  async terminer() {},

  setAlignment: (a) => SunmiPrinterLibrary.setAlignment(a),
  printText: (t) => SunmiPrinterLibrary.printText(t),
  printColumnsText: (textes, largeurs, alignements) =>
    SunmiPrinterLibrary.printColumnsText(textes, largeurs, alignements),
  // Le SDK Sunmi renvoie un booleen ici : on l'absorbe pour que les deux
  // pilotes aient exactement la meme signature.
  async setTextStyle(style, actif) {
    await SunmiPrinterLibrary.setTextStyle(style, actif);
  },
  setFontSize: (taille) => SunmiPrinterLibrary.setFontSize(taille),
  setDefaultFontSize: () => SunmiPrinterLibrary.setDefaultFontSize(),
  lineWrap: (lignes) => SunmiPrinterLibrary.lineWrap(lignes),
  printQRCode: (donnees, taille, niveau) => SunmiPrinterLibrary.printQRCode(donnees, taille, niveau),
  printImage: (dataUri, largeur) => SunmiPrinterLibrary.printImage(dataUri, largeur, 'grayscale'),
  cutPaper: () => SunmiPrinterLibrary.cutPaper(),
};

// ---------------------------------------------------------------------------
// SENRAISE : meme interface, par-dessus le service AIDL du terminal.
// ---------------------------------------------------------------------------

/** Le service attend un entier, pas un libelle. */
const ALIGNEMENTS: Record<Alignement, number> = { left: 0, center: 1, right: 2 };

/** Correction d'erreur du QR : meme echelle que Sunmi, en entier. */
const NIVEAUX_QR: Record<NiveauQr, number> = { low: 0, middle: 1, quartile: 2, high: 3 };

const piloteSenraise: Pilote = {
  nom: 'senraise',

  async prepare() {
    if (!SenraisePrinter) {
      throw new Error("Le module d'impression SENRAISE n'est pas embarque dans cette version de l'app.");
    }
    await SenraisePrinter.connecter();
  },

  // Le service SENRAISE n'expose aucun numero de serie : l'appelant retombe
  // sur l'identifiant Android, ce qui verrouille le compte tout aussi bien.
  async numeroSerie() {
    return null;
  },

  // Indispensable ici : sans beginWork/endWork, le service envoie par
  // morceaux et une fiche longue sort entrecoupee de blancs.
  debuter: () => SenraisePrinter!.debuter(),
  terminer: () => SenraisePrinter!.terminer(),

  setAlignment: (a) => SenraisePrinter!.alignement(ALIGNEMENTS[a]),
  printText: (t) => SenraisePrinter!.texte(t),

  printColumnsText: (textes, largeurs, alignements) =>
    SenraisePrinter!.colonnes(textes, largeurs, alignements.map((a) => ALIGNEMENTS[a])),

  setTextStyle: (_style, actif) => SenraisePrinter!.gras(actif),
  setFontSize: (taille) => SenraisePrinter!.taille(taille),
  setDefaultFontSize: () => SenraisePrinter!.taille(TAILLE_POLICE_DEFAUT),
  lineWrap: (lignes) => SenraisePrinter!.sauterLignes(lignes),
  printQRCode: (donnees, taille, niveau) => SenraisePrinter!.qrCode(donnees, taille, NIVEAUX_QR[niveau]),

  // printBitmap ne prend pas de largeur : l'image est deja redimensionnee par
  // l'appelant (voir logoEnDataUri). On retire juste le prefixe data URI.
  printImage: (dataUri) => SenraisePrinter!.image(dataUri.replace(/^data:[^,]+,/, '')),

  // Le H10S est un terminal portable, sans massicot : on avance le papier
  // pour degager la fiche, ce que le vendeur dechire a la main.
  cutPaper: () => SenraisePrinter!.sauterLignes(3),
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

let choisi: Pilote | null = null;

/**
 * Le pilote correspondant au terminal, determine une fois puis memorise.
 *
 * SENRAISE d'abord : sa detection ne fait que chercher un paquet installe,
 * sans se lier a rien ni imposer de delai sur un Sunmi.
 */
export async function obtenirPilote(): Promise<Pilote> {
  if (choisi) return choisi;

  if (Platform.OS !== 'android') {
    throw new Error("L'impression n'est disponible que sur Android.");
  }

  if (SenraisePrinter) {
    try {
      if (await SenraisePrinter.estDisponible()) {
        choisi = piloteSenraise;
        return choisi;
      }
    } catch {
      // Detection impossible : on laisse sa chance a Sunmi plutot que
      // d'echouer sur un terminal qui marchait avant.
    }
  }

  choisi = piloteSunmi;
  return choisi;
}

/** Pour les tests et le diagnostic : force le choix a la prochaine impression. */
export function reinitialiserPilote(): void {
  choisi = null;
}
