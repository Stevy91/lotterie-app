/**
 * Retour d'execution du service d'impression iPos.
 * Copie conforme du fichier du fabricant (AIDL Version 1.0.0).
 *
 * NE PAS MODIFIER L'ORDRE DES METHODES : l'ordre de declaration fixe les
 * identifiants de transaction du binder. Reordonner, ajouter ou retirer une
 * methode fait tomber les appels sur la mauvaise fonction du service.
 */
package com.iposprinter.iposprinterservice;

interface IPosPrinterCallback {

    /** true si la commande a reussi, false sinon. */
    oneway void onRunResult(boolean isSuccess);

    /** Resultat textuel : longueur imprimee depuis la mise sous tension (mm). */
    oneway void onReturnString(String result);
}
