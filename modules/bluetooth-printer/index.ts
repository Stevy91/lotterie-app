import { requireOptionalNativeModule } from 'expo';

/**
 * Imprimante integree qui se presente comme une imprimante Bluetooth appairee
 * (vue sur un BROLEO : « 4G_Printer »).
 *
 * Ce module ne sait pas imprimer : il ouvre la liaison et ecrit des octets.
 * Les commandes ESC/POS sont composees en TypeScript, voir pilotes/escpos.ts.
 */
export interface ImprimanteBluetooth {
  /**
   * Une imprimante appairee est-elle presente ?
   * Les Sunmi sont ecartes : leur imprimante est interne et pilotee par leur
   * propre SDK.
   */
  estDisponible(): Promise<boolean>;

  /** Nom de l'imprimante trouvee, pour le diagnostic. */
  nomImprimante(): Promise<string | null>;

  connecter(): Promise<void>;
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
