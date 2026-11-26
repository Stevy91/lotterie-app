import { requireOptionalNativeModule } from 'expo';

/**
 * Imprimante integree qui se presente comme une imprimante Bluetooth appairee
 * (vue sur un BROLEO : « 4G_Printer »).
 *
 * Ce module ne sait pas imprimer : il ouvre la liaison et ecrit des octets.
 * Les commandes ESC/POS sont composees en TypeScript, voir pilotes/escpos.ts.
 */
/** Un appareil Bluetooth appaire, tel que l'ecran de reglage le propose. */
export interface AppareilBluetooth {
  adresse: string;
  nom: string;
}

export interface ImprimanteBluetooth {
  /**
   * Une imprimante appairee est-elle presente ?
   *
   * Sans adresse, la detection cherche un nom d'imprimante et ecarte les
   * Sunmi, dont l'imprimante est interne. Avec une adresse -- celle que le
   * vendeur a choisie dans Parametre -- on verifie seulement que cet appareil
   * est toujours appaire, sans exclure quoi que ce soit.
   */
  estDisponible(adresse?: string | null): Promise<boolean>;

  /** Nom de l'imprimante trouvee, pour le diagnostic. */
  nomImprimante(adresse?: string | null): Promise<string | null>;

  /**
   * Tous les appareils appaires, sans filtre : aucune heuristique de nom n'est
   * fiable sur ces imprimantes de poche, c'est au vendeur de designer la sienne.
   */
  listerAppareils(): Promise<AppareilBluetooth[]>;

  connecter(adresse?: string | null): Promise<void>;
  fermer(): Promise<void>;

  /** Octets bruts, en base64 : commandes ESC/POS deja composees. */
  envoyer(base64: string): Promise<void>;

  /**
   * Convertit une image en commande de trame ESC/POS et la REND, sans
   * l'envoyer : l'appelant l'ajoute a sa file au bon endroit de la fiche.
   */
  trameImage(base64: string): Promise<string>;
}

// requireOptionalNativeModule et non requireNativeModule : sur un appareil ou
// le module natif n'est pas embarque (Expo Go, build iOS), on veut null plutot
// qu'une exception au chargement du fichier.
const module = requireOptionalNativeModule<ImprimanteBluetooth>('BluetoothPrinter');

export default module;
