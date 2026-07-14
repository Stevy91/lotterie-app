import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurDate from '../composants/SelecteurDate';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { imprimerTransactionsSunmi } from '../sunmiPrint';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

interface TransactionCompte {
  id: number;
  ref_code: string;
  type: string;
  montant: number;
  created_at: string;
}

interface DonneesCompte {
  balance: number;
  total_recharge: number;
  total_retrait: number;
  transactions: TransactionCompte[];
}

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const MOIS_ABREGES = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];

function formaterDate(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')} ${MOIS_ABREGES[date.getMonth()]} ${date.getFullYear()}`;
}

export default function EcranCompte({ utilisateur, onRetour }: Props) {
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [chargement, setChargement] = useState(true);
  const [donnees, setDonnees] = useState<DonneesCompte | null>(null);

  useEffect(() => {
    rechercher();
  }, []);

  async function rechercher() {
    try {
      setChargement(true);
      const params = new URLSearchParams({
        date_debut: versDateApi(dateDebut),
        date_fin: versDateApi(dateFin),
      });
      const reponse = await appelApi(`/moi/transactions?${params.toString()}`);
      const data: DonneesCompte = await reponse.json();
      setDonnees(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger les transactions.');
    } finally {
      setChargement(false);
    }
  }

  async function imprimer() {
    if (!donnees) {
      alerteSimple('Aucun resultat', "Lance d'abord une recherche avant d'imprimer.");
      return;
    }

    try {
      const config = await obtenirConfiguration();
      await imprimerTransactionsSunmi(
        {
          balance: donnees.balance,
          totalRecharge: donnees.total_recharge,
          totalRetrait: donnees.total_retrait,
        },
        donnees.transactions.map((t) => ({
          ref_code: t.ref_code,
          type: t.type,
          montant: Math.abs(t.montant),
          dateAffichee: formaterDate(t.created_at),
        })),
        {
          nomCompagnie: config.app_name ?? 'Lotterie',
          adresse: config.adresse,
          posId: String(utilisateur.id),
          vendeurNom: utilisateur.name,
          logoUrl: config.logo_url ?? utilisateur.logo_url ?? undefined,
        }
      );
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante Sunmi n'est pas disponible sur cet appareil.");
    }
  }

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Transactions</Text>
        <TouchableOpacity onPress={imprimer} style={{ width: 22 }}>
          <Ionicons name="print-outline" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.carteBalance}>
          <Text style={styles.labelSolde}>Votre solde</Text>
          <Text style={styles.valeurSolde}>{(donnees?.balance ?? 0).toFixed(0)} HTG</Text>
          <Text style={styles.sousTotal}>Total Recharge : {(donnees?.total_recharge ?? 0).toFixed(0)} HTG</Text>
          <Text style={styles.sousTotal}>Total Retrait : {(donnees?.total_retrait ?? 0).toFixed(0)} HTG</Text>
        </View>

        <View style={styles.filtres}>
          <SelecteurDate date={dateDebut} onChangerDate={setDateDebut} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
          <SelecteurDate date={dateFin} onChangerDate={setDateFin} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
        </View>

        <TouchableOpacity style={styles.boutonRecherche} onPress={rechercher}>
          <Text style={styles.boutonRechercheTexte}>Rechercher</Text>
        </TouchableOpacity>

        <View style={styles.ligneEnteteTableau}>
          <Text style={[styles.celluleEntete, { flex: 1.3 }]}>Ref Code</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Type</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Montant</Text>
          <Text style={[styles.celluleEntete, { flex: 1 }]}>Date</Text>
        </View>

        {chargement ? (
          <ActivityIndicator size="large" style={{ marginTop: 30 }} />
        ) : !donnees || donnees.transactions.length === 0 ? (
          <Text style={styles.vide}>Aucune transaction.</Text>
        ) : (
          donnees.transactions.map((transaction) => (
            <View key={transaction.id} style={styles.ligneTableau}>
              <Text style={[styles.celluleTicket, { flex: 1.3 }]}>{transaction.ref_code}</Text>
              <Text style={[styles.cellule, { flex: 1, color: transaction.type === 'Recharge' ? '#16a34a' : '#dc2626' }]}>
                {transaction.type}
              </Text>
              <Text style={[styles.cellule, { flex: 1 }]}>{Math.abs(transaction.montant).toFixed(0)}</Text>
              <Text style={[styles.cellule, { flex: 1 }]}>{formaterDate(transaction.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
  carteBalance: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    paddingVertical: 20,
    alignItems: 'center',
    gap: 4,
  },
  labelSolde: {
    color: '#666',
    fontSize: 13,
  },
  valeurSolde: {
    color: '#2563eb',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  sousTotal: {
    color: '#666',
    fontSize: 12,
  },
  filtres: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  champFiltre: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libelleFiltre: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    paddingVertical: 8,
  },
  boutonRecherche: {
    backgroundColor: '#e67e22',
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  boutonRechercheTexte: {
    color: '#fff',
    fontWeight: '700',
  },
  ligneEnteteTableau: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
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
  celluleTicket: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 12,
  },
  cellule: {
    color: '#555',
    fontSize: 12,
  },
  vide: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
  },
});
