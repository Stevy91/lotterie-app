import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type Onglet = 'fiche' | 'rapport' | 'scanner' | 'parametre';

interface Props {
  onglet: Onglet;
  onChanger: (onglet: Onglet) => void;
}

const ONGLETS: { cle: Onglet; label: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { cle: 'fiche', label: 'Fiche', icone: 'document-text-outline' },
  { cle: 'rapport', label: 'Rapport', icone: 'stats-chart-outline' },
  { cle: 'scanner', label: 'Scanner', icone: 'camera-outline' },
  { cle: 'parametre', label: 'Parametre', icone: 'settings-outline' },
];

export default function BarreNavigation({ onglet, onChanger }: Props) {
  return (
    <View style={styles.barre}>
      {ONGLETS.map((o) => {
        const actif = o.cle === onglet;
        const couleur = actif ? '#6c5ce7' : '#999';
        return (
          <TouchableOpacity key={o.cle} style={styles.onglet} onPress={() => onChanger(o.cle)}>
            <Ionicons name={o.icone} size={22} color={couleur} />
            <Text style={[styles.label, { color: couleur }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    paddingBottom: 8,
    paddingTop: 6,
  },
  onglet: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
