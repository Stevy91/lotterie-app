import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActionsUniques } from '../actionUnique';
import { alerteConfirmation, alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { messageErreurReseau } from '../fetchAvecTimeout';
import { obtenirNumeroSeriePosStocke, Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { Ligne, Tirage, TypeJeu, TicketResponse } from '../types';
import { genererRecuHtml } from '../receipt';
import { imprimerFichesSunmi } from '../sunmiPrint';
import { TOUCHE_RETOUR, usePaddingEntete } from './enteteEcran';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

const DEVISE = 'HTG';
const COULEURS_JEUX = ['#0d9488', '#2563eb', '#7c3aed', '#dc2626', '#16a34a', '#f59e0b'];

/**
 * Marge de clic autour des petites icones corbeille et crayon.
 *
 * Ces icones font 15 a 19 points : bien trop peu pour un doigt, et les
 * vendeurs rataient la corbeille d'une ligne. hitSlop agrandit la zone
 * sensible SANS changer la mise en page -- augmenter le padding aurait
 * espace les lignes et reduit le nombre de boules visibles a l'ecran, ce
 * qui aurait coute plus que ca ne rapporte sur un ecran de POS.
 */
const ZONE_TOUCHE = { top: 14, bottom: 14, left: 14, right: 14 };

// Couleur d'un bouton de type de jeu : Lotto (3-7 chiffres) tous en ROUGE,
// Pointe (P0-P9) tous en VERT (le meme vert que la zone selectionnee), le reste
// garde une couleur de la palette selon son index.
function couleurBoutonJeu(tj: TypeJeu, index: number): string {
  if (!tj.est_combinaison && tj.nombre_chiffres >= 3) {
    return '#dc2626'; // Lotto -> rouge
  }
  if (/^p\d$/.test(tj.generation_auto ?? '')) {
    return '#16a34a'; // Pointe P0-P9 -> vert (identique a la zone selectionnee)
  }
  return COULEURS_JEUX[index % COULEURS_JEUX.length];
}

// Empeche toute lettre : ne garde que les chiffres.
function nettoyerNumero(texte: string): string {
  return texte.replace(/[^0-9]/g, '');
}

// Lotto 4 et 5 chiffres : le vendeur choisit une des 3 combinaisons de lots
// via un suffixe ".1"/".2"/".3" (voir CalculGainService::evaluerLo4/evaluerLo5).
function estJeuAOptions(nombreChiffres: number): boolean {
  return nombreChiffres === 4 || nombreChiffres === 5;
}

// Comme nettoyerNumero, mais autorise en plus un suffixe ".1"/".2"/".3" :
// l'option de combinaison du Lotto 4/5 chiffres (ex: "12345.2").
function nettoyerNumeroPrincipal(texte: string): string {
  const brut = texte.replace(/[^0-9.]/g, '');
  const indexPoint = brut.indexOf('.');
  if (indexPoint === -1) {
    return brut.slice(0, 7);
  }
  const chiffres = brut.slice(0, indexPoint).slice(0, 5);
  const option = brut.slice(indexPoint + 1).replace(/[^123]/g, '').slice(0, 1);
  return `${chiffres}.${option}`;
}

// Separe le numero du suffixe ".1"/".2"/".3" (option Lotto 4/5). Sans suffixe,
// l'option est indeterminee : seuls ces jeux l'utilisent, avec 1 par defaut.
function extraireOptionCombinaison(saisie: string): { numero: string; option?: number } {
  const [numero, optionTexte] = saisie.split('.');
  const option = optionTexte ? parseInt(optionTexte, 10) : NaN;
  return { numero, option: option >= 1 && option <= 3 ? option : undefined };
}

// Empeche toute lettre : ne garde que les chiffres et un seul separateur decimal.
function nettoyerMontant(texte: string): string {
  const nettoye = texte.replace(/[^0-9.,]/g, '');
  const indexSeparateur = nettoye.search(/[.,]/);
  if (indexSeparateur === -1) return nettoye;
  return nettoye.slice(0, indexSeparateur + 1) + nettoye.slice(indexSeparateur + 1).replace(/[.,]/g, '');
}

export default function EcranCreerFiche({ utilisateur, onRetour }: Props) {
  const paddingEntete = usePaddingEntete();
  // Marge basse : sur les POS avec barre de navigation logicielle (Sunmi V2s),
  // le dernier bouton du recu passait dessous et devenait inaccessible.
  const insets = useSafeAreaInsets();
  const [tirages, setTirages] = useState<Tirage[]>([]);
  const [typesJeux, setTypesJeux] = useState<TypeJeu[]>([]);
  const [chargement, setChargement] = useState(true);
  const [tirageSelectionnes, setTirageSelectionnes] = useState<Tirage[]>([]);
  const [typeJeuSelectionne, setTypeJeuSelectionne] = useState<TypeJeu | null>(null);
  const [numero, setNumero] = useState('');
  const [numero2, setNumero2] = useState('');
  const [montant, setMontant] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  // Pilote l'affichage de la rangee des types de jeu (voir le useEffect plus bas).
  const [clavierOuvert, setClavierOuvert] = useState(false);

  // Case Boule cochee = « joue aussi l'inverse » : 2 chiffres -> le numero + son
  // reverse ; 4 chiffres -> le Lotto 4 et sa moitie inversee (1234 et 3412).
  const [bouleCheckee, setBouleCheckee] = useState(false);
  // Case Mise cochee : le montant reste rempli apres validation pour enchainer plusieurs saisies.
  const [miseCheckee, setMiseCheckee] = useState(false);

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Cle d'envoi de la fiche en cours : voir validerTicket. Un ref et non un
  // state, parce qu'elle doit survivre aux rendus sans en declencher.
  const cleEnvoi = useRef<string | null>(null);
  // Un client qui joue dans plusieurs zones (tirages) obtient une fiche
  // separee par zone, imprimees ensemble avec un Grand Total.
  const [tickets, setTickets] = useState<TicketResponse[]>([]);

  // Verrou anti double-appui : voir actionUnique.ts. Quand le reseau traine,
  // le vendeur ne voit rien venir et reappuie ; sans ce verrou la fiche
  // partait en double.
  const { enCours, lancer } = useActionsUniques();
  const occupe = !!enCours || envoiEnCours || chargement;

  const [modalPaireVisible, setModalPaireVisible] = useState(false);
  // Options de lots a verifier pour les lotto 4 generes automatiquement.
  // Plusieurs a la fois : le meme numero est alors joue une fois par option.
  const [optionsLotto, setOptionsLotto] = useState<number[]>([1]);
  const [montantPaireModal, setMontantPaireModal] = useState('');
  const refInputPaire = useRef<TextInput>(null);

  // autoFocus est peu fiable dans un <Modal> sur Android (le clavier ne sort
  // pas toujours) : on force le focus une fois la modale reellement affichee.
  useEffect(() => {
    if (modalPaireVisible) {
      const id = setTimeout(() => refInputPaire.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [modalPaireVisible]);

  // Edition d'une ligne individuelle (numero / numero2 / montant)
  const [ligneEnEdition, setLigneEnEdition] = useState<Ligne | null>(null);
  const [numeroEditionLigne, setNumeroEditionLigne] = useState('');
  const [numero2EditionLigne, setNumero2EditionLigne] = useState('');
  const [montantEditionLigne, setMontantEditionLigne] = useState('');

  // Edition groupee (toutes les lignes Bo/Ma d'une zone) : nouveau montant applique a chacune
  const [groupeEnEdition, setGroupeEnEdition] = useState<{ zoneId: number; label: string } | null>(null);
  const [montantEditionGroupe, setMontantEditionGroupe] = useState('');
  const refInputGroupe = useRef<TextInput>(null);

  useEffect(() => {
    if (groupeEnEdition) {
      const id = setTimeout(() => refInputGroupe.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [groupeEnEdition]);

  // Edition de toute la zone : nouveau montant applique a toutes les lignes de la zone
  const [zoneEnEdition, setZoneEnEdition] = useState<number | null>(null);
  const [montantEditionZone, setMontantEditionZone] = useState('');
  const refInputZone = useRef<TextInput>(null);

  useEffect(() => {
    if (zoneEnEdition !== null) {
      const id = setTimeout(() => refInputZone.current?.focus(), 150);
      return () => clearTimeout(id);
    }
  }, [zoneEnEdition]);

  useEffect(() => {
    chargerDonnees();
  }, []);

  async function chargerDonnees() {
    try {
      setChargement(true);
      const [resTirages, resTypesJeux] = await Promise.all([
        appelApi('/tirages/du-jour'),
        appelApi('/types-jeux'),
      ]);
      const dataTirages: Tirage[] = await resTirages.json();
      const dataTypesJeux: TypeJeu[] = await resTypesJeux.json();
      setTirages(dataTirages);
      setTypesJeux(dataTypesJeux);
      setTirageSelectionnes(dataTirages[0] ? [dataTirages[0]] : []);
    } catch (e) {
      alerteSimple('Pas de connexion internet', messageErreurReseau(e));
    } finally {
      setChargement(false);
    }
  }

  function zoneEstSelectionnee(tirage: Tirage): boolean {
    return tirageSelectionnes.some((t) => t.id === tirage.id);
  }

  function toggleZone(tirage: Tirage) {
    if (!zoneEstSelectionnee(tirage)) {
      setTirageSelectionnes((prev) => [...prev, tirage]);
      return;
    }

    const aDesLignes = lignes.some((l) => l.tirage.id === tirage.id);

    if (!aDesLignes) {
      setTirageSelectionnes((prev) => prev.filter((t) => t.id !== tirage.id));
      return;
    }

    alerteConfirmation('Retirer tirage', 'Es-tu sur ? retirer ce tirage ?', () => {
      // On desactive juste la zone pour les prochaines saisies : les numeros
      // deja joues restent affiches dans la liste. Deselectionner n'est pas
      // supprimer -- pour effacer les boules, il y a la corbeille du bandeau
      // de la zone (voir supprimerZone).
      setTirageSelectionnes((prev) => prev.filter((t) => t.id !== tirage.id));
    });
  }

  /**
   * Corbeille du bandeau d'une zone : la zone part AVEC ses boules.
   *
   * A distinguer du bouton de zone du selecteur, qui ne fait que la
   * deselectionner pour les prochaines saisies. Une fois les lignes
   * supprimees et la zone deselectionnee, elle disparait de l'ecran, puisque
   * zonesAffichees ne garde que les zones selectionnees ou qui ont des lignes.
   */
  function supprimerZone(tirage: Tirage) {
    const nb = lignes.filter((l) => l.tirage.id === tirage.id).length;

    const retirer = () => {
      setTirageSelectionnes((prev) => prev.filter((t) => t.id !== tirage.id));
      setLignes((prev) => prev.filter((l) => l.tirage.id !== tirage.id));
    };

    if (nb === 0) {
      retirer();
      return;
    }

    alerteConfirmation(
      'Supprimer la zone',
      `Supprimer ${tirage.loterie.nom} et ses ${nb} ligne(s) deja saisie(s) ?`,
      retirer,
      'Oui'
    );
  }

  function ajouterLigne() {
    if (tirageSelectionnes.length === 0) {
      alerteSimple('Aucune zone', 'Selectionne au moins une loterie avant de jouer.');
      return;
    }

    const montantNombre = parseFloat(montant.replace(',', '.'));
    if (!montantNombre || montantNombre <= 0) {
      alerteSimple('Montant invalide', 'Entre un montant superieur a 0.');
      return;
    }

    // Lotto 5 chiffres : un suffixe ".1"/".2"/".3" choisit la combinaison de
    // lots a verifier (voir extraireOptionCombinaison). Sans suffixe -> option 1.
    const { numero: numeroSaisi, option: optionCombinaison } = extraireOptionCombinaison(numero);

    // Case Boule cochee : raccourci « joue aussi l'inverse » directement depuis
    // le champ Boule, sans passer par le bouton Reverse.
    if (bouleCheckee) {
      const typeJeuBase = typeJeuSelectionne ?? typesJeux[0];
      if (!typeJeuBase) {
        alerteSimple('Aucun type de jeu', 'Aucun type de jeu n\'est configure dans le systeme.');
        return;
      }
      if (numeroSaisi.length === 2) {
        const inverse = numeroSaisi.split('').reverse().join('');
        const paires = (inverse !== numeroSaisi ? [numeroSaisi, inverse] : [numeroSaisi]).map((num) => ({
          numero: num,
          numero2: undefined as string | undefined,
        }));
        ajouterOuFusionnerLignes(typeJeuBase, paires, montantNombre);
        return;
      }
      if (numeroSaisi.length === 4) {
        // Un mariage n'a PAS d'inverse : 12 x 34 et 34 x 12 sortent sur les
        // memes tirages, donc les jouer tous les deux revient a faire payer
        // deux fois la meme mise. Le Lotto 4, lui, depend de l'ordre des lots :
        // 1234 et 3412 sont bien deux mises differentes.
        const typeLo4 = typesJeux.find((t) => t.nombre_chiffres === 4 && !t.est_combinaison);
        if (!typeLo4) {
          alerteSimple('Lotto 4 indisponible', "Aucun jeu a 4 chiffres n'est configure dans le systeme.");
          return;
        }
        const inverse = numeroSaisi.slice(2, 4) + numeroSaisi.slice(0, 2);
        const numeros = inverse !== numeroSaisi ? [numeroSaisi, inverse] : [numeroSaisi];
        ajouterOuFusionnerLignes(
          typeLo4,
          numeros.map((num) => ({ numero: num, numero2: undefined as string | undefined })),
          montantNombre,
          optionCombinaison
        );
        return;
      }
      alerteSimple('Numero invalide', 'Avec la case Boule cochee, entre 2 chiffres (reverse) ou 4 chiffres (Lotto 4 + inverse).');
      return;
    }

    // Un type de jeu est explicitement selectionne : on garde sa validation stricte
    // (nombre de chiffres exact, 2e numero pour une combinaison saisie a la main).
    if (typeJeuSelectionne) {
      const typeJeu = typeJeuSelectionne;
      if (numeroSaisi.length !== typeJeu.nombre_chiffres) {
        alerteSimple('Numero invalide', `Ce jeu demande ${typeJeu.nombre_chiffres} chiffres.`);
        return;
      }
      const combinaisonManuelleJeu = typeJeu.est_combinaison && !typeJeu.generation_auto;
      if (combinaisonManuelleJeu && numero2.length !== typeJeu.nombre_chiffres) {
        alerteSimple('2e numero invalide', `Ce jeu demande un 2e numero a ${typeJeu.nombre_chiffres} chiffres.`);
        return;
      }
      const numero2Valeur = combinaisonManuelleJeu ? numero2 : undefined;
      ajouterOuFusionnerLignes(typeJeu, [{ numero: numeroSaisi, numero2: numero2Valeur }], montantNombre, optionCombinaison);
      return;
    }

    // 4 chiffres sans case cochee : c'est un mariage, les deux moities forment
    // la paire (1234 -> 12 x 34, 3456 -> 34 x 56). Le Lotto 4 reste jouable en
    // selectionnant son bouton, avec la case cochee pour avoir l'inverse, ou
    // en tapant le suffixe d'option (« 1234.1 ») : ce suffixe n'a de sens que
    // pour un Lotto, donc il ecarte le mariage et laisse la detection par
    // nombre de chiffres faire son travail plus bas.
    if (numeroSaisi.length === 4 && optionCombinaison === undefined) {
      // Le mariage saisi a la main, pas « MA Auto » (qui genere lui-meme ses
      // combinaisons) : meme definition qu'a la validation stricte plus haut.
      const typeMarriage = typesJeux.find((t) => t.est_combinaison && !t.generation_auto)
        ?? typesJeux.find((t) => t.est_combinaison);
      if (typeMarriage) {
        ajouterOuFusionnerLignes(
          typeMarriage,
          [{ numero: numeroSaisi.slice(0, 2), numero2: numeroSaisi.slice(2, 4) }],
          montantNombre
        );
        return;
      }
      // Pas de mariage configure : on retombe sur la detection par nombre de
      // chiffres ci-dessous, qui trouvera le Lotto 4.
    }

    // Aucun type de jeu selectionne : on detecte automatiquement le jeu loto qui
    // correspond au nombre de chiffres saisis (2=simple, 3 a 7=Lo3...Lo7).
    // L3-L7 Auto ont aussi un generation_auto (bouton "boules identiques"), donc on ne
    // filtre plus dessus ici : sinon la detection par nombre de chiffres les ignore et
    // retombe a tort sur BPaire pour un numero de 3+ chiffres.
    const typeJeu = typesJeux.find((t) => t.nombre_chiffres === numeroSaisi.length && !t.est_combinaison);

    // PAS de repli sur typesJeux[0] : il enregistrait la mise sous un jeu qui
    // n'a rien a voir avec le nombre de chiffres tapes (6 chiffres vendus en
    // BPaire, par exemple). Mieux vaut refuser et dire ce qui est jouable.
    if (!typeJeu) {
      const taillesJouables = [...new Set(typesJeux.filter((t) => !t.est_combinaison).map((t) => t.nombre_chiffres))]
        .sort((a, b) => a - b);

      alerteSimple(
        'Numero invalide',
        taillesJouables.length
          ? `Aucun jeu ne correspond a ${numeroSaisi.length} chiffres. Jeux disponibles : ${taillesJouables.join(', ')} chiffres.`
          : "Aucun type de jeu n'est configure dans le systeme."
      );
      return;
    }
    ajouterOuFusionnerLignes(typeJeu, [{ numero: numeroSaisi, numero2: undefined }], montantNombre, optionCombinaison);
  }

  // Si la boule est deja jouee dans une des zones selectionnees, on demande
  // confirmation pour ajouter le montant a la ligne existante plutot que
  // d'en creer une nouvelle en double.
  function ajouterOuFusionnerLignes(
    typeJeu: TypeJeu,
    paires: { numero: string; numero2: string | undefined }[],
    montantNombre: number,
    optionCombinaison?: number
  ) {
    // Lotto 5 chiffres : "12345.1"/"12345.2"/"12345.3" sont 3 mises distinctes
    // (options de combinaison differentes) meme si le numero est identique.
    const optionAppliquee = estJeuAOptions(typeJeu.nombre_chiffres) ? (optionCombinaison ?? 1) : undefined;

    const doublons = tirageSelectionnes.flatMap((tirage) =>
      paires
        .filter((p) => lignes.some((l) => l.tirage.id === tirage.id && l.numero === p.numero && l.numero2 === p.numero2 && (l.optionCombinaison ?? null) === (optionAppliquee ?? null)))
        .map((p) => ({ tirage, ...p }))
    );

    const appliquer = () => {
      setLignes((prev) => {
        const resultat = [...prev];
        for (const tirage of tirageSelectionnes) {
          for (const p of paires) {
            // Les mariages joues restent payants : « Mariage gratuit » ne rend
            // plus gratuits les mariages saisis, il declenche cote serveur la
            // generation de mariages gratuits bonus aleatoires (en plus).
            const montantEffectif = montantNombre;

            const index = resultat.findIndex(
              (l) => l.tirage.id === tirage.id && l.numero === p.numero && l.numero2 === p.numero2 && (l.optionCombinaison ?? null) === (optionAppliquee ?? null)
            );
            if (index >= 0) {
              resultat[index] = { ...resultat[index], montant: resultat[index].montant + montantEffectif };
            } else {
              resultat.push({
                localId: `${Date.now()}-${tirage.id}-${p.numero}-${p.numero2 ?? ''}-${optionAppliquee ?? ''}-${Math.random()}`,
                tirage,
                typeJeu,
                numero: p.numero,
                numero2: p.numero2,
                optionCombinaison: optionAppliquee,
                montant: montantEffectif,
              });
            }
          }
        }
        return resultat;
      });
      setNumero('');
      setNumero2('');
      if (!miseCheckee) {
        setMontant('');
      }
    };

    if (doublons.length > 0) {
      const label = doublons[0].numero2 !== undefined ? 'Ma' : 'Bo';
      const numeroAffiche = doublons[0].numero2 ? `${doublons[0].numero} x ${doublons[0].numero2}` : doublons[0].numero;
      alerteConfirmation(
        'Boule existe deja!',
        `La boule ${label} ${numeroAffiche} existe deja. Ajouter ${montantNombre} au montant existant?`,
        appliquer,
        'Oui',
        'Non'
      );
    } else {
      appliquer();
    }
  }

  /**
   * La rangee des types de jeu ne s'affiche que clavier ouvert.
   *
   * Elle prend une rangee entiere en permanence, alors qu'elle ne sert qu'au
   * moment de la saisie. Repliee, l'ecran du POS montre nettement plus de
   * boules deja jouees -- ce qui compte quand le vendeur relit une fiche
   * devant le client. Toucher le champ Boule la fait reapparaitre.
   */
  useEffect(() => {
    const ouvert = Keyboard.addListener('keyboardDidShow', () => setClavierOuvert(true));
    const ferme = Keyboard.addListener('keyboardDidHide', () => setClavierOuvert(false));
    return () => {
      ouvert.remove();
      ferme.remove();
    };
  }, []);

  function selectionnerTypeJeu(typeJeu: TypeJeu) {
    setTypeJeuSelectionne(typeJeu);
    if (typeJeu.generation_auto) {
      setMontantPaireModal('');
      setOptionsLotto([1]);
      setModalPaireVisible(true);
    }
  }

  function basculerOptionLotto(option: number) {
    setOptionsLotto((actuel) => {
      // On ne descend jamais a zero option : generer des lignes sans option
      // reviendrait a tout jouer en option 1 sans que le vendeur l'ait voulu.
      if (actuel.includes(option)) {
        return actuel.length === 1 ? actuel : actuel.filter((o) => o !== option);
      }
      return [...actuel, option].sort();
    });
  }

  // Un bouton de generation automatique n'est qu'un declencheur ponctuel : une fois
  // le popup ferme (valide ou annule), on oublie la selection pour ne pas bloquer
  // silencieusement la saisie manuelle suivante avec son nombre de chiffres.
  function fermerModalAuto() {
    setModalPaireVisible(false);
    setMontantPaireModal('');
    setTypeJeuSelectionne(null);
  }

  /**
   * Les boules simples qui peuvent alimenter un Lotto de n chiffres : deux
   * boules de n/2 chiffres mises bout a bout. Un Lo4 se fabrique avec deux
   * boules de 2 chiffres, un Lo6 avec deux boules de 3.
   *
   * Renvoie une liste vide quand le jeu ne s'y prete pas -- nombre impair
   * (Lo3, Lo5, Lo7), ou BPaire dont la moitie ferait un seul chiffre.
   */
  function boulesCombinables(typeJeu: TypeJeu, tirageId: number): string[] {
    const n = typeJeu.nombre_chiffres;
    if (n % 2 !== 0 || n < 4) return [];

    const moitie = n / 2;
    return Array.from(
      new Set(
        lignes
          .filter((l) => l.tirage.id === tirageId && !l.numero2 && l.numero.length === moitie)
          .map((l) => l.numero)
      )
    );
  }

  /**
   * Combien de Lotto le bouton fabriquerait maintenant, toutes zones
   * selectionnees confondues. k boules donnent k x (k-1) numeros : l'ordre
   * compte, « 12 puis 54 » fait 1254 et « 54 puis 12 » fait 5412, qui sont
   * deux paris differents -- contrairement au mariage ou 12 x 54 est unique.
   */
  function nombreCombinaisonsLotto(typeJeu: TypeJeu): number {
    const paires = tirageSelectionnes.reduce((somme, tirage) => {
      const k = boulesCombinables(typeJeu, tirage.id).length;
      return somme + k * (k - 1);
    }, 0);

    // Chaque option choisie rejoue la serie entiere : deux options, deux fois
    // plus de lignes, et deux fois la mise.
    return paires * (estJeuAOptions(typeJeu.nombre_chiffres) ? optionsLotto.length : 1);
  }

  function titreModalAuto(): string {
    const mode = typeJeuSelectionne?.generation_auto;
    if (mode === 'paire') {
      const chiffres = typeJeuSelectionne?.nombre_chiffres ?? 2;

      // Annoncer le nombre avant de demander le montant : avec dix boules
      // jouees, un seul appui fabrique quatre-vingt-dix lignes. Le vendeur
      // doit le savoir avant de taper une somme, pas apres.
      const combinaisons = typeJeuSelectionne ? nombreCombinaisonsLotto(typeJeuSelectionne) : 0;
      if (combinaisons > 0) {
        return `Montant pour chaque lotto ${chiffres} (${combinaisons} combinaisons)`;
      }

      if (chiffres === 2) return 'Montant pour les boules paires';

      // Boules identiques : 10 numeros, multiplies par les options cochees.
      const lignes = 10 * (estJeuAOptions(chiffres) ? optionsLotto.length : 1);
      return `Montant pour les boules lotto ${chiffres} auto (${lignes} lignes)`;
    }
    if (mode === 'marriage') return 'Montant pour chaque Marriage (combinaisons automatiques)';
    if (mode === 'reverse') return 'Montant pour chaque Reverse (numeros inverses des boules deja jouees)';
    const finParChiffre = mode?.match(/^p(\d)$/);
    if (finParChiffre) return `Montant pour les boules qui terminent par ${finParChiffre[1]}`;
    return `Montant pour ${typeJeuSelectionne?.nom ?? ''}`;
  }

  function genererBoulesAuto() {
    if (tirageSelectionnes.length === 0 || !typeJeuSelectionne) return;

    const montantNombre = parseFloat(montantPaireModal.replace(',', '.'));
    if (!montantNombre || montantNombre <= 0) {
      alerteSimple('Montant invalide', 'Entre un montant superieur a 0.');
      return;
    }

    const mode = typeJeuSelectionne.generation_auto;
    // Taille des boules que ce jeu sait combiner / inverser (2 pour un mariage).
    // Les lignes deja jouees d'une AUTRE taille (Lo3, Lo4, Lo5...) ne sont pas
    // des operandes valides : sans ce filtre, deux Lo4 donnaient un « mariage »
    // 1234 x 4576, qui n'a aucun sens et ne peut jamais sortir.
    const nombreChiffres = typeJeuSelectionne.nombre_chiffres;

    if (mode === 'marriage') {
      // Combine 2 par 2 les numeros simples deja joues dans chaque zone selectionnee.
      const nouvellesLignes: Ligne[] = tirageSelectionnes.flatMap((tirage) => {
        const numerosZone = Array.from(
          new Set(
            lignes
              .filter((l) => l.tirage.id === tirage.id && !l.numero2 && l.numero.length === nombreChiffres)
              .map((l) => l.numero)
          )
        );

        const paires: Ligne[] = [];
        for (let i = 0; i < numerosZone.length; i++) {
          for (let j = i + 1; j < numerosZone.length; j++) {
            paires.push({
              localId: `${Date.now()}-${tirage.id}-marriage-${i}-${j}`,
              tirage,
              typeJeu: typeJeuSelectionne,
              numero: numerosZone[i],
              numero2: numerosZone[j],
              montant: montantNombre,
            });
          }
        }
        return paires;
      });

      if (nouvellesLignes.length === 0) {
        alerteSimple('Pas assez de numeros', `Joue au moins 2 boules de ${nombreChiffres} chiffres dans une zone avant de generer les Marriage.`);
        return;
      }

      setLignes((prev) => [...prev, ...nouvellesLignes]);
      fermerModalAuto();
      return;
    }

    if (mode === 'reverse') {
      // Genere le numero inverse de chaque boule simple deja jouee dans chaque zone selectionnee.
      const nouvellesLignes: Ligne[] = tirageSelectionnes.flatMap((tirage) => {
        const numerosZone = Array.from(
          new Set(
            lignes
              .filter((l) => l.tirage.id === tirage.id && !l.numero2 && l.numero.length === nombreChiffres)
              .map((l) => l.numero)
          )
        );

        const inverses: Ligne[] = [];
        for (const num of numerosZone) {
          const inverse = num.split('').reverse().join('');
          if (inverse !== num) {
            inverses.push({
              localId: `${Date.now()}-${tirage.id}-reverse-${num}`,
              tirage,
              typeJeu: typeJeuSelectionne,
              numero: inverse,
              montant: montantNombre,
            });
          }
        }
        return inverses;
      });

      if (nouvellesLignes.length === 0) {
        alerteSimple('Aucun reverse possible', `Joue au moins une boule de ${nombreChiffres} chiffres non palindrome dans une zone avant de generer les Reverse.`);
        return;
      }

      setLignes((prev) => [...prev, ...nouvellesLignes]);
      fermerModalAuto();
      return;
    }

    // Lotto auto, premier cas : des boules simples sont deja jouees dans la
    // zone. Le bouton fabrique alors tous les lotto possibles avec elles,
    // comme le mariage auto, au lieu des boules identiques.
    //
    // L'ordre compte, et c'est la difference avec le mariage : « 12 puis 54 »
    // donne 1254, « 54 puis 12 » donne 5412, deux numeros distincts qui
    // peuvent sortir separement. On genere donc les k x (k-1) paires ordonnees.

    // Un lotto 4 ou 5 se joue sur une option de lots. Le vendeur peut en
    // cocher plusieurs : la serie est alors generee une fois par option, car
    // « 1254 option 1 » et « 1254 option 2 » sont deux paris distincts, qui
    // se gagnent sur des lots differents. Vaut pour les combinaisons comme
    // pour les boules identiques : sans ca, un L5 auto partait toujours en
    // option 1 sans jamais le dire.
    const options: Array<number | null> = estJeuAOptions(nombreChiffres) ? optionsLotto : [null];

    if (mode === 'paire') {
      const nouvellesLignes: Ligne[] = tirageSelectionnes.flatMap((tirage) => {
        const boules = boulesCombinables(typeJeuSelectionne, tirage.id);
        const combinaisons: Ligne[] = [];

        for (const option of options) {
          for (let i = 0; i < boules.length; i++) {
            for (let j = 0; j < boules.length; j++) {
              if (i === j) continue; // une boule ne se combine pas avec elle-meme
              combinaisons.push({
                localId: `${Date.now()}-${tirage.id}-combi-${option ?? 0}-${i}-${j}`,
                tirage,
                typeJeu: typeJeuSelectionne,
                numero: boules[i] + boules[j],
                optionCombinaison: option ?? undefined,
                montant: montantNombre,
              });
            }
          }
        }
        return combinaisons;
      });

      // Aucune boule simple exploitable : on retombe sur les boules
      // identiques (0000, 1111... 9999), le comportement d'origine du bouton.
      if (nouvellesLignes.length > 0) {
        setLignes((prev) => [...prev, ...nouvellesLignes]);
        fermerModalAuto();
        return;
      }
    }

    const finParChiffre = mode?.match(/^p(\d)$/);

    const numeros: string[] = [];
    if (mode === 'paire') {
      for (let chiffre = 0; chiffre <= 9; chiffre++) {
        numeros.push(String(chiffre).repeat(nombreChiffres));
      }
    } else if (finParChiffre) {
      const dernierChiffre = finParChiffre[1];
      for (let prefixe = 0; prefixe <= 9; prefixe++) {
        numeros.push(String(prefixe).padStart(nombreChiffres - 1, '0') + dernierChiffre);
      }
    } else {
      return;
    }

    const nouvellesLignes: Ligne[] = tirageSelectionnes.flatMap((tirage) =>
      options.flatMap((option) =>
        numeros.map((num, index) => ({
          localId: `${Date.now()}-${tirage.id}-auto-${option ?? 0}-${index}`,
          tirage,
          typeJeu: typeJeuSelectionne,
          numero: num,
          optionCombinaison: option ?? undefined,
          montant: montantNombre,
        }))
      )
    );

    setLignes((prev) => [...prev, ...nouvellesLignes]);
    fermerModalAuto();
  }

  function supprimerLigne(localId: string) {
    setLignes((prev) => prev.filter((l) => l.localId !== localId));
  }

  // Le label depend de la ligne elle-meme (a-t-elle un 2e numero ? combien de
  // chiffres ?), pas du type de jeu selectionne : avec MA Auto, les numeros
  // simples deja joues (sans 2e numero) doivent rester "Bo", seules les
  // combinaisons generees sont "Ma". Un simple de 3 a 7 chiffres devient Lo3...Lo7.
  function labelDe(l: Ligne): string {
    if (l.numero2 !== undefined) return 'Ma';
    return l.numero.length === 2 ? 'Bo' : `Lo${l.numero.length}`;
  }

  function ouvrirEditionLigne(l: Ligne) {
    setLigneEnEdition(l);
    setNumeroEditionLigne(l.optionCombinaison ? `${l.numero}.${l.optionCombinaison}` : l.numero);
    setNumero2EditionLigne(l.numero2 ?? '');
    setMontantEditionLigne(String(l.montant));
  }

  function enregistrerEditionLigne() {
    if (!ligneEnEdition) return;
    const typeJeu = ligneEnEdition.typeJeu;
    const aDeuxNumeros = ligneEnEdition.numero2 !== undefined;
    const { numero: numeroEdite, option: optionEditee } = extraireOptionCombinaison(numeroEditionLigne);

    if (numeroEdite.length !== typeJeu.nombre_chiffres) {
      alerteSimple('Numero invalide', `Ce jeu demande ${typeJeu.nombre_chiffres} chiffres.`);
      return;
    }
    if (aDeuxNumeros && numero2EditionLigne.length !== typeJeu.nombre_chiffres) {
      alerteSimple('2e numero invalide', `Ce jeu demande un 2e numero a ${typeJeu.nombre_chiffres} chiffres.`);
      return;
    }
    const montantNombre = parseFloat(montantEditionLigne.replace(',', '.'));
    if (!montantNombre || montantNombre <= 0) {
      alerteSimple('Montant invalide', 'Entre un montant superieur a 0.');
      return;
    }

    const localId = ligneEnEdition.localId;
    setLignes((prev) =>
      prev.map((l) =>
        l.localId === localId
          ? {
              ...l,
              numero: numeroEdite,
              numero2: aDeuxNumeros ? numero2EditionLigne : undefined,
              optionCombinaison: estJeuAOptions(typeJeu.nombre_chiffres) ? (optionEditee ?? l.optionCombinaison ?? 1) : undefined,
              montant: montantNombre,
            }
          : l
      )
    );
    setLigneEnEdition(null);
  }

  function ouvrirEditionGroupe(zoneId: number, label: string) {
    setGroupeEnEdition({ zoneId, label });
    setMontantEditionGroupe('');
  }

  function enregistrerEditionGroupe() {
    if (!groupeEnEdition) return;
    const montantNombre = parseFloat(montantEditionGroupe.replace(',', '.'));
    if (!montantNombre || montantNombre <= 0) {
      alerteSimple('Montant invalide', 'Entre un montant superieur a 0.');
      return;
    }
    const { zoneId, label } = groupeEnEdition;
    setLignes((prev) =>
      prev.map((l) => (l.tirage.id === zoneId && labelDe(l) === label ? { ...l, montant: montantNombre } : l))
    );
    setGroupeEnEdition(null);
  }

  function confirmerSuppressionGroupe(zoneId: number, label: string) {
    alerteConfirmation('Supprimer le groupe', `Supprimer toutes les lignes ${label} de cette zone ?`, () => {
      setLignes((prev) => prev.filter((l) => !(l.tirage.id === zoneId && labelDe(l) === label)));
    }, 'Oui');
  }

  function enregistrerEditionZone() {
    if (zoneEnEdition === null) return;
    const montantNombre = parseFloat(montantEditionZone.replace(',', '.'));
    if (!montantNombre || montantNombre <= 0) {
      alerteSimple('Montant invalide', 'Entre un montant superieur a 0.');
      return;
    }
    const zoneId = zoneEnEdition;
    setLignes((prev) => prev.map((l) => (l.tirage.id === zoneId ? { ...l, montant: montantNombre } : l)));
    setZoneEnEdition(null);
  }

  function viderTout() {
    if (lignes.length === 0) return;
    alerteConfirmation('Vider la fiche', 'Supprimer toutes les lignes saisies ?', () => setLignes([]), 'Oui');
  }

  const total = lignes.reduce((somme, l) => somme + l.montant, 0);

  // Zones a afficher : celles selectionnees + celles qui ont deja des lignes
  const zonesAffichees = [
    ...tirageSelectionnes,
    ...tirages.filter(
      (t) => !tirageSelectionnes.some((s) => s.id === t.id) && lignes.some((l) => l.tirage.id === t.id)
    ),
  ];

  // Regroupe les lignes d'une zone par type (Bo / Ma) avec un sous-total par groupe
  function regrouperParLabel(lignesZone: Ligne[]) {
    const groupes: { label: string; lignes: Ligne[]; total: number }[] = [];
    for (const l of lignesZone) {
      const label = labelDe(l);
      let groupe = groupes.find((g) => g.label === label);
      if (!groupe) {
        groupe = { label, lignes: [], total: 0 };
        groupes.push(groupe);
      }
      groupe.lignes.push(l);
      groupe.total += l.montant;
    }
    return groupes;
  }

  async function validerTicket() {
    if (lignes.length === 0) {
      alerteSimple('Ticket vide', 'Ajoute au moins une ligne avant de valider.');
      return;
    }

    // Une fiche par zone (tirage) : un client qui joue dans 2 zones obtient
    // automatiquement 2 tickets, imprimes ensemble avec un Grand Total.
    const idsZones = [...new Set(lignes.map((l) => l.tirage.id))];

    // Cle d'envoi, generee UNE fois pour cette fiche et conservee tant qu'elle
    // n'est pas enregistree. Si l'envoi echoue et que le vendeur reappuie, la
    // meme cle repart : le serveur reconnait la fiche et renvoie celle qu'il a
    // deja creee, au lieu d'en faire une deuxieme.
    //
    // C'est la vraie cause des fiches enregistrees 2 ou 3 fois : le POS
    // abandonne un appel trop long et affiche « reessaie », mais abandonner ne
    // l'annule pas cote serveur -- la fiche etait enregistree pendant que le
    // vendeur voyait un echec.
    if (cleEnvoi.current === null) {
      cleEnvoi.current = `${utilisateur.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    try {
      setEnvoiEnCours(true);
      const resultats: TicketResponse[] = [];

      for (const idZone of idsZones) {
        const lignesZone = lignes.filter((l) => l.tirage.id === idZone);
        const reponse = await appelApi('/tickets', {
          method: 'POST',
          body: JSON.stringify({
            // Une cle par ZONE : chaque zone donne sa propre fiche, elles ne
            // doivent pas se confondre entre elles.
            cle_idempotence: `${cleEnvoi.current}-${idZone}`,
            mises: lignesZone.map((l) => ({
              tirage_id: l.tirage.id,
              type_jeu_id: l.typeJeu.id,
              numero: l.numero,
              numero_2: l.numero2 ?? null,
              option_combinaison: l.optionCombinaison ?? null,
              montant: l.montant,
            })),
          }),
          // Une fiche de plusieurs centaines de mises demande du temps au
          // serveur. Abandonner au bout de 15 secondes faisait reessayer le
          // vendeur sur une fiche deja enregistree.
        }, 60000);

        if (!reponse.ok) {
          const erreur = await reponse.json();
          // Si une zone precedente a deja ete enregistree, on l'annule pour
          // ne pas laisser une fiche invisible deduite du solde.
          await Promise.all(resultats.map((t) => appelApi(`/tickets/${t.id}/annuler`, { method: 'POST' }).catch(() => {})));
          throw new Error(erreur.message ?? 'Erreur inconnue');
        }

        resultats.push(await reponse.json());
      }

      // Enregistree : la cle a fait son office, la suivante sera une AUTRE
      // fiche. Sans cette remise a zero, revendre les memes boules renverrait
      // la fiche precedente au lieu d'en creer une nouvelle.
      cleEnvoi.current = null;
      setTickets(resultats);
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? 'Impossible de creer le ticket.');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function nouveauTicket() {
    setTickets([]);
    setLignes([]);
  }

  function confirmerSuppressionTicket() {
    if (tickets.length === 0) return;
    const texte = tickets.length > 1
      ? `Supprimer les ${tickets.length} fiches (${tickets.map((t) => t.numero_ticket).join(', ')}) ?`
      : `Supprimer la fiche ${tickets[0].numero_ticket} ?`;
    alerteConfirmation('Supprimer la fiche', texte, supprimerTicket, 'Oui');
  }

  async function supprimerTicket() {
    if (tickets.length === 0) return;
    try {
      const resultats = await Promise.all(
        tickets.map((t) => appelApi(`/tickets/${t.id}/annuler`, { method: 'POST' }))
      );
      const echec = resultats.find((r) => !r.ok);
      if (echec) {
        const erreur = await echec.json();
        throw new Error(erreur.message);
      }
      setTickets([]);
      setLignes([]);
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? "Impossible de supprimer cette fiche.");
    }
  }

  function nomVendeur(t: TicketResponse): string {
    const parent = t.agent?.parent?.name;
    const soi = t.agent?.name ?? utilisateur.name;
    return parent ? `${parent} ${soi}` : soi;
  }

  /**
   * En-tete de fiche (logo, compagnie, POS, vendeur, adresses, telephones) :
   * partagee par l'impression thermique ET le PDF, pour que les deux sortent
   * exactement le meme document.
   */
  async function construireEntete(ts: TicketResponse[]) {
    const config = await obtenirConfiguration();
    const numeroSeriePos = (await obtenirNumeroSeriePosStocke()) ?? String(utilisateur.id);

    return {
      nomCompagnie: config.app_name ?? 'Lotterie',
      // Une fiche brouillon (apercu, pas encore enregistree) n'a pas de
      // ts[0].agent : on utilise alors directement l'utilisateur connecte,
      // qui EST le vendeur pour toute fiche creee depuis cet ecran.
      adresseAgent: ts[0].agent?.adresse ?? utilisateur.adresse,
      adresseProprietaire: ts[0].agent?.proprietaire_adresse ?? utilisateur.proprietaire_adresse,
      telephoneAgent: utilisateur.telephone,
      telephoneProprietaire: utilisateur.proprietaire_telephone,
      posId: numeroSeriePos,
      vendeurNom: nomVendeur(ts[0]),
      logoUrl: utilisateur.logo_url ?? config.logo_url ?? undefined,
      texteFiche: config.text_fiche,
      afficherQr: config.qr_fiche !== 'Non',
    };
  }

  async function imprimerFicheThermique(ts: TicketResponse[]) {
    if (ts.length === 0) return;

    const entete = await construireEntete(ts);
    let raisonImprimante: string | null = null;

    try {
      await imprimerFichesSunmi(ts, entete);
      return;
    } catch (e: any) {
      // On GARDE la raison : avalee, elle laissait le vendeur devant une
      // impression qui ne fait rien, sans le moindre message. C'est ce qui
      // empechait de savoir pourquoi un terminal n'imprimait pas.
      raisonImprimante = e?.message ?? 'cause inconnue';
    }

    // Repli sur le dialogue d'impression Android/iOS : utile sur un telephone
    // sans imprimante integree.
    try {
      for (const t of ts) {
        await Print.printAsync({ html: genererRecuHtml(t, entete) });
      }
    } catch (e: any) {
      // Annulation volontaire du dialogue : rien a signaler.
      const message = String(e?.message ?? '');
      if (/cancel|did not complete|dismiss/i.test(message)) return;

      alerteSimple(
        'Impression impossible',
        `L'imprimante du terminal n'a pas repondu : ${raisonImprimante}\n\n`
          + "Aucune imprimante systeme n'est disponible non plus. La fiche est bien enregistree : "
          + 'tu peux la reimprimer depuis « Fiches vendues ».'
      );
    }
  }

  async function imprimer() {
    await imprimerFicheThermique(tickets);
  }

  async function partager() {
    if (tickets.length === 0) return;
    if (tickets.length > 1) {
      alerteSimple('Plusieurs fiches', 'Le partage ne fonctionne que pour une fiche a la fois : partage de la premiere.');
    }

    // Le PDF partage reprend la meme entete que la fiche imprimee.
    let entete;
    try {
      entete = await construireEntete(tickets);
    } catch {
      // Configuration indisponible : on partage la fiche sans l'entete complete.
    }

    const { uri } = await Print.printToFileAsync({ html: genererRecuHtml(tickets[0], entete) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
  }

  // Apercu de la fiche en cours de saisie (avant validation / envoi au serveur)
  function construirePreviewTicket(lignesTicket: Ligne[], index: number): TicketResponse {
    return {
      id: index,
      numero_ticket: `BROUILLON-${index + 1}`,
      nom_client: null,
      telephone_client: null,
      montant_total: lignesTicket.reduce((s, l) => s + l.montant, 0).toFixed(2),
      gain_total: '0',
      statut: 'en_attente',
      paye: false,
      paye_le: null,
      created_at: new Date().toISOString(),
      mises: lignesTicket.map((l, index) => ({
        id: index,
        numero: l.numero,
        numero_2: l.numero2 ?? null,
        option_combinaison: l.optionCombinaison ?? null,
        montant: String(l.montant),
        gain_potentiel: '0',
        gain_reel: '0',
        statut: 'en_attente',
        type_jeu: l.typeJeu,
        tirage: l.tirage,
      })),
    };
  }

  // Meme decoupage par zone que la vraie soumission, pour que l'apercu
  // corresponde exactement aux fiches qui seront reellement creees.
  function construirePreviewTickets(): TicketResponse[] {
    const idsZones = [...new Set(lignes.map((l) => l.tirage.id))];
    return idsZones.map((idZone, index) =>
      construirePreviewTicket(lignes.filter((l) => l.tirage.id === idZone), index)
    );
  }

  async function imprimerApercu() {
    if (lignes.length === 0) {
      alerteSimple('Fiche vide', "Ajoute au moins une ligne avant d'imprimer.");
      return;
    }
    await imprimerFicheThermique(construirePreviewTickets());
  }

  if (chargement) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
        <Text style={styles.texteRecu}>Chargement...</Text>
      </View>
    );
  }

  if (tickets.length > 0) {
    const grandTotal = tickets.reduce((s, t) => s + Number(t.montant_total), 0);

    return (
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 24 + insets.bottom }]}>
        <Text style={styles.titreRecu}>{tickets.length > 1 ? `${tickets.length} tickets crees` : 'Ticket cree'}</Text>

        {tickets.map((t) => (
          <View key={t.id}>
            <Text style={styles.numeroTicket}>{t.numero_ticket}</Text>

            {t.mises.filter((m) => !m.mariage_bonus).map((mise) => (
              <View key={mise.id} style={styles.ligneRecu}>
                <Text style={styles.texteRecu}>
                  {mise.tirage.loterie.nom} - {mise.type_jeu.nom} - {mise.numero_2 ? `${mise.numero} x ${mise.numero_2}` : mise.numero}
                  {mise.option_combinaison ? ` (option ${mise.option_combinaison})` : ''}
                </Text>
                <Text style={styles.texteRecu}>{Number(mise.montant).toFixed(2)}</Text>
              </View>
            ))}

            {t.mises.some((m) => m.mariage_bonus) && (
              <>
                <Text style={styles.titreBonus}>Mariage Gratuit</Text>
                {t.mises.filter((m) => m.mariage_bonus).map((mise) => (
                  <View key={mise.id} style={styles.ligneRecu}>
                    <Text style={styles.texteRecu}>{mise.type_jeu.nom} - {mise.numero} x {mise.numero_2}</Text>
                    <Text style={styles.texteRecu}>gratis</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.totalRecu}>Total: {Number(t.montant_total).toFixed(2)}</Text>
          </View>
        ))}

        {tickets.length > 1 && (
          <Text style={[styles.totalRecu, { marginTop: 8 }]}>Grand Total: {grandTotal.toFixed(2)}</Text>
        )}

        {/* Actions du recu, dans le meme style de carte que la page Parametre :
            icone dans un cercle translucide, texte blanc, coins arrondis, ombre. */}
        {([
          ['Imprimer', 'print', '#2563eb', imprimer],
          ['Partager', 'share-social', '#0ea5e9', partager],
          ['Nouveau ticket', 'add-circle', '#16a34a', nouveauTicket],
          ["Retour a l'accueil", 'home', '#6b7280', onRetour],
          ['Supprimer', 'trash', '#dc2626', confirmerSuppressionTicket],
        ] as const).map(([libelle, icone, couleur, action]) => (
          <TouchableOpacity
            key={libelle}
            // Tant qu'une action tourne, toutes les cartes sont grisees : on ne
            // veut pas non plus qu'on supprime une fiche pendant qu'elle
            // s'imprime.
            style={[styles.carteAction, { backgroundColor: couleur }, enCours ? styles.carteActionInactive : null]}
            onPress={lancer(libelle, action)}
            activeOpacity={0.85}
            disabled={!!enCours}
          >
            <View style={styles.carteActionIcone}>
              {enCours === libelle
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name={icone as any} size={20} color="#fff" />}
            </View>
            <Text style={styles.carteActionTexte}>{libelle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // Type de jeu effectivement utilise pour la saisie manuelle : celui choisi,
  // ou a defaut le premier type disponible (mise simple sans avoir a cliquer).
  const typeJeuEffectif = typeJeuSelectionne ?? typesJeux[0] ?? null;
  // Combinaison saisie a la main (Boule 1 / Boule 2) : uniquement si ce n'est pas
  // un type en generation automatique (ex: MA Auto n'affiche jamais ces champs).
  const combinaisonManuelle = !!typeJeuEffectif?.est_combinaison && !typeJeuEffectif?.generation_auto;

  return (
    <KeyboardAvoidingView
      style={styles.ecran}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Barre du haut */}
      <View style={[styles.barreHaut, paddingEntete]}>
        <TouchableOpacity hitSlop={TOUCHE_RETOUR} onPress={onRetour} style={styles.iconeBarre} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        {/* Les quatre icones partagent le meme verrou : pendant qu'une fiche
            part, on ne peut ni vider la saisie, ni recharger, ni relancer. */}
        <TouchableOpacity
          onPress={lancer('vider', viderTout)}
          style={[styles.iconeBarre, styles.iconeBarreCercle, occupe ? styles.iconeBarreInactive : null]}
          activeOpacity={0.7}
          disabled={occupe}
        >
          <Ionicons name="trash" size={19} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={lancer('recharger', chargerDonnees)}
          style={[styles.iconeBarre, styles.iconeBarreCercle, occupe ? styles.iconeBarreInactive : null]}
          activeOpacity={0.7}
          disabled={occupe}
        >
          {chargement || enCours === 'recharger'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="refresh" size={20} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={lancer('apercu', imprimerApercu)}
          style={[styles.iconeBarre, styles.iconeBarreCercle, occupe ? styles.iconeBarreInactive : null]}
          activeOpacity={0.7}
          disabled={occupe}
        >
          {enCours === 'apercu'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="document-text-outline" size={19} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={lancer('valider', validerTicket)}
          style={[styles.iconeBarre, styles.iconeBarreCercle, styles.iconeBarreValider, occupe ? styles.iconeBarreInactive : null]}
          activeOpacity={0.7}
          disabled={occupe}
        >
          {envoiEnCours || enCours === 'valider'
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.zoneListe} keyboardShouldPersistTaps="handled">
        {zonesAffichees.length === 0 ? (
          <Text style={styles.listeVide}>Selectionne au moins une loterie.</Text>
        ) : (
          zonesAffichees.map((zone) => {
            const lignesZone = lignes.filter((l) => l.tirage.id === zone.id);
            const totalZone = lignesZone.reduce((somme, l) => somme + l.montant, 0);

            return (
              <View key={zone.id}>
                <View style={styles.bandeauLoterie}>
                  <TouchableOpacity
                    onPress={() => supprimerZone(zone)}
                    hitSlop={ZONE_TOUCHE}
                    style={[styles.badgeIconeZone, styles.badgeSupprimerZone]}
                  >
                    <Ionicons name="trash" size={15} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.bandeauLoterieTexte}>
                    {zone.loterie.nom} {'=>'} {totalZone.toFixed(2)} {DEVISE}
                  </Text>
                  <TouchableOpacity
                    style={[styles.badgeIconeZone, styles.badgeEditerZone]}
                    hitSlop={ZONE_TOUCHE}
                    onPress={() => {
                      if (lignesZone.length === 0) {
                        alerteSimple('Zone vide', 'Aucune ligne a modifier pour cette zone.');
                        return;
                      }
                      setZoneEnEdition(zone.id);
                      setMontantEditionZone('');
                    }}
                  >
                    <Ionicons name="pencil" size={15} color="#fff" />
                  </TouchableOpacity>
                </View>

                {lignesZone.length === 0 ? (
                  <Text style={styles.listeVide}>Aucun numero saisi pour cette zone.</Text>
                ) : (
                  regrouperParLabel(lignesZone).map((groupe) => (
                    <View key={groupe.label}>
                      <View style={styles.bandeauGroupe}>
                        <TouchableOpacity
                          onPress={() => confirmerSuppressionGroupe(zone.id, groupe.label)}
                          hitSlop={ZONE_TOUCHE}
                        >
                          <Ionicons name="trash" size={19} color="#e74c3c" />
                        </TouchableOpacity>
                        <Text style={styles.bandeauGroupeTexte}>
                          {groupe.label} {'=>'} {groupe.total.toFixed(2)} {DEVISE}
                        </Text>
                        <TouchableOpacity onPress={() => ouvrirEditionGroupe(zone.id, groupe.label)}>
                          <Ionicons name="pencil" size={20} color="#e74c3c" />
                        </TouchableOpacity>
                      </View>

                      {groupe.lignes.map((l) => (
                        <View key={l.localId} style={styles.ligneJouee}>
                          <TouchableOpacity onPress={() => supprimerLigne(l.localId)} hitSlop={ZONE_TOUCHE}>
                            <Ionicons name="trash" size={19} color="#e74c3c" />
                          </TouchableOpacity>
                          <Text style={styles.ligneJoueeLabel}>{groupe.label}</Text>
                          <View style={styles.ligneJoueeNumeroConteneur}>
                            {l.optionCombinaison && (
                              <View style={styles.badgeOption}>
                                <Text style={styles.badgeOptionTexte}>{l.optionCombinaison}</Text>
                              </View>
                            )}
                            <Text style={styles.ligneJoueeNumero}>{l.numero2 ? `${l.numero} x ${l.numero2}` : l.numero}</Text>
                          </View>
                          <Text style={styles.ligneJoueeMontant}>{l.montant.toFixed(2)} {DEVISE}</Text>
                          <TouchableOpacity onPress={() => ouvrirEditionLigne(l)}>
                            <Ionicons name="create" size={20} color="#e74c3c" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Total / solde */}
      <View style={styles.resume}>
        <Text style={styles.resumeTexte}>Total: {total.toFixed(2)} {DEVISE}</Text>
        <Text style={styles.resumeTexte}>Solde: {Number(utilisateur.balance).toFixed(2)} {DEVISE}</Text>
      </View>

      {/* Boutons loteries (selection multiple) */}
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.rangeeBoutons} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {tirages.map((t, index) => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.boutonCouleur,
              { backgroundColor: zoneEstSelectionnee(t) ? '#16a34a' : '#dc2626' },
            ]}
            onPress={() => toggleZone(t)}
          >
            <Text allowFontScaling={false} numberOfLines={1} style={styles.boutonCouleurTexte}>{t.loterie.nom}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Boutons types de jeu : clavier ouvert seulement, pour rendre la place
          a la liste des boules le reste du temps.

          keyboardShouldPersistTaps est indispensable ici, pas decoratif : par
          defaut un ScrollView AVALE le premier appui quand le clavier est
          ouvert, pour ne fermer que le clavier. Tant que la rangee restait
          affichee en permanence, le deuxieme appui passait et personne ne le
          remarquait. Depuis qu'elle disparait avec le clavier, il n'y a plus
          de deuxieme appui : les boutons auto ne repondaient plus du tout. */}
      {clavierOuvert && (
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={styles.rangeeBoutons} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {typesJeux.filter((tj) => tj.visible_bouton).map((tj, index) => (
            <TouchableOpacity
              key={tj.id}
              style={[
                styles.boutonCouleur,
                { backgroundColor: couleurBoutonJeu(tj, index) },
              ]}
              onPress={() => selectionnerTypeJeu(tj)}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={styles.boutonCouleurTexte}>{tj.nom}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Saisie Boule / Mise : toujours visible, meme sans aucun type de jeu selectionne.
          Le 2e champ n'apparait que pour une combinaison saisie a la main (pas pour MA Auto). */}
      <View style={styles.zoneSaisie}>
        <View style={styles.champSaisie}>
          <TextInput
            style={styles.champInput}
            keyboardType="decimal-pad"
            maxLength={7}
            value={numero}
            onChangeText={(texte) => setNumero(nettoyerNumeroPrincipal(texte))}
            placeholder={combinaisonManuelle ? 'Boule 1' : 'Boule'}
            placeholderTextColor="#999"
          />
          <TouchableOpacity
            style={[styles.checkboxChamp, bouleCheckee && styles.checkboxChampActif]}
            onPress={() => setBouleCheckee((v) => !v)}
          >
            {bouleCheckee && <Ionicons name="checkmark" size={13} color="#fff" />}
          </TouchableOpacity>
        </View>
        {combinaisonManuelle && (
          <View style={styles.champSaisie}>
            <TextInput
              style={styles.champInput}
              keyboardType="number-pad"
              maxLength={typeJeuEffectif?.nombre_chiffres ?? 3}
              value={numero2}
              onChangeText={(texte) => setNumero2(nettoyerNumero(texte))}
              placeholder="Boule 2"
              placeholderTextColor="#999"
            />
          </View>
        )}
        <View style={styles.champSaisie}>
          <TextInput
            style={styles.champInput}
            keyboardType="decimal-pad"
            value={montant}
            onChangeText={(texte) => setMontant(nettoyerMontant(texte))}
            placeholder="Mise"
            placeholderTextColor="#999"
          />
          <TouchableOpacity
            style={[styles.checkboxChamp, miseCheckee && styles.checkboxChampActif]}
            onPress={() => setMiseCheckee((v) => !v)}
          >
            {miseCheckee && <Ionicons name="checkmark" size={13} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Verrouille comme le reste : un double appui ici ajoutait deux fois la
          meme mise, donc de l'argent en trop sur la fiche. */}
      <TouchableOpacity
        style={[styles.boutonEntrer, occupe ? styles.boutonEntrerInactif : null]}
        onPress={lancer('entrer', ajouterLigne)}
        activeOpacity={0.85}
        disabled={occupe}
      >
        <Text style={styles.boutonEntrerTexte}>Entrer</Text>
      </TouchableOpacity>

      <Modal visible={modalPaireVisible} transparent animationType="fade" onRequestClose={fermerModalAuto}>
        <View style={styles.fondModal}>
          <View style={styles.carteModal}>
            <Text style={styles.titreModal}>{titreModalAuto()}</Text>

            {/* Options de lots du lotto 4 / 5. Sans ce choix, tout partait en
                option 1 sans que le vendeur le sache. Plusieurs options
                cochees rejouent la serie entiere pour chacune. */}
            {typeJeuSelectionne && estJeuAOptions(typeJeuSelectionne.nombre_chiffres) && (
              <View style={styles.rangeeOptions}>
                {[1, 2, 3].map((option) => {
                  const actif = optionsLotto.includes(option);
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[styles.puceOption, actif && styles.puceOptionActive]}
                      onPress={() => basculerOptionLotto(option)}
                    >
                      <Text style={[styles.puceOptionTexte, actif && styles.puceOptionTexteActif]}>
                        Option {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TextInput
              ref={refInputPaire}
              style={styles.champInput}
              keyboardType="decimal-pad"
              value={montantPaireModal}
              onChangeText={(texte) => setMontantPaireModal(nettoyerMontant(texte))}
            />
            <View style={styles.boutonsModal}>
              <TouchableOpacity
                style={[styles.boutonPlein, styles.boutonSecondaire, { flex: 1 }]}
                onPress={fermerModalAuto}
              >
                <Text style={styles.boutonPleinTexte}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.boutonPlein, { flex: 1 }]} onPress={genererBoulesAuto}>
                <Text style={styles.boutonPleinTexte}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edition d'une ligne individuelle */}
      <Modal visible={!!ligneEnEdition} transparent animationType="fade" onRequestClose={() => setLigneEnEdition(null)}>
        <View style={styles.fondModal}>
          <View style={styles.carteModal}>
            <Text style={styles.titreModal}>Modifier la ligne</Text>
            <View style={styles.modalChamps}>
              <View style={styles.modalChamp}>
                <TextInput
                  style={styles.champInput}
                  keyboardType={ligneEnEdition && estJeuAOptions(ligneEnEdition.typeJeu.nombre_chiffres) ? 'decimal-pad' : 'number-pad'}
                  maxLength={ligneEnEdition && estJeuAOptions(ligneEnEdition.typeJeu.nombre_chiffres) ? 7 : ligneEnEdition?.typeJeu.nombre_chiffres}
                  value={numeroEditionLigne}
                  onChangeText={(texte) =>
                    setNumeroEditionLigne(
                      ligneEnEdition && estJeuAOptions(ligneEnEdition.typeJeu.nombre_chiffres) ? nettoyerNumeroPrincipal(texte) : nettoyerNumero(texte)
                    )
                  }
                  placeholder={ligneEnEdition?.numero2 !== undefined ? 'Boule 1' : 'Boule'}
                  placeholderTextColor="#999"
                />
              </View>
              {ligneEnEdition?.numero2 !== undefined ? (
                <View style={styles.modalChamp}>
                  <TextInput
                    style={styles.champInput}
                    keyboardType="number-pad"
                    maxLength={ligneEnEdition?.typeJeu.nombre_chiffres}
                    value={numero2EditionLigne}
                    onChangeText={(texte) => setNumero2EditionLigne(nettoyerNumero(texte))}
                    placeholder="Boule 2"
                    placeholderTextColor="#999"
                  />
                </View>
              ) : null}
              <View style={styles.modalChamp}>
                <TextInput
                  style={styles.champInput}
                  keyboardType="decimal-pad"
                  value={montantEditionLigne}
                  onChangeText={(texte) => setMontantEditionLigne(nettoyerMontant(texte))}
                  placeholder="Mise"
                  placeholderTextColor="#999"
                />
              </View>
            </View>
            <View style={styles.boutonsModal}>
              <TouchableOpacity
                style={[styles.boutonPlein, styles.boutonSecondaire, { flex: 1 }]}
                onPress={() => setLigneEnEdition(null)}
              >
                <Text style={styles.boutonPleinTexte}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.boutonPlein, { flex: 1 }]} onPress={enregistrerEditionLigne}>
                <Text style={styles.boutonPleinTexte}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edition groupee (nouveau montant pour toutes les lignes Bo/Ma d'une zone) */}
      <Modal visible={!!groupeEnEdition} transparent animationType="fade" onRequestClose={() => setGroupeEnEdition(null)}>
        <View style={styles.fondModal}>
          <View style={styles.carteModal}>
            <Text style={styles.titreModal}>Nouveau montant pour les lignes {groupeEnEdition?.label}</Text>
            <TextInput
              ref={refInputGroupe}
              style={styles.champInput}
              keyboardType="decimal-pad"
              value={montantEditionGroupe}
              onChangeText={(texte) => setMontantEditionGroupe(nettoyerMontant(texte))}
            />
            <View style={styles.boutonsModal}>
              <TouchableOpacity
                style={[styles.boutonPlein, styles.boutonSecondaire, { flex: 1 }]}
                onPress={() => setGroupeEnEdition(null)}
              >
                <Text style={styles.boutonPleinTexte}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.boutonPlein, { flex: 1 }]} onPress={enregistrerEditionGroupe}>
                <Text style={styles.boutonPleinTexte}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edition de toute la zone (nouveau montant pour toutes les lignes de la zone) */}
      <Modal visible={zoneEnEdition !== null} transparent animationType="fade" onRequestClose={() => setZoneEnEdition(null)}>
        <View style={styles.fondModal}>
          <View style={styles.carteModal}>
            <Text style={styles.titreModal}>Nouveau montant pour toute la zone</Text>
            <TextInput
              ref={refInputZone}
              style={styles.champInput}
              keyboardType="decimal-pad"
              value={montantEditionZone}
              onChangeText={(texte) => setMontantEditionZone(nettoyerMontant(texte))}
            />
            <View style={styles.boutonsModal}>
              <TouchableOpacity
                style={[styles.boutonPlein, styles.boutonSecondaire, { flex: 1 }]}
                onPress={() => setZoneEnEdition(null)}
              >
                <Text style={styles.boutonPleinTexte}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.boutonPlein, { flex: 1 }]} onPress={enregistrerEditionZone}>
                <Text style={styles.boutonPleinTexte}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  ecran: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    padding: 16,
    paddingTop: 60,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barreHaut: {
    backgroundColor: '#6c5ce7',
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  iconeBarre: {
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeBarreCercle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  iconeBarreValider: {
    backgroundColor: '#16a34a',
  },
  // Les trois styles « inactif » ci-dessous servent au verrou anti double-appui :
  // le bouton doit se voir eteint, sinon le vendeur croit que l'appui n'a pas
  // ete pris et insiste.
  iconeBarreInactive: {
    opacity: 0.45,
  },
  bandeauLoterie: {
    backgroundColor: '#4834d4',
    borderRadius: 16,
    marginHorizontal: 8,
    marginVertical: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rangeeOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  puceOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  puceOptionActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  puceOptionTexte: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4b5563',
  },
  puceOptionTexteActif: {
    color: '#fff',
  },
  badgeIconeZone: {
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSupprimerZone: {
    backgroundColor: '#e74c3c',
  },
  badgeEditerZone: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  bandeauLoterieTexte: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  bandeauGroupe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bandeauGroupeTexte: {
    fontWeight: '700',
    color: '#333',
  },
  zoneListe: {
    flex: 1,
    paddingHorizontal: 12,
  },
  listeVide: {
    textAlign: 'center',
    color: '#999',
    marginTop: 12,
    marginBottom: 12,
  },
  ligneJouee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  ligneJoueeLabel: {
    color: '#888',
    fontWeight: '600',
  },
  ligneJoueeNumeroConteneur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ligneJoueeNumero: {
    fontWeight: '700',
    // Couleur explicite : sinon blanche en mode sombre, donc le numero joue
    // disparait sur le fond clair de la liste.
    color: '#111827',
  },
  badgeOption: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOptionTexte: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  ligneJoueeMontant: {
    fontWeight: '600',
    color: '#111827',
  },
  resume: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f9fafb',
  },
  resumeTexte: {
    fontWeight: '700',
    color: '#333',
  },
  rangeeBoutons: {
    flexGrow: 0,
    // Hauteur FIXE, et interdiction de retrecir. Sans ca, sur un petit ecran
    // avec le clavier ouvert, la colonne manque de place et Yoga comprime
    // cette rangee : les pastilles perdent une quinzaine de pixels et leur
    // libelle se retrouve coupe. Vu sur un iPos Q2 -- les pastilles
    // s'affichaient vides, de simples rectangles de couleur, alors que le
    // meme ecran clavier ferme les affichait correctement.
    //
    // C'est la liste des boules (zoneListe, flex: 1) qui doit absorber le
    // manque de place, pas les boutons : elle, au moins, defile.
    flexShrink: 0,
    height: 54,
    paddingVertical: 6,
  },
  boutonCouleur: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  boutonCouleurTexte: {
    color: '#fff',
    fontWeight: '700',
    // Taille explicite, ET allowFontScaling={false} sur les deux libelles.
    // fontSize seul ne suffit pas : React Native le multiplie par le reglage
    // de taille de police du systeme. Un terminal en « grande police » aurait
    // donc retrouve exactement le bug que la hauteur fixe vient de corriger,
    // la pastille ne pouvant plus s'etirer. La place disponible est de 42
    // points (54 de rangee moins 12 de rembourrage) pour une pastille qui en
    // demande environ 40 : il n'y a pas de marge pour un agrandissement.
    fontSize: 14,
  },
  zoneSaisie: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  champSaisie: {
    flex: 1,
    position: 'relative',
  },
  champInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    // Sans couleur explicite, le texte saisi prend celle du systeme : blanc sur
    // un telephone en mode sombre, donc invisible sur ce fond clair.
    color: '#111827',
  },
  checkboxChamp: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: '#bbb',
    borderRadius: 5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChampActif: {
    backgroundColor: '#6c5ce7',
    borderColor: '#6c5ce7',
  },
  modalChamps: {
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  modalChamp: {},
  boutonEntrerInactif: {
    opacity: 0.5,
  },
  boutonEntrer: {
    backgroundColor: '#6c5ce7',
    margin: 12,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: '#6c5ce7',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    alignItems: 'center',
  },
  boutonEntrerTexte: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Couleur TOUJOURS explicite sur le recu : sans elle, le texte prend celle du
  // systeme, qui passe au blanc sur un telephone en mode sombre (ou avec le
  // « theme sombre force » d'Android). Le recu devenait alors invisible, alors
  // qu'il s'affichait bien sur les terminaux POS, restes en clair.
  titreRecu: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#111827',
  },
  titreBonus: {
    textAlign: 'center',
    fontWeight: '700',
    color: '#e67e22',
    marginTop: 8,
    marginBottom: 4,
  },
  ligneRecu: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  totalRecu: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'right',
    marginVertical: 12,
    color: '#111827',
  },
  /** Lignes de mise du recu : nom de la zone, jeu, numero, montant. */
  texteRecu: {
    color: '#374151',
  },
  // Cartes d'action du recu : meme langage visuel que les boutons de Parametre.
  carteActionInactive: {
    opacity: 0.5,
  },
  carteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  carteActionIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carteActionTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  boutonPlein: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  boutonSecondaire: {
    backgroundColor: '#6b7280',
  },
  boutonSupprimer: {
    backgroundColor: '#dc2626',
  },
  boutonPleinTexte: {
    color: '#fff',
    fontWeight: 'bold',
  },
  numeroTicket: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 16,
    fontWeight: '600',
    color: '#111827',
  },
  fondModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carteModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  titreModal: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#333',
  },
  boutonsModal: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
});
