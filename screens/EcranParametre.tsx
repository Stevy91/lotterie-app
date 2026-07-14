import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { alerteSimple } from '../alerte';
import { appelApi, appelApiFichier } from '../api';
import { Utilisateur } from '../auth';
import EcranCompte from './EcranCompte';
import EcranNumeroGagnant from './EcranNumeroGagnant';
import EcranTirageDisponible from './EcranTirageDisponible';

interface Props {
  utilisateur: Utilisateur;
  onDeconnecter: () => void;
}

function bientotDisponible(fonctionnalite: string) {
  alerteSimple('Bientot disponible', `${fonctionnalite} arrive bientot.`);
}

export default function EcranParametre({ utilisateur, onDeconnecter }: Props) {
  const [configuration, setConfiguration] = useState<Record<string, string>>({});
  const [sousEcran, setSousEcran] = useState<'accueil' | 'compte' | 'tirages' | 'numeros-gagnants'>('accueil');
  const [logoUrl, setLogoUrl] = useState<string | null>(utilisateur.logo_url);
  const [televersementEnCours, setTeleversementEnCours] = useState(false);

  useEffect(() => {
    appelApi('/configuration')
      .then((reponse) => reponse.json())
      .then(setConfiguration)
      .catch(() => {});
  }, []);

  async function telechargerLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alerteSimple('Permission requise', "Autorise l'acces aux photos pour choisir un logo.");
      return;
    }

    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (resultat.canceled || resultat.assets.length === 0) {
      return;
    }

    const image = resultat.assets[0];

    try {
      setTeleversementEnCours(true);

      const formData = new FormData();
      const nomFichier = image.fileName ?? 'logo.jpg';
      const type = image.mimeType ?? 'image/jpeg';

      formData.append('logo', {
        uri: image.uri,
        name: nomFichier,
        type,
      } as any);

      const reponse = await appelApiFichier('/moi/logo', formData);

      if (!reponse.ok) {
        const erreur = await reponse.json().catch(() => null);
        throw new Error(erreur?.message ?? 'Impossible de televerser le logo.');
      }

      const data = await reponse.json();
      setLogoUrl(data.logo_url);
    } catch (e: any) {
      alerteSimple('Erreur', e.message ?? 'Impossible de televerser le logo.');
    } finally {
      setTeleversementEnCours(false);
    }
  }

  if (sousEcran === 'compte') {
    return <EcranCompte utilisateur={utilisateur} onRetour={() => setSousEcran('accueil')} />;
  }

  if (sousEcran === 'tirages') {
    return <EcranTirageDisponible onRetour={() => setSousEcran('accueil')} />;
  }

  if (sousEcran === 'numeros-gagnants') {
    return <EcranNumeroGagnant onRetour={() => setSousEcran('accueil')} />;
  }

  return (
    <ScrollView style={styles.conteneur} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.titre}>Parametre</Text>

      <View style={styles.grille}>
        <TouchableOpacity
          style={[styles.bouton, styles.boutonMoitie, { backgroundColor: '#e67e22' }]}
          onPress={() => setSousEcran('compte')}
        >
          <Text style={styles.boutonTexte}>Compte $</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bouton, styles.boutonMoitie, { backgroundColor: '#2563eb' }]}
          onPress={() => setSousEcran('tirages')}
        >
          <Text style={styles.boutonTexte}>Tirage Disponible</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bouton, styles.boutonMoitie, { backgroundColor: '#2563eb' }]}
          onPress={() => bientotDisponible('Imprimante & avance')}
        >
          <Text style={styles.boutonTexte}>Imprimante & avance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bouton, styles.boutonMoitie, { backgroundColor: '#e67e22' }]}
          onPress={() => setSousEcran('numeros-gagnants')}
        >
          <Text style={styles.boutonTexte}>Numero Gagnant</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bouton, styles.boutonPleine, { backgroundColor: '#16a085' }]}
          onPress={telechargerLogo}
          disabled={televersementEnCours}
        >
          {televersementEnCours ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.boutonTexte}>Telecharger Logo</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.bouton, styles.boutonPleine, { backgroundColor: '#dc2626' }]} onPress={onDeconnecter}>
          <Text style={styles.boutonTexte}>Deconnecter</Text>
        </TouchableOpacity>
      </View>

      {logoUrl && (
        <View style={styles.previewLogo}>
          <Text style={styles.labelInfo}>Ton logo actuel :</Text>
          <Image source={{ uri: logoUrl }} style={styles.imageLogo} />
        </View>
      )}

      <View style={styles.infos}>
        <View style={styles.ligneInfo}>
          <Text style={styles.labelInfo}>Nom compagnie: <Text style={styles.valeurInfo}>{configuration.app_name ?? '-'}</Text></Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.labelInfo}>
            Mariage gratuit: <Text style={styles.valeurMariage}>{configuration.mariage_gratuit ?? '-'}</Text>
          </Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.labelInfo}>
            Duree de suppression fiche: {configuration.duree_suppression_fiche ?? '-'} minutes
          </Text>
        </View>
        <View style={styles.ligneInfo}>
          <Text style={styles.labelInfo}>Text fiche:</Text>
          <Text style={styles.texteFiche}>{configuration.text_fiche ?? '-'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  titre: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  previewLogo: {
    marginTop: 16,
    alignItems: 'flex-start',
    gap: 8,
  },
  imageLogo: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  grille: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bouton: {
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonMoitie: {
    width: '48%',
  },
  boutonPleine: {
    width: '100%',
  },
  boutonTexte: {
    color: '#fff',
    fontWeight: 'bold',
  },
  infos: {
    marginTop: 24,
  },
  ligneInfo: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  labelInfo: {
    color: '#333',
    fontWeight: '600',
  },
  valeurInfo: {
    fontWeight: '400',
  },
  valeurMariage: {
    fontWeight: '700',
    color: '#16a34a',
  },
  texteFiche: {
    color: '#333',
    marginTop: 6,
    lineHeight: 20,
  },
});
