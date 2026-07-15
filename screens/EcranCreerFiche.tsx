import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';

import { alerteConfirmation, alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { Ligne, Tirage, TypeJeu, TicketResponse } from '../types';
import { genererRecuHtml } from '../receipt';
import { imprimerFichesSunmi } from '../sunmiPrint';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

const DEVISE = 'HTG';
const COULEURS_JEUX = ['#0d9488', '#2563eb', '#7c3aed', '#dc2626', '#16a34a', '#f59e0b'];

// Empeche toute lettre : ne garde que les chiffres.
function nettoyerNumero(texte: string): string {
  return texte.replace(/[^0-9]/g, '');
}

// Empeche toute lettre : ne garde que les chiffres et un seul separateur decimal.
function nettoyerMontant(texte: string): string {
  const nettoye = texte.replace(/[^0-9.,]/g, '');
  const indexSeparateur = nettoye.search(/[.,]/);
  if (indexSeparateur === -1) return nettoye;
  return nettoye.slice(0, indexSeparateur + 1) + nettoye.slice(indexSeparateur + 1).replace(/[.,]/g, '');
}

export default function EcranCreerFiche({ utilisateur, onRetour }: Props) {
  const [tirages, setTirages] = useState<Tirage[]>([]);
  const [typesJeux, setTypesJeux] = useState<TypeJeu[]>([]);
  const [chargement, setChargement] = useState(true);

  const [tirageSelectionnes, setTirageSelectionnes] = useState<Tirage[]>([]);
  const [typeJeuSelectionne, setTypeJeuSelectionne] = useState<TypeJeu | null>(null);
  const [numero, setNumero] = useState('');
  const [numero2, setNumero2] = useState('');
  const [montant, setMontant] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);

  // Case Boule cochee : 2 chiffres -> joue le numero + son reverse ; 4 chiffres -> marriage a x b et b x a.
  const [bouleCheckee, setBouleCheckee] = useState(false);
  // Case Mise cochee : le montant reste rempli apres validation pour enchainer plusieurs saisies.
  const [miseCheckee, setMiseCheckee] = useState(false);

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Un client qui joue dans plusieurs zones (tirages) obtient une fiche
  // separee par zone, imprimees ensemble avec un Grand Total.
  const [tickets, setTickets] = useState<TicketResponse[]>([]);

  const [modalPaireVisible, setModalPaireVisible] = useState(false);
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
      alerteSimple(
        'Connexion impossible',
        "Verifie que le serveur Laravel tourne et que l'adresse API_URL dans config.ts correspond a l'IP de ton ordinateur."
      );
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
      // deja joues restent affiches dans la liste (rien n'est supprime).
      setTirageSelectionnes((prev) => prev.filter((t) => t.id !== tirage.id));
    });
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

    // Case Boule cochee : raccourci reverse/marriage directement depuis le champ Boule,
    // sans passer par les boutons Reverse/MA Auto.
    if (bouleCheckee) {
      const typeJeuBase = typeJeuSelectionne ?? typesJeux[0];
      if (!typeJeuBase) {
        alerteSimple('Aucun type de jeu', 'Aucun type de jeu n\'est configure dans le systeme.');
        return;
      }
      if (numero.length === 2) {
        const inverse = numero.split('').reverse().join('');
        const paires = (inverse !== numero ? [numero, inverse] : [numero]).map((num) => ({
          numero: num,
          numero2: undefined as string | undefined,
        }));
        ajouterOuFusionnerLignes(typeJeuBase, paires, montantNombre);
        return;
      }
      if (numero.length === 4) {
        const a = numero.slice(0, 2);
        const b = numero.slice(2, 4);
        const typeMarriage = typesJeux.find((t) => t.est_combinaison) ?? typeJeuBase;
        ajouterOuFusionnerLignes(typeMarriage, [
          { numero: a, numero2: b },
          { numero: b, numero2: a },
        ], montantNombre);
        return;
      }
      alerteSimple('Numero invalide', 'Avec la case Boule cochee, entre 2 chiffres (reverse) ou 4 chiffres (marriage).');
      return;
    }

    // Un type de jeu est explicitement selectionne : on garde sa validation stricte
    // (nombre de chiffres exact, 2e numero pour une combinaison saisie a la main).
    if (typeJeuSelectionne) {
      const typeJeu = typeJeuSelectionne;
      if (numero.length !== typeJeu.nombre_chiffres) {
        alerteSimple('Numero invalide', `Ce jeu demande ${typeJeu.nombre_chiffres} chiffres.`);
        return;
      }
      const combinaisonManuelleJeu = typeJeu.est_combinaison && !typeJeu.generation_auto;
      if (combinaisonManuelleJeu && numero2.length !== typeJeu.nombre_chiffres) {
        alerteSimple('2e numero invalide', `Ce jeu demande un 2e numero a ${typeJeu.nombre_chiffres} chiffres.`);
        return;
      }
      const numero2Valeur = combinaisonManuelleJeu ? numero2 : undefined;
      ajouterOuFusionnerLignes(typeJeu, [{ numero, numero2: numero2Valeur }], montantNombre);
      return;
    }

    // Aucun type de jeu selectionne : on detecte automatiquement le jeu loto qui
    // correspond au nombre de chiffres saisis (2=simple, 3 a 7=Lo3...Lo7).
    if (numero.length < 2 || numero.length > 7) {
      alerteSimple('Numero invalide', 'Entre entre 2 et 7 chiffres.');
      return;
    }
    // L3-L7 Auto ont aussi un generation_auto (bouton "boules identiques"), donc on ne
    // filtre plus dessus ici : sinon la detection par nombre de chiffres les ignore et
    // retombe a tort sur BPaire pour un numero de 3+ chiffres.
    const typeJeu = typesJeux.find((t) => t.nombre_chiffres === numero.length && !t.est_combinaison) ?? typesJeux[0];
    if (!typeJeu) {
      alerteSimple('Aucun type de jeu', 'Aucun type de jeu n\'est configure dans le systeme.');
      return;
    }
    ajouterOuFusionnerLignes(typeJeu, [{ numero, numero2: undefined }], montantNombre);
  }

  // Si la boule est deja jouee dans une des zones selectionnees, on demande
  // confirmation pour ajouter le montant a la ligne existante plutot que
  // d'en creer une nouvelle en double.
  function ajouterOuFusionnerLignes(
    typeJeu: TypeJeu,
    paires: { numero: string; numero2: string | undefined }[],
    montantNombre: number
  ) {
    const doublons = tirageSelectionnes.flatMap((tirage) =>
      paires
        .filter((p) => lignes.some((l) => l.tirage.id === tirage.id && l.numero === p.numero && l.numero2 === p.numero2))
        .map((p) => ({ tirage, ...p }))
    );

    const appliquer = () => {
      setLignes((prev) => {
        const resultat = [...prev];
        for (const tirage of tirageSelectionnes) {
          for (const p of paires) {
            const index = resultat.findIndex(
              (l) => l.tirage.id === tirage.id && l.numero === p.numero && l.numero2 === p.numero2
            );
            if (index >= 0) {
              resultat[index] = { ...resultat[index], montant: resultat[index].montant + montantNombre };
            } else {
              resultat.push({
                localId: `${Date.now()}-${tirage.id}-${p.numero}-${p.numero2 ?? ''}-${Math.random()}`,
                tirage,
                typeJeu,
                numero: p.numero,
                numero2: p.numero2,
                montant: montantNombre,
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

  function selectionnerTypeJeu(typeJeu: TypeJeu) {
    setTypeJeuSelectionne(typeJeu);
    if (typeJeu.generation_auto) {
      setMontantPaireModal('');
      setModalPaireVisible(true);
    }
  }

  // Un bouton de generation automatique n'est qu'un declencheur ponctuel : une fois
  // le popup ferme (valide ou annule), on oublie la selection pour ne pas bloquer
  // silencieusement la saisie manuelle suivante avec son nombre de chiffres.
  function fermerModalAuto() {
    setModalPaireVisible(false);
    setMontantPaireModal('');
    setTypeJeuSelectionne(null);
  }

  function titreModalAuto(): string {
    const mode = typeJeuSelectionne?.generation_auto;
    if (mode === 'paire') {
      const chiffres = typeJeuSelectionne?.nombre_chiffres ?? 2;
      return chiffres === 2 ? 'Montant pour les boules paires' : `Montant pour les boules lotto ${chiffres} auto`;
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

    if (mode === 'marriage') {
      // Combine 2 par 2 les numeros simples deja joues dans chaque zone selectionnee.
      const nouvellesLignes: Ligne[] = tirageSelectionnes.flatMap((tirage) => {
        const numerosZone = Array.from(
          new Set(lignes.filter((l) => l.tirage.id === tirage.id && !l.numero2).map((l) => l.numero))
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
        alerteSimple('Pas assez de numeros', 'Joue au moins 2 numeros simples dans une zone avant de generer les Marriage.');
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
          new Set(lignes.filter((l) => l.tirage.id === tirage.id && !l.numero2).map((l) => l.numero))
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
        alerteSimple('Aucun reverse possible', 'Joue au moins un numero simple non palindrome dans une zone avant de generer les Reverse.');
        return;
      }

      setLignes((prev) => [...prev, ...nouvellesLignes]);
      fermerModalAuto();
      return;
    }

    const nombreChiffres = typeJeuSelectionne.nombre_chiffres;
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
      numeros.map((num, index) => ({
        localId: `${Date.now()}-${tirage.id}-auto-${index}`,
        tirage,
        typeJeu: typeJeuSelectionne,
        numero: num,
        montant: montantNombre,
      }))
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
    setNumeroEditionLigne(l.numero);
    setNumero2EditionLigne(l.numero2 ?? '');
    setMontantEditionLigne(String(l.montant));
  }

  function enregistrerEditionLigne() {
    if (!ligneEnEdition) return;
    const typeJeu = ligneEnEdition.typeJeu;
    const aDeuxNumeros = ligneEnEdition.numero2 !== undefined;

    if (numeroEditionLigne.length !== typeJeu.nombre_chiffres) {
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
          ? { ...l, numero: numeroEditionLigne, numero2: aDeuxNumeros ? numero2EditionLigne : undefined, montant: montantNombre }
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

    try {
      setEnvoiEnCours(true);
      const resultats: TicketResponse[] = [];

      for (const idZone of idsZones) {
        const lignesZone = lignes.filter((l) => l.tirage.id === idZone);
        const reponse = await appelApi('/tickets', {
          method: 'POST',
          body: JSON.stringify({
            mises: lignesZone.map((l) => ({
              tirage_id: l.tirage.id,
              type_jeu_id: l.typeJeu.id,
              numero: l.numero,
              numero_2: l.numero2 ?? null,
              montant: l.montant,
            })),
          }),
        });

        if (!reponse.ok) {
          const erreur = await reponse.json();
          // Si une zone precedente a deja ete enregistree, on l'annule pour
          // ne pas laisser une fiche invisible deduite du solde.
          await Promise.all(resultats.map((t) => appelApi(`/tickets/${t.id}/annuler`, { method: 'POST' }).catch(() => {})));
          throw new Error(erreur.message ?? 'Erreur inconnue');
        }

        resultats.push(await reponse.json());
      }

      setTickets(resultats);
    } catch (e: any) {
      alerteSimple('Erreur', e.message ?? 'Impossible de creer le ticket.');
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
      alerteSimple('Erreur', e.message ?? "Impossible de supprimer cette fiche.");
    }
  }

  function nomVendeur(t: TicketResponse): string {
    const parent = t.agent?.parent?.name;
    const soi = t.agent?.name ?? utilisateur.name;
    return parent ? `${parent} ${soi}` : soi;
  }

  async function imprimerFicheThermique(ts: TicketResponse[]) {
    if (ts.length === 0) return;
    try {
      const config = await obtenirConfiguration();
      await imprimerFichesSunmi(ts, {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresseAgent: ts[0].agent?.adresse,
        adresseProprietaire: ts[0].agent?.proprietaire_adresse,
        posId: String(utilisateur.id),
        vendeurNom: nomVendeur(ts[0]),
        logoUrl: utilisateur.logo_url ?? config.logo_url ?? undefined,
      });
    } catch (e) {
      // Imprimante Sunmi indisponible (Expo Go, appareil sans imprimante...) :
      // repli sur le dialogue d'impression standard Android/iOS, une fiche a la fois.
      for (const t of ts) {
        await Print.printAsync({ html: genererRecuHtml(t) });
      }
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
    const { uri } = await Print.printToFileAsync({ html: genererRecuHtml(tickets[0]) });
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
        <Text>Chargement...</Text>
      </View>
    );
  }

  if (tickets.length > 0) {
    const grandTotal = tickets.reduce((s, t) => s + Number(t.montant_total), 0);

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.titreRecu}>{tickets.length > 1 ? `${tickets.length} tickets crees` : 'Ticket cree'}</Text>

        {tickets.map((t) => (
          <View key={t.id}>
            <Text style={styles.numeroTicket}>{t.numero_ticket}</Text>

            {t.mises.map((mise) => (
              <View key={mise.id} style={styles.ligneRecu}>
                <Text>
                  {mise.tirage.loterie.nom} - {mise.type_jeu.nom} - {mise.numero_2 ? `${mise.numero} x ${mise.numero_2}` : mise.numero}
                </Text>
                <Text>{Number(mise.montant).toFixed(2)}</Text>
              </View>
            ))}

            <Text style={styles.totalRecu}>Total: {Number(t.montant_total).toFixed(2)}</Text>
          </View>
        ))}

        {tickets.length > 1 && (
          <Text style={[styles.totalRecu, { marginTop: 8 }]}>Grand Total: {grandTotal.toFixed(2)}</Text>
        )}

        <TouchableOpacity style={styles.boutonPlein} onPress={imprimer}>
          <Text style={styles.boutonPleinTexte}>Imprimer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.boutonPlein} onPress={partager}>
          <Text style={styles.boutonPleinTexte}>Partager</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.boutonPlein, styles.boutonSecondaire]} onPress={nouveauTicket}>
          <Text style={styles.boutonPleinTexte}>Nouveau ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.boutonPlein, styles.boutonSecondaire]} onPress={onRetour}>
          <Text style={styles.boutonPleinTexte}>Retour a l'accueil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.boutonPlein, styles.boutonSupprimer]} onPress={confirmerSuppressionTicket}>
          <Text style={styles.boutonPleinTexte}>Supprimer</Text>
        </TouchableOpacity>
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
      <View style={styles.barreHaut}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeBarre} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={viderTout} style={[styles.iconeBarre, styles.iconeBarreCercle]} activeOpacity={0.7}>
          <Ionicons name="trash" size={19} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={imprimerApercu} style={[styles.iconeBarre, styles.iconeBarreCercle]} activeOpacity={0.7}>
          <Ionicons name="document-text-outline" size={19} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={validerTicket}
          style={[styles.iconeBarre, styles.iconeBarreCercle, styles.iconeBarreValider]}
          activeOpacity={0.7}
          disabled={envoiEnCours}
        >
          {envoiEnCours ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.zoneListe}>
        {zonesAffichees.length === 0 ? (
          <Text style={styles.listeVide}>Selectionne au moins une loterie.</Text>
        ) : (
          zonesAffichees.map((zone) => {
            const lignesZone = lignes.filter((l) => l.tirage.id === zone.id);
            const totalZone = lignesZone.reduce((somme, l) => somme + l.montant, 0);

            return (
              <View key={zone.id}>
                <View style={styles.bandeauLoterie}>
                  <TouchableOpacity onPress={() => toggleZone(zone)} style={[styles.badgeIconeZone, styles.badgeSupprimerZone]}>
                    <Ionicons name="trash" size={12} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.bandeauLoterieTexte}>
                    {zone.loterie.nom} {'=>'} {totalZone.toFixed(2)} {DEVISE}
                  </Text>
                  <TouchableOpacity
                    style={[styles.badgeIconeZone, styles.badgeEditerZone]}
                    onPress={() => {
                      if (lignesZone.length === 0) {
                        alerteSimple('Zone vide', 'Aucune ligne a modifier pour cette zone.');
                        return;
                      }
                      setZoneEnEdition(zone.id);
                      setMontantEditionZone('');
                    }}
                  >
                    <Ionicons name="pencil" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>

                {lignesZone.length === 0 ? (
                  <Text style={styles.listeVide}>Aucun numero saisi pour cette zone.</Text>
                ) : (
                  regrouperParLabel(lignesZone).map((groupe) => (
                    <View key={groupe.label}>
                      <View style={styles.bandeauGroupe}>
                        <TouchableOpacity onPress={() => confirmerSuppressionGroupe(zone.id, groupe.label)}>
                          <Ionicons name="trash" size={15} color="#e74c3c" />
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
                          <TouchableOpacity onPress={() => supprimerLigne(l.localId)}>
                            <Ionicons name="trash" size={15} color="#e74c3c" />
                          </TouchableOpacity>
                          <Text style={styles.ligneJoueeLabel}>{groupe.label}</Text>
                          <Text style={styles.ligneJoueeNumero}>{l.numero2 ? `${l.numero} x ${l.numero2}` : l.numero}</Text>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rangeeBoutons} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {tirages.map((t, index) => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.boutonCouleur,
              { backgroundColor: zoneEstSelectionnee(t) ? '#16a34a' : '#dc2626' },
            ]}
            onPress={() => toggleZone(t)}
          >
            <Text style={styles.boutonCouleurTexte}>{t.loterie.nom}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Boutons types de jeu */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rangeeBoutons} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {typesJeux.filter((tj) => tj.visible_bouton).map((tj, index) => (
          <TouchableOpacity
            key={tj.id}
            style={[
              styles.boutonCouleur,
              { backgroundColor: COULEURS_JEUX[index % COULEURS_JEUX.length] },
            ]}
            onPress={() => selectionnerTypeJeu(tj)}
          >
            <Text style={styles.boutonCouleurTexte}>{tj.nom}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Saisie Boule / Mise : toujours visible, meme sans aucun type de jeu selectionne.
          Le 2e champ n'apparait que pour une combinaison saisie a la main (pas pour MA Auto). */}
      <View style={styles.zoneSaisie}>
        <View style={styles.champSaisie}>
          <TextInput
            style={styles.champInput}
            keyboardType="number-pad"
            maxLength={7}
            value={numero}
            onChangeText={(texte) => setNumero(nettoyerNumero(texte))}
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

      <TouchableOpacity style={styles.boutonEntrer} onPress={ajouterLigne} activeOpacity={0.85}>
        <Text style={styles.boutonEntrerTexte}>Entrer</Text>
      </TouchableOpacity>

      <Modal visible={modalPaireVisible} transparent animationType="fade" onRequestClose={fermerModalAuto}>
        <View style={styles.fondModal}>
          <View style={styles.carteModal}>
            <Text style={styles.titreModal}>{titreModalAuto()}</Text>
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
                  keyboardType="number-pad"
                  maxLength={ligneEnEdition?.typeJeu.nombre_chiffres}
                  value={numeroEditionLigne}
                  onChangeText={(texte) => setNumeroEditionLigne(nettoyerNumero(texte))}
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
    paddingTop: 50,
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
  badgeIconeZone: {
    borderRadius: 11,
    width: 22,
    height: 22,
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
  ligneJoueeNumero: {
    flex: 1,
    fontWeight: '700',
  },
  ligneJoueeMontant: {
    fontWeight: '600',
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
  titreRecu: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
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
