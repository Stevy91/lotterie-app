import { requireOptionalNativeModule } from 'expo';

/**
 * Imprimante des terminaux a SDK iPos (Zhaohe Q1/Q2...).
 *
 * Toutes les fonctions sont asynchrones : la liaison au service Android du
 * terminal se fait au premier appel et peut prendre quelques centaines de
 * millisecondes.
 *
 * Particularite de ce SDK : rien ne sort de l'imprimante tant que terminer()
 * n'a pas ete appele. Le service accumule la fiche, puis l'imprime d'un bloc.
 */
export interface ImprimanteIpos {
  /**
   * Le service d'impression iPos est-il installe ?
   * Ne se lie a rien : sert a choisir le pilote au demarrage sans imposer de
   * delai sur un terminal d'une autre marque.
   */
  estDisponible(): Promise<boolean>;

  connecter(): Promise<void>;

  /**
   * Etat de l'imprimante :
   * 0 normale, 1 sans papier, 2 tete en surchauffe,
   * 3 moteur en surchauffe, 4 occupee, 5 erreur inconnue.
   */
  statut(): Promise<number>;

  /** Mise sous tension et reglages par defaut. A appeler au debut de chaque fiche. */
  debuter(): Promise<void>;
  /** Declenche l'impression reelle. Sans cet appel, rien ne sort. */
  terminer(): Promise<void>;

  texte(contenu: string): Promise<void>;
  /** 0 = gauche, 1 = centre, 2 = droite. */
  alignement(valeur: number): Promise<void>;
  /** 16, 24, 32 ou 48 ; toute autre valeur est ramenee a la plus proche. */
  taille(taille: number): Promise<void>;
  gras(actif: boolean): Promise<void>;
  sauterLignes(nombre: number): Promise<void>;
  /**
   * Tableau du service. Le pilote ne s'en sert PAS : il dessine ses bordures,
   * et il refuse en silence les lignes trop larges (voir colonnesEnTexte dans
   * pilotes/pilote.ts). Conserve parce que le module reflete le service.
   */
  colonnes(textes: string[], largeurs: number[], alignements: number[]): Promise<void>;
  qrCode(donnees: string, taille: number, correction: number): Promise<void>;
  /** Image en base64, sans prefixe data:, deja redimensionnee a 384 pixels au plus. */
  image(base64: string, alignement: number): Promise<void>;
}

// requireOptionalNativeModule et non requireNativeModule : sur un appareil ou
// le module natif n'est pas embarque (Expo Go, build iOS), on veut null plutot
// qu'une exception au chargement du fichier.
const module = requireOptionalNativeModule<ImprimanteIpos>('IposPrinter');

export default module;
