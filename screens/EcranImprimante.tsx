import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useActionsUniques } from '../actionUnique';
import { alerteSimple } from '../alerte';
import { autoriserBluetooth, definirImprimanteChoisie, obtenirImprimanteChoisie } from '../imprimante';
import BluetoothPrinter, { AppareilBluetooth } from '../modules/bluetooth-printer';
import { obtenirPilote, reinitialiserPilote } from '../pilotes/pilote';
import { TOUCHE_RETOUR, usePaddingEntete } from './enteteEcran';

interface Props {
  onRetour: () => void;
}

/**
 * Choix de l'imprimante Bluetooth.
 *
 * Par defaut l'application trouve seule son imprimante. Cet ecran sert aux
 * cas qu'aucune detection ne couvre : une imprimante de poche branchee sur un
 * telephone ordinaire, ou une imprimante externe preferee a celle du
 * terminal. Les imprimantes de poche portent des references seches qu'aucun
 * filtre de nom ne reconnait, d'ou le choix a la main.
 *
 * L'ecran liste les appareils APPAIRES : l'appairage lui-meme se fait dans
 * les reglages Bluetooth d'Android, avec le code du fabricant (souvent 0000
 * ou 1234). Refaire cet appairage ici n'apporterait rien et dupliquerait un
 * ecran que le systeme fait deja bien.
 */
export default function EcranImprimante({ onRetour }: Props) {
  const paddingEntete = usePaddingEntete();
  const [appareils, setAppareils] = useState<AppareilBluetooth[]>([]);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [permissionRefusee, setPermissionRefusee] = useState(false);
  const { enCours, lancer } = useActionsUniques();

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setChoisie(await obtenirImprimanteChoisie());

      if (!BluetoothPrinter) {
        setAppareils([]);
        return;
      }

      const autorise = await autoriserBluetooth();
      setPermissionRefusee(!autorise);
      setAppareils(autorise ? await BluetoothPrinter.listerAppareils() : []);
    } catch {
      setAppareils([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function choisir(adresse: string | null) {
    await definirImprimanteChoisie(adresse);
    setChoisie(adresse);
    // Le pilote est memorise apres le premier choix : sans cette remise a
    // zero, la fiche suivante sortirait encore sur l'imprimante precedente.
    reinitialiserPilote();
  }

  /**
   * Page de test : la seule facon de savoir que le choix marche avant d'avoir
   * un client devant soi. On passe par le pilote normal, pas par un chemin
   * special, pour que l'essai prouve vraiment ce qu'il pretend prouver.
   */
  async function testerImpression() {
    try {
      const pilote = await obtenirPilote();
      await pilote.prepare();
      await pilote.debuter();

      await pilote.setAlignment('center');
      await pilote.setTextStyle('bold', true);
      await pilote.printText('TEST IMPRESSION\n');
      await pilote.setTextStyle('bold', false);
      await pilote.printText('\n');
      await pilote.setAlignment('left');
      await pilote.printText(`Pilote : ${pilote.nom}\n`);
      await pilote.printText(`Date : ${new Date().toLocaleString()}\n`);
      await pilote.printText('\nSi tu lis ceci, l imprimante est prete.\n');
      await pilote.lineWrap(3);

      await pilote.terminer();
      alerteSimple('Test envoye', "Si rien ne sort, verifie que l'imprimante est allumee et a du papier.");
    } catch (e: any) {
      alerteSimple('Impression impossible', e?.message ?? "L'imprimante n'a pas repondu.");
    }
  }

  return (
    <View style={styles.conteneur}>
      <View style={[styles.entete, paddingEntete]}>
        <TouchableOpacity hitSlop={TOUCHE_RETOUR} onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Imprimante</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.explication}>
          Choisis l'imprimante qui doit sortir les fiches. Laisse sur Automatique si le terminal
          a sa propre imprimante.
        </Text>

        {chargement ? (
          <ActivityIndicator size="large" style={{ marginTop: 24 }} />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.carte, choisie === null && styles.carteActive]}
              onPress={lancer('auto', () => choisir(null))}
              activeOpacity={0.85}
            >
              <Ionicons
                name={choisie === null ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={choisie === null ? '#2563eb' : '#9ca3af'}
              />
              <View style={styles.carteTexte}>
                <Text style={styles.carteTitre}>Automatique</Text>
                <Text style={styles.carteDetail}>L'imprimante du terminal, si elle existe.</Text>
              </View>
            </TouchableOpacity>

            {appareils.map((appareil) => {
              const actif = choisie === appareil.adresse;
              return (
                <TouchableOpacity
                  key={appareil.adresse}
                  style={[styles.carte, actif && styles.carteActive]}
                  onPress={lancer(appareil.adresse, () => choisir(appareil.adresse))}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={actif ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={actif ? '#2563eb' : '#9ca3af'}
                  />
                  <View style={styles.carteTexte}>
                    <Text style={styles.carteTitre}>{appareil.nom}</Text>
                    <Text style={styles.carteDetail}>{appareil.adresse}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {appareils.length === 0 && (
              <View style={styles.vide}>
                <Text style={styles.videTitre}>
                  {permissionRefusee ? 'Permission Bluetooth refusee' : 'Aucun appareil appaire'}
                </Text>
                <Text style={styles.videTexte}>
                  {permissionRefusee
                    ? "Autorise le Bluetooth pour l'application dans les reglages Android, puis reviens ici."
                    : "Allume l'imprimante, appaire-la dans les reglages Bluetooth d'Android (code 0000 ou 1234 le plus souvent), puis actualise."}
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.bouton, styles.boutonSecondaire]}
                onPress={lancer('actualiser', charger)}
                disabled={!!enCours}
                activeOpacity={0.85}
              >
                {enCours === 'actualiser'
                  ? <ActivityIndicator size="small" color="#374151" />
                  : <Text style={styles.boutonSecondaireTexte}>Actualiser</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bouton}
                onPress={lancer('test', testerImpression)}
                disabled={!!enCours}
                activeOpacity={0.85}
              >
                {enCours === 'test'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.boutonTexte}>Page de test</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { flex: 1, backgroundColor: '#f5f6fa' },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  iconeRetour: { padding: 8 },
  titre: { fontSize: 17, fontWeight: '700', color: '#111827' },
  explication: { fontSize: 13, color: '#6b7280', lineHeight: 19, marginBottom: 16 },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  carteActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  carteTexte: { flex: 1 },
  carteTitre: { fontSize: 15, fontWeight: '700', color: '#111827' },
  carteDetail: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  vide: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  videTitre: { fontSize: 14, fontWeight: '700', color: '#b45309', marginBottom: 6 },
  videTexte: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  bouton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  boutonTexte: { color: '#fff', fontWeight: '700', fontSize: 14 },
  boutonSecondaire: { backgroundColor: '#e5e7eb' },
  boutonSecondaireTexte: { color: '#374151', fontWeight: '700', fontSize: 14 },
});
