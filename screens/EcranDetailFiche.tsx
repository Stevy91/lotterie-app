import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alerteConfirmation, alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { abregerTypeJeu, imprimerFichesSunmi } from '../sunmiPrint';
import { Tirage, TicketResponse } from '../types';

interface Props {
  ticketId: number;
  utilisateur: Utilisateur;
  onRetour: () => void;
}

export default function EcranDetailFiche({ ticketId, utilisateur, onRetour }: Props) {
  const [ticket, setTicket] = useState<TicketResponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [dureeSuppressionMinutes, setDureeSuppressionMinutes] = useState(10);

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
      alerteSimple('Erreur', 'Impossible de charger la fiche.');
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
      alerteSimple('Erreur', e.message ?? 'Impossible de payer cette fiche.');
    } finally {
      setEnCours(false);
    }
  }

  function confirmerRejeu() {
    if (!ticket) return;
    alerteConfirmation(
      'Rejouer cette fiche',
      `Rejouer les memes boules pour ${Number(ticket.montant_total).toFixed(2)} HTG sur les tirages ouverts aujourd'hui ?`,
      rejouer,
      'Oui'
    );
  }

  async function rejouer() {
    if (!ticket) return;
    try {
      setEnCours(true);
      const reponse = await appelApi('/tirages/du-jour');
      const tiragesDuJour: Tirage[] = await reponse.json();
      const tiragesParLoterie = new Map(tiragesDuJour.map((t) => [t.loterie.nom, t]));

      const zonesFermees = Array.from(
        new Set(
          ticket.mises
            .filter((m) => !tiragesParLoterie.has(m.tirage.loterie.nom))
            .map((m) => m.tirage.loterie.nom)
        )
      );

      if (zonesFermees.length > 0) {
        alerteSimple('Zone fermee', `Impossible de rejouer : ${zonesFermees.join(', ')} n'est plus ouvert aujourd'hui.`);
        return;
      }

      const mises = ticket.mises.map((m) => ({
        tirage_id: tiragesParLoterie.get(m.tirage.loterie.nom)!.id,
        type_jeu_id: m.type_jeu.id,
        numero: m.numero,
        numero_2: m.numero_2,
        montant: Number(m.montant),
      }));

      const reponseCreation = await appelApi('/tickets', {
        method: 'POST',
        body: JSON.stringify({ mises }),
      });

      if (!reponseCreation.ok) {
        const erreur = await reponseCreation.json();
        throw new Error(erreur.message);
      }

      const nouveauTicket: TicketResponse = await reponseCreation.json();
      alerteSimple('Fiche rejouee', `Nouvelle fiche creee : ${nouveauTicket.numero_ticket}`);
    } catch (e: any) {
      alerteSimple('Erreur', e.message ?? 'Impossible de rejouer cette fiche.');
    } finally {
      setEnCours(false);
    }
  }

  async function imprimer() {
    if (!ticket) return;

    try {
      const config = await obtenirConfiguration();
      const parent = ticket.agent?.parent?.name;
      const vendeurNom = parent ? `${parent} ${ticket.agent?.name}` : (ticket.agent?.name ?? '');

      await imprimerFichesSunmi([ticket], {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresseAgent: ticket.agent?.adresse,
        adresseProprietaire: ticket.agent?.proprietaire_adresse,
        posId: String(ticket.agent?.id ?? ''),
        vendeurNom,
        logoUrl: utilisateur.logo_url ?? config.logo_url,
        texteFiche: config.text_fiche,
      });
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante Sunmi n'est pas disponible sur cet appareil.");
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
      alerteSimple('Erreur', e.message ?? 'Impossible de supprimer cette fiche.');
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
  const peutSupprimer = ticket.statut === 'en_attente' && minutesEcoulees <= dureeSuppressionMinutes;

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>{ticket.numero_ticket}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
              <Text style={[styles.cellule, { flex: 0.9 }]}>{abregerTypeJeu(mise.type_jeu.nom)}</Text>
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

        <View style={styles.boutons}>
          {gagne && !ticket.paye && (
            <TouchableOpacity style={[styles.bouton, { backgroundColor: '#16a34a' }]} onPress={confirmerPaiement} disabled={enCours}>
              <Text style={styles.boutonTexte}>Payer</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.bouton, { backgroundColor: '#2563eb' }]} onPress={confirmerRejeu} disabled={enCours}>
            <Text style={styles.boutonTexte}>Rejouer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bouton, { backgroundColor: '#e67e22' }]} onPress={imprimer}>
            <Text style={styles.boutonTexte}>Print fiche</Text>
          </TouchableOpacity>
          {peutSupprimer && (
            <TouchableOpacity style={[styles.bouton, { backgroundColor: '#dc2626' }]} onPress={confirmerSuppression} disabled={enCours}>
              <Text style={styles.boutonTexte}>Supprimer</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
