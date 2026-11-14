import { useCallback, useRef, useState } from 'react';

/**
 * Empeche qu'un bouton soit declenche deux fois.
 *
 * Le probleme vu sur le terrain : quand le reseau est lent, le vendeur ne voit
 * rien se passer et reappuie. Une fiche partait alors en double, ou une
 * suppression etait demandee deux fois.
 *
 * Pendant qu'une action tourne, TOUS les boutons de l'ecran sont inactifs, pas
 * seulement celui qui a ete presse : valider une fiche puis vider la saisie
 * dans la foulee serait tout aussi fautif.
 */

/**
 * Meme une action instantanee garde le verrou ce temps-la. Sans ce delai, un
 * bouton local comme « Entrer » rendrait la main dans la milliseconde et le
 * double appui passerait quand meme -- avec une ligne de mise en double a la
 * cle, donc de l'argent.
 */
const DUREE_MINIMALE_MS = 600;

export function useActionsUniques() {
  /** La cle de l'action en cours, pour n'afficher le sablier que sur son bouton. */
  const [enCours, setEnCours] = useState<string | null>(null);

  // Un useRef et non le state : setEnCours n'est pas applique immediatement,
  // et deux appuis dans la meme image passeraient tous les deux le test. Le
  // ref, lui, bascule tout de suite.
  const verrou = useRef(false);

  const lancer = useCallback(
    (cle: string, action: () => void | Promise<void>) => async () => {
      if (verrou.current) return;

      verrou.current = true;
      setEnCours(cle);
      const debut = Date.now();

      try {
        await action();
      } finally {
        const reste = DUREE_MINIMALE_MS - (Date.now() - debut);
        if (reste > 0) {
          await new Promise((resoudre) => setTimeout(resoudre, reste));
        }
        verrou.current = false;
        setEnCours(null);
      }
    },
    [],
  );

  return { enCours, lancer };
}
