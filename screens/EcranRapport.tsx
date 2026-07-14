import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurDate from '../composants/SelecteurDate';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { imprimerRapportSunmi, LigneRapport } from '../sunmiPrint';
import { Loterie } from '../types';
import EcranCompte from './EcranCompte';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

interface RapportFinTirage {
  fiche_vendu: number;
  fiche_gagnant: number;
  vente: number;
  commission: number;
  paiement: number;
  balance: number;
}

interface RapportFicheGagnant {
  fiche_gagnant: number;
  total_mise: number;
  total_gain: number;
}

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formaterDateAffichage(date: Date): string {
  const mois = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
  return `${String(date.getDate()).padStart(2, '0')} ${mois[date.getMonth()]} ${date.getFullYear()}`;
}

export default function EcranRapport({ utilisateur, onRetour }: Props) {
  const [rapportActif, setRapportActif] = useState<'fin_tirage' | 'partiel' | 'f_gagnant' | null>(null);
  const [dateDebut, setDateDebut] = useState(new Date(2025, 10, 1));
  const [dateFin, setDateFin] = useState(new Date());
  const [datePartiel, setDatePartiel] = useState(new Date());
  const [dateGagnantDebut, setDateGagnantDebut] = useState(new Date(2025, 10, 1));
  const [dateGagnantFin, setDateGagnantFin] = useState(new Date());
  const [loteries, setLoteries] = useState<Loterie[]>([]);
  const [loterieChoisie, setLoterieChoisie] = useState<Loterie | null>(null);
  const [chargement, setChargement] = useState(false);
  const [rapport, setRapport] = useState<RapportFinTirage | null>(null);
  const [rapportGagnant, setRapportGagnant] = useState<RapportFicheGagnant | null>(null);
  const [balanceActuelle, setBalanceActuelle] = useState(0);
  const [dateImpression] = useState(new Date());
  const [transactionOuvert, setTransactionOuvert] = useState(false);

  async function imprimerRapportActif() {
    let titre = '';
    let lignes: LigneRapport[] = [];

    if (rapportActif === 'partiel') {
      if (!rapport) {
        alerteSimple('Aucun resultat', "Lance d'abord une recherche avant d'imprimer.");
        return;
      }
      titre = 'Rapport Partiel';
      lignes = [
        { label: 'Tirage :', valeur: 'Tout' },
        { label: 'Date :', valeur: formaterDateAffichage(datePartiel) },
        { label: "Date D'impression :", valeur: formaterDateAffichage(dateImpression) },
        { label: 'Fiche Vendu :', valeur: String(rapport.fiche_vendu) },
        { label: 'Vente :', valeur: rapport.vente.toFixed(0) },
        { label: 'Commission :', valeur: rapport.commission.toFixed(0) },
      ];
    } else if (rapportActif === 'f_gagnant') {
      if (!rapportGagnant) {
        alerteSimple('Aucun resultat', "Lance d'abord une recherche avant d'imprimer.");
        return;
      }
      titre = 'Rapport Fiche Gagnant';
      lignes = [
        { label: 'Date :', valeur: `${formaterDateAffichage(dateGagnantDebut)} - ${formaterDateAffichage(dateGagnantFin)}` },
        { label: 'Fiche Gagnant :', valeur: String(rapportGagnant.fiche_gagnant) },
        { label: 'Total Mise :', valeur: rapportGagnant.total_mise.toFixed(0) },
        { label: 'Total Gain :', valeur: rapportGagnant.total_gain.toFixed(0) },
      ];
    } else if (rapportActif === 'fin_tirage') {
      if (!rapport) {
        alerteSimple('Aucun resultat', "Lance d'abord une recherche avant d'imprimer.");
        return;
      }
      titre = 'Rapport Fin Tirage';
      lignes = [
        { label: 'Tirage :', valeur: loterieChoisie?.nom ?? 'Tout' },
        { label: 'Date :', valeur: `${formaterDateAffichage(dateDebut)} - ${formaterDateAffichage(dateFin)}` },
        { label: "Date D'impression :", valeur: formaterDateAffichage(dateImpression) },
        { label: 'Fiche Vendu :', valeur: String(rapport.fiche_vendu) },
        { label: 'Fiche Gagnant :', valeur: String(rapport.fiche_gagnant) },
        { label: 'Vente :', valeur: rapport.vente.toFixed(0) },
        { label: 'Commission :', valeur: rapport.commission.toFixed(0) },
        { label: 'Paiment :', valeur: rapport.paiement.toFixed(0) },
        { label: 'Balance :', valeur: rapport.balance.toFixed(0) },
      ];
    } else {
      alerteSimple('Aucun rapport', "Choisis d'abord un type de rapport (Partiel, Fin Tirage, F.Gagnant).");
      return;
    }

    try {
      const config = await obtenirConfiguration();
      await imprimerRapportSunmi(titre, lignes, {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresse: config.adresse,
        posId: String(utilisateur.id),
        vendeurNom: utilisateur.name,
        logoUrl: config.logo_url ?? utilisateur.logo_url ?? undefined,
      });
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante Sunmi n'est pas disponible sur cet appareil.");
    }
  }

  function ouvrirPartiel() {
    setRapportActif('partiel');
    setRapport(null);
  }

  async function rechercherPartiel() {
    try {
      setChargement(true);
      const params = new URLSearchParams({
        date_debut: versDateApi(datePartiel),
        date_fin: versDateApi(datePartiel),
      });
      const reponse = await appelApi(`/rapports/fin-tirage?${params.toString()}`);
      const data: RapportFinTirage = await reponse.json();
      setRapport(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger le rapport.');
    } finally {
      setChargement(false);
    }
  }

  function ouvrirFicheGagnant() {
    setRapportActif('f_gagnant');
    setRapportGagnant(null);
  }

  async function rechercherFicheGagnant() {
    try {
      setChargement(true);
      const params = new URLSearchParams({
        date_debut: versDateApi(dateGagnantDebut),
        date_fin: versDateApi(dateGagnantFin),
      });
      const reponse = await appelApi(`/rapports/fiche-gagnant?${params.toString()}`);
      const data: RapportFicheGagnant = await reponse.json();
      setRapportGagnant(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger le rapport.');
    } finally {
      setChargement(false);
    }
  }

  async function ouvrirFinTirage() {
    setRapportActif('fin_tirage');
    setRapport(null);

    appelApi('/me')
      .then((reponse) => reponse.json())
      .then((data) => setBalanceActuelle(Number(data.balance)))
      .catch(() => {});

    if (loteries.length === 0) {
      try {
        const reponse = await appelApi('/loteries');
        const data: Loterie[] = await reponse.json();
        setLoteries(data);
      } catch (e) {
        // silencieux : le filtre "Tirage" restera sur "Tout"
      }
    }
  }

  function cyclerLoterie() {
    if (loteries.length === 0) return;
    if (loterieChoisie === null) {
      setLoterieChoisie(loteries[0]);
      return;
    }
    const indexActuel = loteries.findIndex((l) => l.id === loterieChoisie.id);
    if (indexActuel === loteries.length - 1) {
      setLoterieChoisie(null);
    } else {
      setLoterieChoisie(loteries[indexActuel + 1]);
    }
  }

  async function rechercher() {
    try {
      setChargement(true);
      const params = new URLSearchParams({
        date_debut: versDateApi(dateDebut),
        date_fin: versDateApi(dateFin),
      });
      if (loterieChoisie) {
        params.set('loterie_id', String(loterieChoisie.id));
      }
      const reponse = await appelApi(`/rapports/fin-tirage?${params.toString()}`);
      const data: RapportFinTirage = await reponse.json();
      setRapport(data);
    } catch (e) {
      alerteSimple('Erreur', 'Impossible de charger le rapport.');
    } finally {
      setChargement(false);
    }
  }

  if (transactionOuvert) {
    return <EcranCompte utilisateur={utilisateur} onRetour={() => setTransactionOuvert(false)} />;
  }

  return (
    <View style={styles.conteneur}>
      <View style={styles.entete}>
        <TouchableOpacity onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Rapport</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.grilleBoutons}>
          <TouchableOpacity style={[styles.boutonType, { backgroundColor: '#d9a441' }]} onPress={ouvrirPartiel}>
            <Text style={styles.boutonTypeTexte}>PARTIEL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.boutonType, { backgroundColor: '#2563eb' }]} onPress={ouvrirFinTirage}>
            <Text style={styles.boutonTypeTexte}>FIN TIRAGE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.boutonType, { backgroundColor: '#e67e22' }]} onPress={ouvrirFicheGagnant}>
            <Text style={styles.boutonTypeTexte}>F.GAGNANT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.boutonType, { backgroundColor: '#dc2626' }]} onPress={() => setTransactionOuvert(true)}>
            <Text style={styles.boutonTypeTexte}>TRANSACTION</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.iconeImprimante} onPress={imprimerRapportActif}>
          <Ionicons name="print-outline" size={26} color="#555" />
        </TouchableOpacity>

        {rapportActif === 'partiel' && (
          <>
            <Text style={styles.sousTitre}>Rapport Partiel</Text>

            <SelecteurDate date={datePartiel} onChangerDate={setDatePartiel} style={styles.champFiltreSeul} texteStyle={styles.libelleFiltreSeul} />

            <TouchableOpacity style={styles.boutonRechercheRond} onPress={rechercherPartiel} disabled={chargement}>
              {chargement ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={22} color="#fff" />}
            </TouchableOpacity>

            {rapport && (
              <View style={styles.detail}>
                <LigneDetail label="Tirage :" valeur="Tout" />
                <LigneDetail label="Date :" valeur={formaterDateAffichage(datePartiel)} />
                <LigneDetail label="Date D'impression :" valeur={formaterDateAffichage(dateImpression)} />
                <LigneDetail label="Fiche Vendu :" valeur={String(rapport.fiche_vendu)} />
                <LigneDetail label="Vente :" valeur={rapport.vente.toFixed(0)} />
                <LigneDetail label="Commission :" valeur={rapport.commission.toFixed(0)} />
              </View>
            )}
          </>
        )}

        {rapportActif === 'f_gagnant' && (
          <>
            <Text style={styles.sousTitre}>Rapport Fiche Gagnant</Text>

            <View style={styles.filtres}>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelFiltre}>De</Text>
                <SelecteurDate date={dateGagnantDebut} onChangerDate={setDateGagnantDebut} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelFiltre}>A</Text>
                <SelecteurDate date={dateGagnantFin} onChangerDate={setDateGagnantFin} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
              </View>
            </View>

            <TouchableOpacity style={styles.boutonRecherche} onPress={rechercherFicheGagnant} disabled={chargement}>
              {chargement ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
            </TouchableOpacity>

            {rapportGagnant && (
              <View style={styles.detail}>
                <LigneDetail label="Date :" valeur={`${formaterDateAffichage(dateGagnantDebut)} - ${formaterDateAffichage(dateGagnantFin)}`} />
                <LigneDetail label="Fiche Gagnant :" valeur={String(rapportGagnant.fiche_gagnant)} />
                <LigneDetail label="Total Mise :" valeur={rapportGagnant.total_mise.toFixed(0)} />
                <LigneDetail label="Total Gain :" valeur={rapportGagnant.total_gain.toFixed(0)} />
              </View>
            )}
          </>
        )}

        {rapportActif === 'fin_tirage' && (
          <>
            <Text style={styles.sousTitre}>Rapport Fin Tirage</Text>

            <View style={styles.carteBalance}>
              <Text style={styles.carteBalanceValeur}>{(rapport?.balance ?? balanceActuelle).toFixed(0)}</Text>
              <Text style={styles.carteBalanceLabel}>BALANCE</Text>
            </View>

            <View style={styles.filtres}>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelFiltre}>De</Text>
                <SelecteurDate date={dateDebut} onChangerDate={setDateDebut} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelFiltre}>A</Text>
                <SelecteurDate date={dateFin} onChangerDate={setDateFin} style={styles.champFiltre} texteStyle={styles.libelleFiltre} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelFiltre}>Tirage</Text>
                <TouchableOpacity style={styles.champFiltre} onPress={cyclerLoterie}>
                  <Text style={styles.libelleFiltre}>{loterieChoisie?.nom ?? 'Tout'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.boutonRecherche} onPress={rechercher} disabled={chargement}>
              {chargement ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
            </TouchableOpacity>

            {rapport && (
              <View style={styles.detail}>
                <LigneDetail label="Tirage :" valeur={loterieChoisie?.nom ?? 'Tout'} />
                <LigneDetail label="Date :" valeur={`${formaterDateAffichage(dateDebut)} - ${formaterDateAffichage(dateFin)}`} />
                <LigneDetail label="Date D'impression :" valeur={formaterDateAffichage(dateImpression)} />
                <LigneDetail label="Fiche Vendu :" valeur={String(rapport.fiche_vendu)} />
                <LigneDetail label="Fiche Gagnant :" valeur={String(rapport.fiche_gagnant)} />
                <LigneDetail label="Vente :" valeur={rapport.vente.toFixed(0)} />
                <LigneDetail label="Commission :" valeur={rapport.commission.toFixed(0)} />
                <LigneDetail label="Paiment :" valeur={rapport.paiement.toFixed(0)} />
                <LigneDetail label="Balance :" valeur={rapport.balance.toFixed(0)} />
                <LigneDetail label="Balance2 :" valeur={rapport.balance.toFixed(0)} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function LigneDetail({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={styles.ligneDetail}>
      <Text style={styles.labelDetail}>{label}</Text>
      <Text style={styles.valeurDetail}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  iconeRetour: {
    width: 22,
  },
  titre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  grilleBoutons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  boutonType: {
    width: '48%',
    borderRadius: 8,
    paddingVertical: 18,
    alignItems: 'center',
  },
  boutonTypeTexte: {
    color: '#fff',
    fontWeight: '700',
  },
  iconeImprimante: {
    alignSelf: 'center',
    marginTop: 16,
  },
  sousTitre: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  champFiltreSeul: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libelleFiltreSeul: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
    paddingVertical: 10,
    textAlign: 'center',
  },
  boutonRechercheRond: {
    backgroundColor: '#e67e22',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  carteBalance: {
    backgroundColor: '#5b9bd5',
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
  },
  carteBalanceValeur: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  carteBalanceLabel: {
    color: '#fff',
    fontWeight: '700',
    marginTop: 4,
  },
  filtres: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  labelFiltre: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  champFiltre: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libelleFiltre: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
    paddingVertical: 8,
    textAlign: 'center',
  },
  boutonRecherche: {
    backgroundColor: '#e67e22',
    borderRadius: 8,
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  detail: {
    marginTop: 16,
  },
  ligneDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  labelDetail: {
    color: '#333',
    fontWeight: '600',
  },
  valeurDetail: {
    color: '#333',
  },
});
