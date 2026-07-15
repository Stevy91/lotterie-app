import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurDate from '../composants/SelecteurDate';
import EcranDetailFiche from './EcranDetailFiche';
import { alerteConfirmation, alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { imprimerFichesSunmi } from '../sunmiPrint';
import { TicketResponse } from '../types';

interface Props {
  titre: string;
  filtre: 'toutes' | 'gagnantes' | 'annulees';
  utilisateur: Utilisateur;
  onRetour: () => void;
}

const LIBELLES_FILTRE: Record<'toutes' | 'gagnantes' | 'annulees', string> = {
  toutes: 'Tout',
  gagnantes: 'Gagnantes',
  annulees: 'Annulees',
};

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const MOIS_ABREGES = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];

function formaterDateHeure(iso: string): string {
  const date = new Date(iso);
  const jour = String(date.getDate()).padStart(2, '0');
  const mois = MOIS_ABREGES[date.getMonth()];
  let heures = date.getHours();
  const suffixe = heures >= 12 ? 'pm' : 'am';
  heures = heures % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${jour} ${mois} ${String(heures).padStart(2, '0')}:${minutes} ${suffixe}`;
}

export default function EcranListeFiches({ filtre: filtreInitial, utilisateur, onRetour }: Props) {
  const [tickets, setTickets] = useState<TicketResponse[]>([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState(filtreInitial);
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [rechercheTexte, setRechercheTexte] = useState('');
  const [ticketSelectionne, setTicketSelectionne] = useState<number | null>(null);

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    try {
      setChargement(true);
      const params = new URLSearchParams({
        filtre,
        date_debut: versDateApi(dateDebut),
        date_fin: versDateApi(dateFin),
      });
      const reponse = await appelApi(`/tickets?${params.toString()}`);
      const data: TicketResponse[] = await reponse.json();
      setTickets(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger les fiches.');
    } finally {
      setChargement(false);
    }
  }

  function cyclerFiltre() {
    setFiltre((prev) => (prev === 'toutes' ? 'gagnantes' : prev === 'gagnantes' ? 'annulees' : 'toutes'));
  }

  function confirmerAnnulation(ticket: TicketResponse) {
    alerteConfirmation('Annuler la fiche', `Supprimer la fiche ${ticket.numero_ticket} ?`, () => annuler(ticket), 'Oui');
  }

  async function annuler(ticket: TicketResponse) {
    try {
      const reponse = await appelApi(`/tickets/${ticket.id}/annuler`, { method: 'POST' });
      if (!reponse.ok) {
        const erreur = await reponse.json();
        throw new Error(erreur.message);
      }
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    } catch (e: any) {
      alerteSimple('Erreur', e.message ?? "Impossible d'annuler cette fiche.");
    }
  }

  const ticketsFiltres = tickets.filter((t) =>
    t.numero_ticket.toLowerCase().includes(rechercheTexte.toLowerCase())
  );

  async function imprimerListe() {
    if (ticketsFiltres.length === 0) {
      alerteSimple('Aucune fiche', "Il n'y a aucune fiche a imprimer pour ces filtres.");
      return;
    }

    try {
      const config = await obtenirConfiguration();
      const parent = ticketsFiltres[0].agent?.parent?.name;
      const soi = ticketsFiltres[0].agent?.name ?? utilisateur.name;

      await imprimerFichesSunmi(ticketsFiltres, {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresseAgent: ticketsFiltres[0].agent?.adresse,
        adresseProprietaire: ticketsFiltres[0].agent?.proprietaire_adresse,
        posId: String(utilisateur.id),
        vendeurNom: parent ? `${parent} ${soi}` : soi,
        logoUrl: utilisateur.logo_url ?? config.logo_url ?? undefined,
        texteFiche: config.text_fiche,
      });
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante Sunmi n'est pas disponible sur cet appareil.");
    }
  }

  if (ticketSelectionne !== null) {
    return (
      <EcranDetailFiche
        ticketId={ticketSelectionne}
        utilisateur={utilisateur}
        onRetour={() => {
          setTicketSelectionne(null);
          charger();
        }}
      />
    );
  }

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>{filtre === 'gagnantes' ? 'Fiches Gagnants' : 'Fiches'}</Text>
        <TouchableOpacity onPress={imprimerListe} style={{ width: 22 }}>
          <Ionicons name="print-outline" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtres}>
        <SelecteurDate date={dateDebut} onChangerDate={setDateDebut} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
        <SelecteurDate date={dateFin} onChangerDate={setDateFin} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
        <TouchableOpacity style={styles.champFiltre} onPress={cyclerFiltre}>
          <Text style={styles.libelleFiltre}>{LIBELLES_FILTRE[filtre]}</Text>
        </TouchableOpacity>
        <View style={styles.champFiltre}>
          <Text style={styles.libelleFiltre}>{ticketsFiltres.length}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.boutonRecherche} onPress={charger}>
        <Text style={styles.boutonRechercheTexte}>Rechercher</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.rechercheTexte}
        placeholder="Rechercher un fiche"
        placeholderTextColor="#999"
        value={rechercheTexte}
        onChangeText={setRechercheTexte}
      />

      <View style={styles.ligneEnteteTableau}>
        <Text style={[styles.celluleEntete, { flex: 1.3 }]}>Ticket</Text>
        <Text style={[styles.celluleEntete, { flex: 1 }]}>Montant</Text>
        {filtre === 'gagnantes' ? (
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Gain</Text>
        ) : (
          <>
            <Text style={[styles.celluleEntete, { flex: 1 }]}>Gagne</Text>
            <Text style={[styles.celluleEntete, { flex: 1.2 }]}>Paye</Text>
          </>
        )}
        <Text style={[styles.celluleEntete, { flex: 1 }]}>Date</Text>
      </View>

      {chargement ? (
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {ticketsFiltres.length === 0 ? (
            <Text style={styles.vide}>aucun resultat..!</Text>
          ) : (
            ticketsFiltres.map((item) => {
              const estGagnant = ['gagnant', 'partiellement_gagnant'].includes(item.statut) && Number(item.gain_total) > 0;
              return (
                <View key={item.id} style={styles.ligne}>
                  <TouchableOpacity
                    style={{ flex: 1.3 }}
                    onPress={() => setTicketSelectionne(item.id)}
                    onLongPress={() => item.statut === 'en_attente' && confirmerAnnulation(item)}
                  >
                    <Text style={styles.celluleTicket}>{item.numero_ticket}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.cellule, { flex: 1 }]}>{Number(item.montant_total).toFixed(2)}</Text>
                  {filtre === 'gagnantes' ? (
                    <Text style={[styles.cellule, { flex: 1 }]}>{Number(item.gain_total).toFixed(2)}</Text>
                  ) : (
                    <>
                      <Text style={[styles.celluleBooleenne, { flex: 1, color: estGagnant ? '#16a34a' : '#dc2626' }]}>
                        {estGagnant ? 'Oui' : 'Non'}
                      </Text>
                      <Text style={[styles.celluleBooleenne, { flex: 1.2, color: item.paye ? '#16a34a' : '#dc2626' }]}>
                        {item.paye ? 'Oui' : 'Non'}
                      </Text>
                    </>
                  )}
                  <Text style={[styles.cellule, { flex: 1 }]}>{formaterDateHeure(item.created_at)}</Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  filtres: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  champFiltre: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  libelleFiltre: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  boutonRecherche: {
    backgroundColor: '#e67e22',
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  boutonRechercheTexte: {
    color: '#fff',
    fontWeight: '700',
  },
  rechercheTexte: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ligneEnteteTableau: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  celluleEntete: {
    fontWeight: '700',
    color: '#333',
  },
  vide: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  celluleTicket: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 12,
  },
  cellule: {
    color: '#555',
    fontSize: 12,
  },
  celluleBooleenne: {
    fontWeight: '700',
    fontSize: 12,
  },
});
