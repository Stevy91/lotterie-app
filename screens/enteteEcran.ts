import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Rembourrage haut d'un en-tete d'ecran, et zone de clic de sa fleche retour.
 *
 * Les en-tetes portaient un paddingTop de 50 fixe. Ce nombre tombait juste sur
 * les terminaux de vente, dont la barre d'etat fait environ 24 points, mais pas
 * sur un telephone : avec une encoche ou un poincon, la barre monte a 40 ou 48
 * et le titre passait dessous -- invisible. Vu sur l'ecran Imprimante d'un
 * smartphone, ou le titre etait coupe net.
 *
 * On part donc de la hauteur reelle de la barre d'etat, que le systeme nous
 * donne, plutot que de la deviner.
 */
export function usePaddingEntete(): { paddingTop: number } {
  const insets = useSafeAreaInsets();

  // Un plancher de 24 pour les appareils qui n'annoncent aucune marge haute :
  // sans lui, la fleche retour se collerait au bord superieur, deja difficile
  // a viser du pouce sur un terminal tenu a une main.
  return { paddingTop: Math.max(insets.top, 24) + 14 };
}

/**
 * Marge de clic autour de la fleche retour.
 *
 * L'icone fait 22 points, soit une cible bien trop petite pour un doigt :
 * sur un Sunmi, rater la fleche etait courant. hitSlop agrandit la zone
 * sensible sans deplacer quoi que ce soit a l'ecran.
 */
export const TOUCHE_RETOUR = { top: 14, bottom: 14, left: 14, right: 14 };
