import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { definirEcouteurPopup, EtatPopup } from '../alerte';

export default function PopupGlobal() {
  const [etat, setEtat] = useState<EtatPopup | null>(null);

  useEffect(() => {
    definirEcouteurPopup(setEtat);
    return () => definirEcouteurPopup(null);
  }, []);

  if (!etat) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setEtat(null)}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <Text style={styles.titre}>{etat.titre}</Text>
          {etat.message ? <Text style={styles.message}>{etat.message}</Text> : null}

          <View style={styles.boutons}>
            {etat.boutons.map((bouton, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.bouton, bouton.style === 'annuler' && styles.boutonAnnuler]}
                onPress={() => {
                  setEtat(null);
                  bouton.onPress?.();
                }}
              >
                <Text style={[styles.boutonTexte, bouton.style === 'annuler' && styles.boutonAnnulerTexte]}>
                  {bouton.texte}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  carte: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  titre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
    lineHeight: 20,
  },
  boutons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  bouton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  boutonAnnuler: {
    backgroundColor: '#f1f1f1',
  },
  boutonTexte: {
    color: '#fff',
    fontWeight: '700',
  },
  boutonAnnulerTexte: {
    color: '#444',
  },
});
