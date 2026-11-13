import { requireOptionalNativeModule } from 'expo';

/**
 * Imprimante des terminaux SENRAISE (H10S...).
 *
 * Toutes les fonctions sont asynchrones : la liaison au service Android du
 * terminal se fait au premier appel et peut prendre quelques centaines de
 * millisecondes.
 */
export interface ImprimanteSenraise {
  /**
   * Le service d'impression SENRAISE est-il installe ?
   * Ne se lie a rien : sert a choisir le pilote au demarrage sans imposer de
   * delai sur un terminal d'une autre marque.
   */
  estDisponible(): Promise<boolean>;

  connecter(): Promise<void>;
  version(): Promise<string>;

  /** A encadrer chaque fiche : sans ca, une fiche longue sort par morceaux. */
  debuter(): Promise<void>;
  terminer(): Promise<void>;

  texte(contenu: string): Promise<void>;
  /** 0 = gauche, 1 = centre, 2 = droite. */
  alignement(valeur: number): Promise<void>;
  taille(taille: number): Promise<void>;
  gras(actif: boolean): Promise<void>;
  sauterLignes(nombre: number): Promise<void>;
  colonnes(textes: string[], poids: number[], alignements: number[]): Promise<void>;
  qrCode(donnees: string, taille: number, correction: number): Promise<void>;
  /** Image en base64, sans prefixe data:. */
  image(base64: string): Promise<void>;
}

// requireOptionalNativeModule et non requireNativeModule : sur un appareil ou
// le module natif n'est pas embarque (Expo Go, build iOS), on veut null plutot
// qu'une exception au chargement du fichier.
const module = requireOptionalNativeModule<ImprimanteSenraise>('SenraisePrinter');

export default module;
