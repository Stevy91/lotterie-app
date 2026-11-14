import { Platform } from 'react-native';
import * as SunmiPrinterLibrary from '@mitsuharu/react-native-sunmi-printer-library';

import SenraisePrinter from '../modules/senraise-printer';
import IposPrinter from '../modules/ipos-printer';

/**
 * Choix du pilote d'impression selon le terminal.
 *
 * Trois materiels, trois SDK incompatibles : Sunmi (V2...), SENRAISE (H10S...)
 * et iPos (Zhaohe Q1/Q2...). Ce fichier expose UNE SEULE interface, calquee sur
 * celle de Sunmi pour que la mise en page des fiches (sunmiPrint.ts) n'ait pas a
 * connaitre le materiel.
 *
 * Les trois impriment sur du papier 58 mm, soit 384 pixels par ligne : la mise
 * en page est identique d'un terminal a l'autre, sans retouche.
 *
 * Ajouter une marque se fait ici, sans toucher a une seule ligne de mise en page.
 */

export type Alignement = 'left' | 'center' | 'right';
export type NiveauQr = 'low' | 'middle' | 'quartile' | 'high';

export interface Pilote {
  readonly nom: 'sunmi' | 'senraise' | 'ipos';
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
// iPos : meme interface, par-dessus le service AIDL des terminaux Zhaohe Q1/Q2.
// ---------------------------------------------------------------------------

/** Ce que renvoie statut(), traduit pour le vendeur. */
const ETATS_IPOS: Record<number, string> = {
  1: "L'imprimante n'a plus de papier.",
  2: "La tete d'impression a chauffe : attends quelques secondes et reessaie.",
  3: "Le moteur de l'imprimante a chauffe : attends quelques secondes et reessaie.",
  5: "L'imprimante signale une erreur. Eteins puis rallume le terminal.",
};

const piloteIpos: Pilote = {
  nom: 'ipos',

  async prepare() {
    if (!IposPrinter) {
      throw new Error("Le module d'impression iPos n'est pas embarque dans cette version de l'app.");
    }
    await IposPrinter.connecter();

    // L'etat 4 veut dire "en train d'imprimer" : le service met la suite en
    // file d'attente, on peut continuer. Les autres sont bloquants, et il vaut
    // mieux le dire tout de suite que laisser le vendeur attendre une fiche
    // qui ne sortira pas.
    const message = ETATS_IPOS[await IposPrinter.statut()];
    if (message) {
      throw new Error(message);
    }
  },

  // Le service iPos n'expose aucun numero de serie : l'appelant retombe sur
  // l'identifiant Android, ce qui verrouille le compte tout aussi bien.
  async numeroSerie() {
    return null;
  },

  // Indispensable ici : le service accumule la fiche et n'imprime qu'au
  // printerPerformPrint declenche par terminer(). Sans debuter(), les reglages
  // de la fiche precedente trainent ; sans terminer(), rien ne sort.
  debuter: () => IposPrinter!.debuter(),
  terminer: () => IposPrinter!.terminer(),

  setAlignment: (a) => IposPrinter!.alignement(ALIGNEMENTS[a]),
  printText: (t) => IposPrinter!.texte(t),

  printColumnsText: (textes, largeurs, alignements) =>
    IposPrinter!.colonnes(textes, largeurs, alignements.map((a) => ALIGNEMENTS[a])),

  setTextStyle: (_style, actif) => IposPrinter!.gras(actif),
  setFontSize: (taille) => IposPrinter!.taille(taille),
  setDefaultFontSize: () => IposPrinter!.taille(TAILLE_POLICE_DEFAUT),
  lineWrap: (lignes) => IposPrinter!.sauterLignes(lignes),
  printQRCode: (donnees, taille, niveau) => IposPrinter!.qrCode(donnees, taille, NIVEAUX_QR[niveau]),

  // printBitmap ne prend pas de largeur : l'image est deja redimensionnee par
  // l'appelant (voir logoEnDataUri). Le logo est dans l'en-tete, qui est
  // centre, d'ou l'alignement 1.
  printImage: (dataUri) => IposPrinter!.image(dataUri.replace(/^data:[^,]+,/, ''), 1),

  // Terminal portable, sans massicot. L'avance qui degage la fiche est deja
  // faite par printerPerformPrint, dans terminer() : la refaire ici gacherait
  // du papier a chaque fiche.
  async cutPaper() {},
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

let choisi: Pilote | null = null;

/**
 * Le pilote correspondant au terminal, determine une fois puis memorise.
 *
 * SENRAISE et iPos d'abord : leur detection ne fait que chercher un paquet
 * installe, sans se lier a rien ni imposer de delai sur un Sunmi. Sunmi reste
 * le dernier recours, car son prepare() interroge vraiment le materiel.
 */
export async function obtenirPilote(): Promise<Pilote> {
  if (choisi) return choisi;

  if (Platform.OS !== 'android') {
    throw new Error("L'impression n'est disponible que sur Android.");
  }

  const candidats: Array<[{ estDisponible(): Promise<boolean> } | null, Pilote]> = [
    [SenraisePrinter, piloteSenraise],
    [IposPrinter, piloteIpos],
  ];

  for (const [module, pilote] of candidats) {
    if (!module) continue;
    try {
      if (await module.estDisponible()) {
        choisi = pilote;
        return choisi;
      }
    } catch {
      // Detection impossible : on passe au suivant plutot que d'echouer sur un
      // terminal qui marchait avant.
    }
  }

  choisi = piloteSunmi;
  return choisi;
}

/** Pour les tests et le diagnostic : force le choix a la prochaine impression. */
export function reinitialiserPilote(): void {
  choisi = null;
}
