import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Utilisateur } from '../auth';

export type Destination = 'creer' | 'liste-toutes' | 'liste-annulees' | 'liste-gagnantes';

interface Props {
  utilisateur: Utilisateur;
  onNaviguer: (destination: Destination) => void;
  onDeconnecter: () => void;
}

const CARTES: {
  destination: Destination;
  label: string;
  icone: keyof typeof Ionicons.glyphMap;
  couleur: string;
  reserveVente?: boolean;
}[] = [
  { destination: 'creer', label: 'Creer Fiche', icone: 'create-outline', couleur: '#6c5ce7', reserveVente: true },
  { destination: 'liste-toutes', label: 'Liste Fiches', icone: 'reader-outline', couleur: '#e84393' },
  { destination: 'liste-annulees', label: 'Liste Fiches\nSupprimees', icone: 'trash-outline', couleur: '#00b894' },
  { destination: 'liste-gagnantes', label: 'Liste Fiches\nGagnantes', icone: 'trophy-outline', couleur: '#e67e22' },
];

export default function EcranAccueil({ utilisateur, onNaviguer, onDeconnecter }: Props) {
  // Un agent principal supervise ses sous-agents mais ne vend pas de fiches lui-meme :
  // seul un sous-agent (ou l'admin) voit la carte "Creer Fiche".
  const peutVendre = utilisateur.role !== 'agent';
  const cartesVisibles = CARTES.filter((carte) => !carte.reserveVente || peutVendre);

  return (
    <View style={styles.conteneur}>
      <TouchableOpacity onPress={onDeconnecter} style={styles.boutonDeconnexion}>
        <Ionicons name="power-outline" size={22} color="#dc2626" />
      </TouchableOpacity>

      {utilisateur.logo_url ? (
        <Image source={{ uri: utilisateur.logo_url }} style={styles.logo} resizeMode="contain" />
      ) : (
        <View style={styles.logoPlaceholder}>
          <Ionicons name="storefront-outline" size={28} color="#bbb" />
        </View>
      )}

      <View style={styles.infosUtilisateur}>
        <Text style={styles.nomUtilisateur}>
          {/* <Text style={styles.role}>{utilisateur.role} </Text> */}
          {utilisateur.name}
        </Text>
        <Text style={styles.solde}>Solde: {Number(utilisateur.balance).toFixed(2)}</Text>
      </View>

      <View style={styles.grille}>
        {cartesVisibles.map((carte) => (
          <TouchableOpacity key={carte.destination} style={styles.carte} onPress={() => onNaviguer(carte.destination)}>
            <View style={[styles.iconeCercle, { backgroundColor: carte.couleur }]}>
              <Ionicons name={carte.icone} size={26} color="#fff" />
            </View>
            <Text style={styles.carteTexte}>{carte.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f7f7fa',
  },
  boutonDeconnexion: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1,
   
  },
  logo: {
    width: 100,
    height: 100,
    marginTop: 40,
    borderRadius: 16,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 8,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 16,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infosUtilisateur: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 28,
  },
  nomUtilisateur: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  role: {
    fontWeight: '600',
    color: '#888',
    textTransform: 'capitalize',
  },
  solde: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginTop: 4,
  },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 30,
    gap: 30,
  },
  carte: {
    width: '40%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    padding: 20,
  },
  iconeCercle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carteTexte: {
    color: '#333',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
});
