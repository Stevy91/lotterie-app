import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurDate from '../composants/SelecteurDate';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Tirage } from '../types';

interface Props {
  onRetour: () => void;
}

const COULEURS_BOULES = ['#2563eb', '#e67e22', '#2563eb'];
const COULEURS_BADGE = ['#7c3aed', '#16a34a', '#e67e22', '#2563eb', '#dc2626', '#0d9488'];

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Le nom de la loterie embarque le moment du tirage (ex: "Georgia Matin", "Florida Soir").
// On separe le nom de base (pour regrouper) du moment affiche.
function separerNomEtMoment(nom: string): { base: string; moment: string } {
  const mots = nom.trim().split(' ');
  const dernier = mots[mots.length - 1];
  if (['Matin', 'Midi', 'Soir'].includes(dernier)) {
    return { base: mots.slice(0, -1).join(' '), moment: dernier };
  }
  return { base: nom, moment: '' };
}

export default function EcranNumeroGagnant({ onRetour }: Props) {
  const [tirages, setTirages] = useState<Tirage[]>([]);
  const [chargement, setChargement] = useState(true);
  const [date, setDate] = useState(new Date());
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    charger();
  }, []);

  async function charger() {
    try {
      setChargement(true);
      const reponse = await appelApi(`/tirages/resultats?date=${versDateApi(date)}`);
      const data: Tirage[] = await reponse.json();
      setTirages(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger les numeros gagnants.');
    } finally {
      setChargement(false);
    }
  }

  const groupes = tirages.reduce<Record<string, Tirage[]>>((acc, tirage) => {
    const { base } = separerNomEtMoment(tirage.loterie.nom);
    if (!acc[base]) acc[base] = [];
    acc[base].push(tirage);
    return acc;
  }, {});

  const basesFiltrees = Object.keys(groupes).filter((base) =>
    base.toLowerCase().includes(recherche.toLowerCase())
  );

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Tirage</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.filtres}>
        <SelecteurDate date={date} onChangerDate={setDate} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
        <View style={styles.champFiltre}>
          <TextInput
            style={styles.champRecherche}
            placeholder="Tout"
            placeholderTextColor="#999"
            value={recherche}
            onChangeText={setRecherche}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.boutonRecherche} onPress={charger}>
        <Text style={styles.boutonRechercheTexte}>Rechercher</Text>
      </TouchableOpacity>

      {chargement ? (
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {basesFiltrees.length === 0 ? (
            <Text style={styles.vide}>Aucun resultat pour cette date.</Text>
          ) : (
            basesFiltrees.map((base, index) => (
              <View key={base} style={styles.carte}>
                <View style={[styles.badgeLoterie, { backgroundColor: COULEURS_BADGE[index % COULEURS_BADGE.length] }]}>
                  <Text style={styles.badgeLoterieTexte}>{base}</Text>
                </View>

                <View style={styles.zoneResultats}>
                  {groupes[base].map((tirage) => {
                    const { moment } = separerNomEtMoment(tirage.loterie.nom);
                    const numeros = [tirage.numero_1, tirage.numero_2, tirage.numero_3].filter(
                      (n): n is string => !!n
                    );
                    return (
                      <View key={tirage.id} style={styles.ligneResultat}>
                        <Text style={styles.momentTexte}>{moment}</Text>
                        <View style={styles.boules}>
                          {numeros.map((numero, i) => (
                            <View
                              key={i}
                              style={[styles.boule, { backgroundColor: COULEURS_BOULES[i % COULEURS_BOULES.length] }]}
                            >
                              <Text style={styles.bouleTexte}>{numero}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
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
  champRecherche: {
    width: '100%',
    textAlign: 'center',
    paddingVertical: 8,
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
  vide: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
  },
  carte: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 12,
  },
  badgeLoterie: {
    width: 80,
    height: 80,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  badgeLoterieTexte: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 12,
  },
  zoneResultats: {
    flex: 1,
    gap: 8,
  },
  ligneResultat: {
    gap: 4,
  },
  momentTexte: {
    fontWeight: '700',
    color: '#333',
  },
  boules: {
    flexDirection: 'row',
    gap: 6,
  },
  boule: {
    minWidth: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bouleTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});
