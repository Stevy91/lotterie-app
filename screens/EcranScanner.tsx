import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { Utilisateur } from '../auth';
import EcranDetailFiche from './EcranDetailFiche';

interface Props {
  utilisateur: Utilisateur;
}

export default function EcranScanner({ utilisateur }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [scanEnCours, setScanEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Une fiche a ete scannee : on ouvre directement son detail.
  if (ticketId !== null) {
    return (
      <EcranDetailFiche
        ticketId={ticketId}
        utilisateur={utilisateur}
        onRetour={() => {
          setTicketId(null);
          setScanEnCours(false);
          setErreur(null);
        }}
      />
    );
  }

  function surScan(resultat: { data: string }) {
    if (scanEnCours) return;
    setScanEnCours(true);

    // Le QR imprime contient "FICHE:{id}" ; on tolere aussi un simple nombre.
    const correspondance = resultat.data.match(/(\d+)/);
    if (!correspondance) {
      setErreur("Ce QR code n'est pas une fiche valide.");
      setScanEnCours(false);
      return;
    }
    setTicketId(parseInt(correspondance[1], 10));
  }

  if (!permission) {
    return (
      <View style={styles.centre}>
        <Text style={styles.texte}>Chargement de la camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centre}>
        <Ionicons name="camera-outline" size={48} color="#ccc" />
        <Text style={styles.texte}>Autorise l'acces a la camera pour scanner les fiches.</Text>
        <TouchableOpacity style={styles.bouton} onPress={requestPermission}>
          <Text style={styles.boutonTexte}>Autoriser la camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.conteneur}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanEnCours ? undefined : surScan}
      />

      {/* Cadre de visee + consignes */}
      <View style={styles.calque} pointerEvents="none">
        <Text style={styles.titre}>Scanner une fiche</Text>
        <View style={styles.cadre} />
        <Text style={styles.consigne}>Vise le QR code au bas de la fiche</Text>
      </View>

      {erreur && (
        <View style={styles.barreErreur}>
          <Text style={styles.barreErreurTexte}>{erreur}</Text>
          <TouchableOpacity
            onPress={() => {
              setErreur(null);
              setScanEnCours(false);
            }}
          >
            <Text style={styles.barreErreurAction}>Reessayer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    backgroundColor: '#000',
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  texte: {
    color: '#666',
    textAlign: 'center',
  },
  calque: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  titre: {
    position: 'absolute',
    top: 60,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cadre: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  consigne: {
    marginTop: 20,
    color: '#fff',
    fontSize: 14,
  },
  bouton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  boutonTexte: {
    color: '#fff',
    fontWeight: '700',
  },
  barreErreur: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(220,38,38,0.95)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barreErreurTexte: {
    color: '#fff',
    flex: 1,
  },
  barreErreurAction: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 12,
  },
});
