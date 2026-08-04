import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
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

  // Session invalidee : compte suspendu (403) OU token revoque/expire (401,
  // typiquement quand le proprietaire/agent est suspendu et que les tokens du
  // reseau sont supprimes). Dans les deux cas on vide la session et on renvoie
  // a l'ecran de connexion au lieu de laisser l'app planter.
  useEffect(() => {
    definirGestionnaireSuspension(() => {
      deconnecter().catch(() => {});
      setUtilisateur(null);
      setOnglet('fiche');
      setEcran('accueil');
      alerteSimple(
        'Session terminee',
        "Ce compte a ete suspendu ou ta session a expire. Reconnecte-toi. Si le probleme persiste, contacte ton administrateur."
      );
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
        <StatusBar style="dark" />
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
    <View style={styles.loginFond}>
      <StatusBar style="dark" />

      {/* Fond : degrade doux + vagues bleues superposees en bas (plein ecran). */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 375 812" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="fondLogin" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#aebdd8" />
            <Stop offset="0.42" stopColor="#eaf4f2" />
            <Stop offset="1" stopColor="#6fd0cf" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="375" height="812" fill="url(#fondLogin)" />

        {/* Vagues : rubans diagonaux et fluides qui balaient vers le haut a droite. */}
        <Path fill="#cddff2" opacity={0.8} d="M0,470 C100,520 210,548 300,512 C338,497 358,500 375,492 L375,812 L0,812 Z" />
        <Path fill="#eaf3fb" opacity={0.55} d="M0,556 C120,508 230,468 375,500 L375,812 L0,812 Z" />
        <Path fill="#86c1d9" opacity={0.55} d="M0,600 C120,556 230,602 320,588 C348,584 362,588 375,586 L375,812 L0,812 Z" />
      </Svg>

      <View style={styles.loginContenu}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.loginLogo} resizeMode="contain" />
        ) : (
          <View style={styles.loginAvatar}>
            <Ionicons name="person" size={42} color="#fff" />
          </View>
        )}

        <View style={styles.loginChamp}>
          <TextInput
            style={styles.loginInput}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            placeholder="Nom d'utilisateur"
            placeholderTextColor="rgba(18,45,80,0.5)"
          />
        </View>

        <View style={[styles.loginChamp, styles.loginChampMotDePasse]}>
          <TextInput
            style={[styles.loginInput, { flex: 1 }]}
            secureTextEntry={!motDePasseVisible}
            value={password}
            onChangeText={setPassword}
            placeholder="Mot de passe"
            placeholderTextColor="rgba(18,45,80,0.5)"
          />
          <TouchableOpacity onPress={() => setMotDePasseVisible((v) => !v)} hitSlop={10}>
            <Ionicons name={motDePasseVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(18,45,80,0.6)" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.loginBouton} onPress={seConnecter} disabled={enCours} activeOpacity={0.85}>
          {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBoutonTexte}>Se connecter</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  racine: {
    flex: 1,
    // Fond blanc force : l'app ne suit PAS le mode sombre du systeme (sinon les
    // ecrans sans fond explicite -- Rapport, Parametre... -- devenaient noirs et
    // le texte illisible sur les appareils en dark mode).
    backgroundColor: '#fff',
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
  loginFond: {
    flex: 1,
    backgroundColor: '#cfe0ee',
    overflow: 'hidden',
  },
  loginContenu: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 150,
    paddingHorizontal: 30,
  },
  loginAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#123a63',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
    shadowColor: '#0b2540',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  loginLogo: {
    width: 150,
    height: 90,
    borderRadius: 16,
    marginBottom: 36,
    
    padding: 6,
  },
  loginChamp: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    paddingHorizontal: 18,
    justifyContent: 'center',
    marginBottom: 16,
  },
  loginChampMotDePasse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loginInput: {
    fontSize: 15,
    color: '#123a5a',
    paddingVertical: 0,
  },
  loginBouton: {
    width: '100%',
    height: 54,
    borderRadius: 28,
    backgroundColor: '#8c9bf7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: '#5b6ef5',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  loginBoutonTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
