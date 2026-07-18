import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import Svg, { Path } from 'react-native-svg';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { alerteSimple } from './alerte';
import { appelApi, definirGestionnaireSuspension } from './api';
import { connecter, deconnecter, mettreAJourUtilisateurStocke, recupererSession, Utilisateur } from './auth';
import { API_URL } from './config';
import { fetchAvecTimeout } from './fetchAvecTimeout';
import BarreNavigation, { Onglet } from './screens/BarreNavigation';
import EcranAccueil, { Destination } from './screens/EcranAccueil';
import EcranCreerFiche from './screens/EcranCreerFiche';
import EcranListeFiches from './screens/EcranListeFiches';
import EcranParametre from './screens/EcranParametre';
import EcranRapport from './screens/EcranRapport';
import EcranScanner from './screens/EcranScanner';
import PopupGlobal from './screens/PopupGlobal';

export default function App() {
  const [verificationSession, setVerificationSession] = useState(true);
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('fiche');
  const [ecran, setEcran] = useState<'accueil' | Destination>('accueil');

  useEffect(() => {
    recupererSession()
      .then((session) => setUtilisateur(session?.user ?? null))
      .finally(() => setVerificationSession(false));
  }, []);

  // Suspension immediate : si le serveur repond « compte suspendu » (403) sur
  // n'importe quel appel, on vide la session et on renvoie a l'ecran de connexion.
  useEffect(() => {
    definirGestionnaireSuspension(() => {
      deconnecter().catch(() => {});
      setUtilisateur(null);
      setOnglet('fiche');
      setEcran('accueil');
      alerteSimple('Compte suspendu', "Ce compte a ete suspendu. Contacte ton administrateur pour plus d'informations.");
    });
    return () => definirGestionnaireSuspension(null);
  }, []);

  // Le solde affiche (utilisateur.balance) est capture au login et ne bouge plus
  // tout seul : chaque vente/paiement le modifie cote serveur, donc on le
  // rafraichit a chaque changement d'ecran pour ne jamais montrer une valeur perimee.
  useEffect(() => {
    if (!utilisateur) return;

    appelApi('/me')
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!donnees) return;
        setUtilisateur((precedent) => (precedent ? { ...precedent, ...donnees } : precedent));
        mettreAJourUtilisateurStocke(donnees).catch(() => {});
      })
      .catch(() => {});
  }, [ecran, onglet, Boolean(utilisateur)]);

  async function seDeconnecter() {
    await deconnecter();
    setUtilisateur(null);
    setOnglet('fiche');
    setEcran('accueil');
  }

  function changerOnglet(nouvelOnglet: Onglet) {
    setOnglet(nouvelOnglet);
    if (nouvelOnglet === 'fiche') {
      setEcran('accueil');
    }
  }

  const titresParDestination: Record<Exclude<Destination, 'creer'>, string> = {
    'liste-toutes': 'Liste Fiches',
    'liste-annulees': 'Liste Fiches Supprimees',
    'liste-gagnantes': 'Liste Fiches Gagnantes',
  };

  const filtreParDestination: Record<Exclude<Destination, 'creer'>, 'toutes' | 'annulees' | 'gagnantes'> = {
    'liste-toutes': 'toutes',
    'liste-annulees': 'annulees',
    'liste-gagnantes': 'gagnantes',
  };

  let contenu;
  let afficherNav = false;

  if (verificationSession) {
    contenu = (
      <View style={styles.centre}>
        <ActivityIndicator size="large" />
      </View>
    );
  } else if (!utilisateur) {
    contenu = <EcranConnexion onConnecte={setUtilisateur} />;
  } else if (onglet === 'rapport') {
    contenu = <EcranRapport utilisateur={utilisateur} onRetour={() => changerOnglet('fiche')} />;
    afficherNav = true;
  } else if (onglet === 'scanner') {
    contenu = <EcranScanner utilisateur={utilisateur} />;
    afficherNav = true;
  } else if (onglet === 'parametre') {
    contenu = <EcranParametre utilisateur={utilisateur} onDeconnecter={seDeconnecter} />;
    afficherNav = true;
  } else if (ecran === 'accueil') {
    contenu = <EcranAccueil utilisateur={utilisateur} onNaviguer={setEcran} onDeconnecter={seDeconnecter} />;
    afficherNav = true;
  } else if (ecran === 'creer') {
    contenu = <EcranCreerFiche utilisateur={utilisateur} onRetour={() => setEcran('accueil')} />;
  } else {
    contenu = (
      <EcranListeFiches
        titre={titresParDestination[ecran]}
        filtre={filtreParDestination[ecran]}
        utilisateur={utilisateur}
        onRetour={() => setEcran('accueil')}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.racine}>
        <StatusBar style="auto" />
        <View style={styles.zoneContenu}>{contenu}</View>
        {afficherNav && <BarreNavigation onglet={onglet} onChanger={changerOnglet} />}
        <PopupGlobal />
      </View>
    </SafeAreaProvider>
  );
}

