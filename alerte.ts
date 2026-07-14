export interface BoutonPopup {
  texte: string;
  style?: 'annuler' | 'confirmer';
  onPress?: () => void;
}

export interface EtatPopup {
  titre: string;
  message?: string;
  boutons: BoutonPopup[];
}

type Ecouteur = (etat: EtatPopup | null) => void;

let ecouteur: Ecouteur | null = null;

export function definirEcouteurPopup(fn: Ecouteur | null) {
  ecouteur = fn;
}

export function alerteSimple(titre: string, message?: string) {
  ecouteur?.({ titre, message, boutons: [{ texte: 'OK' }] });
}

export function alerteConfirmation(
  titre: string,
  message: string,
  onConfirmer: () => void,
  libelleConfirmer = 'Confirmer',
  libelleAnnuler = 'Annuler'
) {
  ecouteur?.({
    titre,
    message,
    boutons: [
      { texte: libelleAnnuler, style: 'annuler' },
      { texte: libelleConfirmer, style: 'confirmer', onPress: onConfirmer },
    ],
  });
}
