import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Loterie } from '../types';

interface Props {
  onRetour: () => void;
}

export default function EcranTirageDisponible({ onRetour }: Props) {
  const [loteries, setLoteries] = useState<Loterie[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    try {
      setChargement(true);
      const reponse = await appelApi('/loteries');
      const data: Loterie[] = await reponse.json();
      setLoteries(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger les tirages disponibles.');
    } finally {
      setChargement(false);
    }
  }

  const loteriesFiltrees = loteries.filter((l) => l.nom.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Tirage disponible</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.zoneRecherche}>
        <TextInput
          style={styles.recherche}
          placeholder="Rechercher"
          placeholderTextColor="rgba(255,255,255,0.85)"
          value={recherche}
          onChangeText={setRecherche}
        />
      </View>

      <View style={styles.ligneEntete}>
        <Text style={[styles.celluleEntete, { flex: 1.2 }]}>Tirage</Text>
        <Text style={[styles.celluleEntete, { flex: 1 }]}>Ouverture</Text>
        <Text style={[styles.celluleEntete, { flex: 1 }]}>Fermeture</Text>
      </View>

      {chargement ? (
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loteriesFiltrees.length === 0 ? (
            <Text style={styles.vide}>Aucun tirage trouve.</Text>
          ) : (
            loteriesFiltrees.map((l) => (
              <View key={l.id} style={styles.ligne}>
                <Text style={[styles.celluleTirage, { flex: 1.2 }]}>{l.nom}</Text>
                <Text style={[styles.cellule, { flex: 1 }]}>{l.heure_ouverture}</Text>
                <Text style={[styles.cellule, { flex: 1 }]}>{l.heure_fermeture}</Text>
              </View>
            ))
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
  zoneRecherche: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  recherche: {
    backgroundColor: '#e67e22',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
  ligneEntete: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  celluleEntete: {
    fontWeight: '700',
    color: '#333',
  },
  ligne: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  celluleTirage: {
    color: '#2563eb',
    fontWeight: '600',
  },
  cellule: {
    color: '#555',
  },
  vide: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
  },
});
