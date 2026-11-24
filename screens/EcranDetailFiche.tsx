import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActionsUniques } from '../actionUnique';
import { alerteConfirmation, alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { obtenirNumeroSeriePosStocke, Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { abregerMise, imprimerFichesSunmi } from '../sunmiPrint';
import { Tirage, TicketResponse } from '../types';

interface Props {
  ticketId: number;
  utilisateur: Utilisateur;
  onRetour: () => void;
}

export default function EcranDetailFiche({ ticketId, utilisateur, onRetour }: Props) {
  // Marge basse : evite que le dernier bouton passe sous la barre de navigation.
  const insets = useSafeAreaInsets();
  const [ticket, setTicket] = useState<TicketResponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [dureeSuppressionMinutes, setDureeSuppressionMinutes] = useState(10);

  // Verrou anti double-appui (voir actionUnique.ts). Il complete le drapeau
  // enCours ci-dessus, qui ne couvrait ni l'impression ni le bouton Rejouer de
  // la fenetre de confirmation, et qui n'affichait rien a l'ecran.
  const { enCours: actionEnCours, lancer } = useActionsUniques();
  const occupe = enCours || !!actionEnCours;

  // Rejeu : le client peut vouloir rejouer les memes boules sur d'AUTRES zones,
  // on lui propose donc la liste des zones encore ouvertes aujourd'hui.
  const [modalRejeu, setModalRejeu] = useState(false);
  const [tiragesOuverts, setTiragesOuverts] = useState<Tirage[]>([]);
  const [zonesChoisies, setZonesChoisies] = useState<number[]>([]);

  useEffect(() => {
    charger();
    appelApi('/configuration')
      .then((reponse) => reponse.json())
      .then((config) => {
        const valeur = parseInt(config.duree_suppression_fiche, 10);
        if (valeur) setDureeSuppressionMinutes(valeur);
      })
      .catch(() => {});
  }, [ticketId]);

  async function charger() {
    try {
      setChargement(true);
      const reponse = await appelApi(`/tickets/${ticketId}`);
      const data: TicketResponse = await reponse.json();
      setTicket(data);
    } catch (e) {
      alerteSimple('Attention', 'Impossible de charger la fiche.');
    } finally {
      setChargement(false);
    }
  }

  function confirmerPaiement() {
    if (!ticket) return;
    alerteConfirmation(
      'Payer le gain',
      `Confirmer le paiement de ${Number(ticket.gain_total).toFixed(2)} HTG au client ?`,
      payer,
      'Oui'
    );
  }

  async function payer() {
    if (!ticket) return;
    try {
      setEnCours(true);
      const reponse = await appelApi(`/tickets/${ticket.id}/payer`, { method: 'POST' });
      if (!reponse.ok) {
        const erreur = await reponse.json();
        throw new Error(erreur.message);
      }
      const miseAJour: TicketResponse = await reponse.json();
      setTicket(miseAJour);
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? 'Impossible de payer cette fiche.');
    } finally {
      setEnCours(false);
    }
  }

  /**
   * Les boules a rejouer : on retire les mariages gratuits (generes par le
   * serveur, ils ne se rejouent pas) et on dedoublonne, car la meme boule peut
   * apparaitre sur plusieurs zones de la fiche d'origine.
   */
  function modeleDeMises() {
    if (!ticket) return [];

    const vues = new Set<string>();

    return ticket.mises
      .filter((m) => !m.mariage_bonus)
      .filter((m) => {
        // L'option fait partie de l'identite de la mise : « Lo4 1234 (1) » et
        // « Lo4 1234 (2) » sont deux paris differents, au meme montant. Sans
        // elle dans la cle, le dedoublonnage en supprimait un.
        const cle = [
          m.type_jeu.id,
          m.numero,
          m.numero_2 ?? '',
          m.option_combinaison ?? '',
          m.montant,
        ].join('|');
        if (vues.has(cle)) return false;
        vues.add(cle);
        return true;
      })
      .map((m) => ({
        type_jeu_id: m.type_jeu.id,
        numero: m.numero,
        numero_2: m.numero_2,
        // Oubliee ici, l'option disparaissait de la fiche rejouee : l'original
        // imprimait « Lo4 1234(1) », le rejeu « Lo4 1234 ». Le client payait
        // le meme prix pour un autre pari.
        option_combinaison: m.option_combinaison,
        montant: Number(m.montant),
      }));
  }

  /** Ouvre le selecteur de zones, en pre-cochant celles de la fiche d'origine. */
  async function confirmerRejeu() {
    if (!ticket) return;
    try {
      setEnCours(true);
      const reponse = await appelApi('/tirages/du-jour');
      const tiragesDuJour: Tirage[] = await reponse.json();

      if (tiragesDuJour.length === 0) {
        alerteSimple('Aucune zone ouverte', "Aucun tirage n'est ouvert aujourd'hui.");
        return;
      }

      const nomsOrigine = new Set(ticket.mises.map((m) => m.tirage.loterie.nom));
      const preCochees = tiragesDuJour.filter((t) => nomsOrigine.has(t.loterie.nom)).map((t) => t.id);

      setTiragesOuverts(tiragesDuJour);
      setZonesChoisies(preCochees);
      setModalRejeu(true);
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? 'Impossible de charger les zones.');
    } finally {
      setEnCours(false);
    }
  }

  function basculerZone(id: number) {
    setZonesChoisies((actuel) =>
      actuel.includes(id) ? actuel.filter((z) => z !== id) : [...actuel, id]
    );
  }

  async function rejouer() {
    if (!ticket || zonesChoisies.length === 0) return;

    try {
      setEnCours(true);
      setModalRejeu(false);

      // UNE FICHE PAR ZONE, comme a la vente (voir EcranCreerFiche). Tout le
      // reste du systeme compte une fiche pour une zone : l'impression, les
      // rapports, l'exposition au risque. Un envoi unique portant les trois
      // zones creait UNE seule fiche, rattachee a la premiere, et les deux
      // autres zones disparaissaient alors que la fenetre les avait facturees.
      const modele = modeleDeMises();
      const crees: TicketResponse[] = [];

      for (const tirageId of zonesChoisies) {
        const reponse = await appelApi('/tickets', {
          method: 'POST',
          body: JSON.stringify({
            mises: modele.map((m) => ({ ...m, tirage_id: tirageId })),
          }),
        });

        if (!reponse.ok) {
          const erreur = await reponse.json();
          // Une zone refusee (plafond atteint, zone fermee) annule celles deja
          // parties : sinon le vendeur paie des fiches qu'il n'a pas voulues,
          // pour un rejeu qu'il croit avoir echoue.
          await Promise.all(
            crees.map((t) => appelApi(`/tickets/${t.id}/annuler`, { method: 'POST' }).catch(() => {}))
          );
          throw new Error(erreur.message ?? 'Erreur inconnue');
        }

        crees.push(await reponse.json());
      }

      // Imprimer tout de suite : le client attend sa fiche au comptoir, et
      // sans cette proposition il fallait sortir de l'ecran, retrouver la
      // nouvelle fiche dans la liste, l'ouvrir, puis l'imprimer -- une par
      // zone. On imprime les fiches REJOUEES, pas celle d'origine.
      const numeros = crees.map((t) => t.numero_ticket).join(', ');
      alerteConfirmation(
        crees.length > 1 ? `${crees.length} fiches rejouees` : 'Fiche rejouee',
        `Nouvelle(s) fiche(s) : ${numeros}\n\nImprimer maintenant ?`,
        () => {
          void imprimerFiches(crees);
        },
        crees.length > 1 ? 'Imprimer les fiches' : 'Imprimer',
        'Plus tard'
      );
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? 'Impossible de rejouer cette fiche.');
    } finally {
      setEnCours(false);
    }
  }

  /**
   * Imprime une ou plusieurs fiches. Prend une liste plutot que la fiche
   * affichee, pour servir aussi le rejeu : celui-ci cree une fiche par zone,
   * et c'est celles-la qu'il faut sortir, pas celle qu'on regarde.
   */
  async function imprimerFiches(fiches: TicketResponse[]) {
    if (fiches.length === 0) return;

    // L'entete (vendeur, adresses) est la meme pour toutes : un rejeu part
    // toujours du meme vendeur, sur le meme terminal.
    const premiere = fiches[0];

    try {
      const config = await obtenirConfiguration();
      const parent = premiere.agent?.parent?.name;
      const vendeurNom = parent ? `${parent} ${premiere.agent?.name}` : (premiere.agent?.name ?? '');
      // Le numero de serie de CET appareil (celui qui reimprime maintenant),
      // pas celui du createur d'origine de la fiche.
      const numeroSeriePos = (await obtenirNumeroSeriePosStocke()) ?? String(premiere.agent?.id ?? '');

      await imprimerFichesSunmi(fiches, {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresseAgent: premiere.agent?.adresse,
        adresseProprietaire: premiere.agent?.proprietaire_adresse,
        telephoneAgent: utilisateur.telephone,
        telephoneProprietaire: utilisateur.proprietaire_telephone,
        posId: numeroSeriePos,
        vendeurNom,
        logoUrl: utilisateur.logo_url ?? config.logo_url,
        texteFiche: config.text_fiche,
        afficherQr: config.qr_fiche !== 'Non',
      });
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante du terminal n'est pas disponible.");
    }
  }

  function confirmerSuppression() {
    if (!ticket) return;
    alerteConfirmation('Supprimer la fiche', `Supprimer la fiche ${ticket.numero_ticket} ?`, supprimer, 'Oui');
  }

  async function supprimer() {
    if (!ticket) return;
    try {
      setEnCours(true);
      const reponse = await appelApi(`/tickets/${ticket.id}/annuler`, { method: 'POST' });
      if (!reponse.ok) {
        const erreur = await reponse.json();
        throw new Error(erreur.message);
      }
      onRetour();
    } catch (e: any) {
      alerteSimple('Attention', e.message ?? 'Impossible de supprimer cette fiche.');
    } finally {
      setEnCours(false);
    }
  }

  if (chargement || !ticket) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const gagne = ticket.statut === 'gagnant' || ticket.statut === 'partiellement_gagnant';
  const loterieNom = ticket.mises[0]?.tirage.loterie.nom ?? '-';
  const minutesEcoulees = (Date.now() - new Date(ticket.created_at).getTime()) / 60000;
  // Le delai ne borne que le vendeur. Un proprietaire ou un superviseur peut
  // encore supprimer apres coup : c'est a eux que le point de vente s'adresse
  // quand le delai est passe. Le serveur applique la meme regle.
  const estResponsable = utilisateur.role === 'proprietaire' || utilisateur.role === 'agent';
  const peutSupprimer =
    ticket.statut === 'en_attente' && (estResponsable || minutesEcoulees <= dureeSuppressionMinutes);

  // Total du rejeu : les memes boules sont jouees sur chaque zone cochee.
  const totalRejeu = modeleDeMises().reduce((s, m) => s + m.montant, 0) * zonesChoisies.length;

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>{ticket.numero_ticket}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}>
        <View style={styles.infos}>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Ref code:</Text>
            <Text style={styles.valeurInfo}>{ticket.numero_ticket}</Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Tirage:</Text>
            <Text style={styles.valeurInfo}>{loterieNom}</Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Mise:</Text>
            <Text style={styles.valeurInfo}>{Number(ticket.montant_total).toFixed(2)}HTG</Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Gain:</Text>
            <Text style={styles.valeurInfo}>{Number(ticket.gain_total).toFixed(2)}HTG</Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Gagne:</Text>
            <Text style={[styles.valeurBadge, { color: gagne ? '#16a34a' : '#dc2626' }]}>{gagne ? 'Oui' : 'Non'}</Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Paye:</Text>
            <Text style={[styles.valeurBadge, { color: ticket.paye ? '#16a34a' : '#dc2626' }]}>
              {ticket.paye ? 'Oui' : 'Non'}
            </Text>
          </View>
          <View style={styles.ligneInfo}>
            <Text style={styles.labelInfo}>Date et heure:</Text>
            <Text style={styles.valeurInfo}>{new Date(ticket.created_at).toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.ligneEnteteTableau}>
          <Text style={[styles.celluleEntete, { flex: 0.9 }]}>Lotto</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Boule</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Montant</Text>
          <Text style={[styles.celluleEntete, { flex: 0.8 }]}>Gagne</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Gain</Text>
        </View>

        {ticket.mises.map((mise) => {
          const misesGagnee = mise.statut === 'gagnant';
          return (
            <View key={mise.id} style={styles.ligneTableau}>
              <Text style={[styles.cellule, { flex: 0.9 }]}>{abregerMise(mise)}</Text>
              <View style={{ flex: 1 }}>
                {mise.option_combinaison && (
                  <View style={styles.badgeOption}>
                    <Text style={styles.badgeOptionTexte}>{mise.option_combinaison}</Text>
                  </View>
                )}
                <View style={styles.badgeBoule}>
                  <Text style={styles.badgeBouleTexte}>
                    {mise.numero_2 ? `${mise.numero}x${mise.numero_2}` : mise.numero}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cellule, { flex: 1 }]}>{Number(mise.montant).toFixed(2)} HTG</Text>
              <Text style={[styles.cellule, { flex: 0.8, color: misesGagnee ? '#16a34a' : '#dc2626' }]}>
                {misesGagnee ? 'Oui' : 'Non'}
              </Text>
              <Text style={[styles.cellule, { flex: 1 }]}>{Number(mise.gain_reel).toFixed(2)} HTG</Text>
            </View>
          );
        })}

        {/* Actions, dans le meme style de carte que la page Parametre. */}
        <View style={styles.boutons}>
          {([
            ...(gagne && !ticket.paye ? [['Payer', 'cash', '#16a34a', confirmerPaiement] as const] : []),
            ['Rejouer', 'refresh', '#2563eb', confirmerRejeu] as const,
            ['Print fiche', 'print', '#e67e22', () => imprimerFiches([ticket])] as const,
            ...(peutSupprimer ? [['Supprimer', 'trash', '#dc2626', confirmerSuppression] as const] : []),
          ]).map(([libelle, icone, couleur, action]) => (
            <TouchableOpacity
              key={libelle}
              style={[styles.carteAction, { backgroundColor: couleur }, occupe ? styles.carteActionInactive : null]}
              onPress={lancer(libelle, action)}
              disabled={occupe}
              activeOpacity={0.85}
            >
              <View style={styles.carteActionIcone}>
                {actionEnCours === libelle
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={icone as any} size={20} color="#fff" />}
              </View>
              <Text style={styles.carteActionTexte}>{libelle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Selecteur de zones pour le rejeu : le client peut rejouer les memes
          boules sur d'autres zones que celles de la fiche d'origine. */}
      <Modal visible={modalRejeu} transparent animationType="fade" onRequestClose={() => setModalRejeu(false)}>
        <View style={styles.fondModal}>
          <View style={styles.boiteModal}>
            <Text style={styles.titreModal}>Rejouer cette fiche</Text>
            <Text style={styles.sousTitreModal}>
              Selectionne une ou plusieurs zones ou rejouer les memes boules.
            </Text>

            {/* Zones en puces sur la meme ligne (retour a la ligne automatique). */}
            <ScrollView style={styles.listeZones}>
              <View style={styles.grilleZones}>
                {tiragesOuverts.map((t) => {
                  const choisi = zonesChoisies.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.puceZone, choisi && styles.puceZoneChoisie]}
                      onPress={() => basculerZone(t.id)}
                    >
                      <Text style={[styles.puceZoneTexte, choisi && styles.puceZoneTexteChoisi]}>
                        {t.loterie.nom}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={styles.resumeModal}>
              {modeleDeMises().length} boule(s) &times; {zonesChoisies.length} zone(s) ={' '}
              <Text style={styles.resumeTotal}>{totalRejeu.toFixed(2)} HTG</Text>
            </Text>

            <View style={styles.actionsModal}>
              <TouchableOpacity style={styles.boutonAnnuler} onPress={() => setModalRejeu(false)}>
                <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
              </TouchableOpacity>
              {/* Ce bouton engage de l'argent : il n'etait protege que contre
                  une liste de zones vide, pas contre un second appui. Sur un
                  reseau lent, le vendeur reappuyait et la mise partait deux
                  fois. */}
              <TouchableOpacity
                style={[styles.boutonValider, (occupe || zonesChoisies.length === 0) && styles.boutonDesactive]}
                onPress={lancer('rejouer', rejouer)}
                disabled={occupe || zonesChoisies.length === 0}
              >
                {actionEnCours === 'rejouer'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.boutonTexte}>Rejouer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cartes d'action : meme langage visuel que les boutons de Parametre.
  // Verrou anti double-appui : le bouton doit se voir eteint, sinon le vendeur
  // croit que son appui n'a pas ete pris et insiste.
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
  fondModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  boiteModal: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  titreModal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  sousTitreModal: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  listeZones: {
    marginTop: 14,
  },
  grilleZones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  puceZone: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  puceZoneChoisie: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  puceZoneTexte: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  puceZoneTexteChoisi: {
    color: '#fff',
  },
  resumeModal: {
    marginTop: 14,
    fontSize: 13,
    color: '#64748b',
  },
  resumeTotal: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  actionsModal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  boutonAnnuler: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  boutonAnnulerTexte: {
    color: '#64748b',
    fontWeight: 'bold',
  },
  boutonValider: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  boutonDesactive: {
    opacity: 0.4,
  },
  conteneur: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  iconeRetour: {
    width: 22,
  },
  titre: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  infos: {
    marginBottom: 16,
  },
  ligneInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  labelInfo: {
    color: '#333',
    fontWeight: '600',
  },
  valeurInfo: {
    color: '#333',
  },
  valeurBadge: {
    fontWeight: '700',
  },
  ligneEnteteTableau: {
    flexDirection: 'row',
    paddingTop: 16,
    paddingBottom: 8,
  },
  celluleEntete: {
    fontWeight: '700',
    color: '#333',
    fontSize: 12,
  },
  ligneTableau: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cellule: {
    color: '#555',
    fontSize: 12,
  },
  badgeOption: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  badgeOptionTexte: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeBoule: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  badgeBouleTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  boutons: {
    gap: 10,
    marginTop: 20,
  },
  bouton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  boutonTexte: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
