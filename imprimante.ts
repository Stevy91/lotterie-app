import { PermissionsAndroid, Platform } from 'react-native';

import { getItem, removeItem, setItem } from './storage';

/**
 * Choix d'imprimante du vendeur, et permission Bluetooth.
 *
 * Par defaut l'application detecte seule son imprimante : interne sur un
 * Sunmi, un SENRAISE ou un iPos, Bluetooth appairee sur un BROLEO. Cette
 * detection suffit sur les terminaux de vente.
 *
 * Elle ne suffit pas pour une imprimante de poche branchee sur un telephone
 * ordinaire : ces modeles s'annoncent sous des references seches qu'aucun
 * filtre de nom ne reconnait a coup sur. Le vendeur designe donc la sienne,
 * une fois, et ce choix l'emporte ensuite sur la detection.
 */

const CLE_IMPRIMANTE = 'imprimante_bluetooth';

/** Adresse MAC de l'imprimante choisie, ou null pour la detection automatique. */
export async function obtenirImprimanteChoisie(): Promise<string | null> {
  try {
    return await getItem(CLE_IMPRIMANTE);
  } catch {
    // Stockage securise indisponible : on retombe sur la detection auto.
    return null;
  }
}

export async function definirImprimanteChoisie(adresse: string | null): Promise<void> {
  if (adresse) {
    await setItem(CLE_IMPRIMANTE, adresse);
  } else {
    await removeItem(CLE_IMPRIMANTE).catch(() => {});
  }
}

/**
 * Demande la permission Bluetooth, et dit si elle est accordee.
 *
 * Indispensable sur un telephone : depuis Android 12, lire la liste des
 * appareils appaires exige BLUETOOTH_CONNECT a l'execution. Sans cette
 * demande, l'appel echouait en silence et l'application concluait qu'aucune
 * imprimante n'etait appairee -- ce qui est le cas sur tout smartphone
 * recent, alors que les terminaux de vente, en Android 8, n'etaient pas
 * concernes.
 */
export async function autoriserBluetooth(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  // Avant Android 12 la permission est accordee a l'installation.
  if (typeof Platform.Version === 'number' && Platform.Version < 31) return true;

  try {
    const permission = 'android.permission.BLUETOOTH_CONNECT' as any;

    if (await PermissionsAndroid.check(permission)) return true;

    const reponse = await PermissionsAndroid.request(permission, {
      title: 'Imprimante Bluetooth',
      message: "L'application a besoin du Bluetooth pour envoyer les fiches a l'imprimante.",
      buttonPositive: 'Autoriser',
      buttonNegative: 'Non',
    });

    return reponse === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
