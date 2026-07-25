import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurDate from '../composants/SelecteurDate';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

interface DonneesCommission {
  taux: number;
  ventes: number;
  commission: number;
}

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function EcranCommission({ utilisateur, onRetour }: Props) {
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [chargement, setChargement] = useState(true);
  const [donnees, setDonnees] = useState<DonneesCommission | null>(null);

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
      const reponse = await appelApi(`/moi/commission?${params.toString()}`);
      const data: DonneesCommission = await reponse.json();
      setDonnees(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger la commission.');
    } finally {
      setChargement(false);
    }
  }

  const taux = donnees?.taux ?? 0;
  const ventes = donnees?.ventes ?? 0;
  const commission = donnees?.commission ?? 0;

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Ma commission</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.carte}>
          <Text style={styles.labelCarte}>Commission gagnee</Text>
          {chargement ? (
            <ActivityIndicator color="#fff" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={styles.valeurCarte}>{commission.toFixed(2)} HTG</Text>
          )}
          <View style={styles.sousLigne}>
            <Text style={styles.sousTexte}>Taux : {taux.toFixed(2)} %</Text>
            <Text style={styles.sousTexte}>Ventes : {ventes.toFixed(0)} HTG</Text>
          </View>
        </View>

        <Text style={styles.explication}>
          Ta commission = ton taux ({taux.toFixed(2)} %) applique a tes ventes de la periode choisie.
        </Text>

        <View style={styles.filtres}>
          <SelecteurDate date={dateDebut} onChangerDate={setDateDebut} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
          <SelecteurDate date={dateFin} onChangerDate={setDateFin} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
        </View>

        <TouchableOpacity style={styles.boutonRecherche} onPress={rechercher}>
          <Ionicons name="search" size={16} color="#fff" />
          <Text style={styles.boutonRechercheTexte}>Rechercher</Text>
        </TouchableOpacity>
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
  carte: {
    borderRadius: 16,
    backgroundColor: '#16a34a',
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  labelCarte: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  valeurCarte: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },
  sousLigne: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 4,
  },
  sousTexte: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  explication: {
    color: '#666',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
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
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonRechercheTexte: {
    color: '#fff',
    fontWeight: '700',
  },
});
