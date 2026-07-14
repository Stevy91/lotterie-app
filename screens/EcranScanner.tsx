import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function EcranScanner() {
  return (
    <View style={styles.conteneur}>
      <Text style={styles.titre}>Scanner</Text>
      <View style={styles.centre}>
        <Ionicons name="camera-outline" size={48} color="#ccc" />
        <Text style={styles.texte}>Le scan de fiche par camera arrive bientot.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  titre: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  texte: {
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
