import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { TicketResponse } from '../types';
import EcranDetailFiche from './EcranDetailFiche';

interface Props {
  utilisateur: Utilisateur;
}

export default function EcranScanner({ utilisateur }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [scanEnCours, setScanEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Saisie manuelle du numero de fiche (secours quand le QR imprime est trop pale).
  const [saisieVisible, setSaisieVisible] = useState(false);
  const [numeroSaisi, setNumeroSaisi] = useState('');
  const [rechercheEnCours, setRechercheEnCours] = useState(false);

  async function ouvrirParNumero() {
    const numero = numeroSaisi.trim();
    if (!numero) return;
    try {
      setRechercheEnCours(true);
      const reponse = await appelApi(`/tickets/numero/${encodeURIComponent(numero)}`);
      if (!reponse.ok) {
        setErreur('Aucune fiche ne correspond a ce numero.');
        return;
      }
      const ticket: TicketResponse = await reponse.json();
      setSaisieVisible(false);
      setNumeroSaisi('');
      setErreur(null);
      setTicketId(ticket.id);
    } catch {
      setErreur('Impossible de rechercher la fiche. Verifie ta connexion.');
    } finally {
      setRechercheEnCours(false);
    }
  }

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
        autofocus="on"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanEnCours ? undefined : surScan}
      />

      {/* Cadre de visee + consignes */}
      <View style={styles.calque} pointerEvents="none">
        <Text style={styles.titre}>Scanner une fiche</Text>
        <View style={styles.cadre} />
        <Text style={styles.consigne}>Vise le QR code au bas de la fiche</Text>
      </View>

      {/* Secours : saisir le numero de fiche a la main */}
      <TouchableOpacity style={styles.boutonManuel} onPress={() => setSaisieVisible(true)}>
        <Ionicons name="keypad-outline" size={18} color="#fff" />
        <Text style={styles.boutonManuelTexte}>Saisir le numero</Text>
      </TouchableOpacity>

      {saisieVisible && (
        <View style={styles.fondSaisie}>
          <View style={styles.carteSaisie}>
            <Text style={styles.titreSaisie}>Numero de la fiche</Text>
            <TextInput
              style={styles.champSaisie}
              placeholder="Ex: TCK-XXXXXXXX"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoFocus
              value={numeroSaisi}
              onChangeText={setNumeroSaisi}
            />
            <View style={styles.boutonsSaisie}>
              <TouchableOpacity
                style={[styles.boutonSaisie, styles.boutonSaisieSecondaire]}
                onPress={() => {
                  setSaisieVisible(false);
                  setNumeroSaisi('');
                }}
              >
                <Text style={styles.boutonSaisieTexte}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.boutonSaisie} onPress={ouvrirParNumero} disabled={rechercheEnCours}>
                {rechercheEnCours ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.boutonSaisieTexte}>Ouvrir</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
  boutonManuel: {
    position: 'absolute',
    top: 50,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(108,92,231,0.9)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  boutonManuelTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  fondSaisie: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carteSaisie: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  titreSaisie: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  champSaisie: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  boutonsSaisie: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  boutonSaisie: {
    flex: 1,
    backgroundColor: '#6c5ce7',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  boutonSaisieSecondaire: {
    backgroundColor: '#6b7280',
  },
  boutonSaisieTexte: {
    color: '#fff',
    fontWeight: '700',
  },
});