function EcranConnexion({ onConnecte }: { onConnecte: (u: Utilisateur) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [nomCompagnie, setNomCompagnie] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchAvecTimeout(`${API_URL}/configuration?_=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
      .then((reponse) => reponse.json())
      .then((data) => {
        setNomCompagnie(data.app_name ?? null);
        setLogoUrl(data.logo_url ?? null);
      })
      .catch(() => {});
  }, []);

  async function seConnecter() {
    if (!username || !password) {
      alerteSimple('Champs manquants', "Entre ton nom d'utilisateur et ton mot de passe.");
      return;
    }

    try {
      setEnCours(true);
      const utilisateur = await connecter(username.trim(), password);
      onConnecte(utilisateur);
    } catch (e: any) {
      alerteSimple('Connexion impossible', e?.message ?? "Verifie ta connexion internet et tes identifiants, puis reessaie.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.fondConnexion}>
      <StatusBar style="light" />

      {/* Vague orange en haut : courbes SVG lisses (pas de bords droits) */}
      <Svg style={styles.svgVagueHaut} viewBox="0 0 375 190" preserveAspectRatio="none">
        <Path fill="#e8590c" d="M0,0 L375,0 L375,100 C320,138 245,72 170,104 C110,130 45,118 0,102 Z" />
        <Path fill="#f2994a" d="M0,0 L375,0 L375,48 C330,86 260,34 190,68 C120,104 55,100 0,90 Z" />
      </Svg>

      {/* Vague bleue en bas (miroir) */}
      <Svg style={styles.svgVagueBas} viewBox="0 0 375 190" preserveAspectRatio="none">
        <Path fill="#1864ab" d="M0,160 L375,160 L375,60 C320,22 245,88 170,56 C110,30 45,42 0,58 Z" />
        <Path fill="#4dabf7" d="M0,160 L375,160 L375,112 C330,74 260,126 190,92 C120,56 55,60 0,70 Z" />
      </Svg>

      <View style={styles.carteConnexion}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoConnexion} resizeMode="contain" />
        ) : (
          <View style={styles.logoPlaceholderConnexion}>
            <Ionicons name="storefront-outline" size={30} color="#bbb" />
          </View>
        )}

        <Text style={styles.titre}>Connexion</Text>
        {/* {nomCompagnie && <Text style={styles.sousTitreConnexion}>{nomCompagnie}</Text>} */}

        <View style={styles.blocChamps}>
          <View style={styles.champLigne}>
            <Ionicons name="person-outline" size={19} color="#8a8a8a" />
            <TextInput
              style={styles.inputLigne}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              placeholder="Nom d'utilisateur"
              placeholderTextColor="#a5a5a5"
            />
          </View>

          <View style={[styles.champLigne, styles.champLigneSansBordure]}>
            <Ionicons name="lock-closed-outline" size={19} color="#8a8a8a" />
            <TextInput
              style={styles.inputLigne}
              secureTextEntry={!motDePasseVisible}
              value={password}
              onChangeText={setPassword}
              placeholder="Mot de passe"
              placeholderTextColor="#a5a5a5"
            />
            <TouchableOpacity onPress={() => setMotDePasseVisible((v) => !v)}>
              <Ionicons name={motDePasseVisible ? 'eye-off-outline' : 'eye-outline'} size={19} color="#8a8a8a" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.boutonPilule} onPress={seConnecter} disabled={enCours} activeOpacity={0.85}>
          {enCours ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.boutonPiluleTexte}>Se connecter</Text>
              <View style={styles.cercleFleche}>
                <Ionicons name="arrow-forward" size={16} color="#5b6ef5" />
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  racine: {
    flex: 1,
  },
  zoneContenu: {
    flex: 1,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fondConnexion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  svgVagueHaut: {
    position: 'absolute',
    top: -30,
    left: 0,
    right: 0,
    height: 190,
  },
  svgVagueBas: {
    position: 'absolute',
    bottom: -50,
    left: 0,
    right: 0,
    height: 190,
  },
  carteConnexion: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  blocChamps: {
    width: '100%',
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  champLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
    paddingVertical: 4,
  },
  champLigneSansBordure: {
    borderBottomWidth: 0,
  },
  inputLigne: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: '#222',
  },
  boutonPilule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    marginTop: 26,
    backgroundColor: '#8c9bf7',
    borderRadius: 30,
    paddingVertical: 15,
    shadowColor: '#5b6ef5',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  boutonPiluleTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  cercleFleche: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoConnexion: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
    padding: 6,
  },
  logoPlaceholderConnexion: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: '#f5f6fa',
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  titre: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#222',
  },
  sousTitreConnexion: {
    color: '#888',
    fontWeight: '600',
    marginTop: 4,
  },
  label: {
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    color: '#444',
    alignSelf: 'flex-start',
  },
  champAvecIcone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e2e2',
    backgroundColor: '#fafafa',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  inputAvecIcone: {
    flex: 1,
    paddingVertical: 12,
    color: '#222',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  bouton: {
    width: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  boutonTexte: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
