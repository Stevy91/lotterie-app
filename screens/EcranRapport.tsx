import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import SelecteurDate from '../composants/SelecteurDate';
import { alerteSimple } from '../alerte';
import { appelApi } from '../api';
import { obtenirNumeroSeriePosStocke, Utilisateur } from '../auth';
import { obtenirConfiguration } from '../configuration';
import { imprimerRapportSunmi, LigneRapport } from '../sunmiPrint';
import { Loterie } from '../types';
import EcranCompte from './EcranCompte';
import { TOUCHE_RETOUR, usePaddingEntete } from './enteteEcran';

interface Props {
  utilisateur: Utilisateur;
  onRetour: () => void;
}

interface RapportFinTirage {
  fiche_vendu: number;
  fiche_gagnant: number;
  vente: number;
  commission: number;
  /** Gains de la periode deja remis au client. */
  paiement: number;
  /** Tout ce que les gagnants de la periode ont droit de recevoir, paye ou non. */
  gains_dus?: number;
  /** Gains dus dont l'argent est encore dans la caisse du vendeur. */
  pas_encore_paye?: number;
  /** Vente - gains dus, sur la periode choisie. */
  balance_periode?: number;
  balance_periode_avec_commission?: number;
  /**
   * Solde COURANT du compte : un cumul depuis toujours, independant des dates.
   * A ne pas confondre avec les deux balances ci-dessus -- c'est precisement
   * cette confusion qui faisait afficher 17 230 la ou le backoffice disait
   * 10 450 pour la meme periode.
   */
  balance: number;
}

interface RapportFicheGagnant {
  fiche_gagnant: number;
  total_mise: number;
  total_gain: number;
}

/**
 * Les chiffres de la PERIODE choisie.
 *
 * A ne pas confondre avec rapport.balance, qui est le solde courant du compte
 * et ignore les dates : l'ecran affichait ce solde sous le nom « Balance », et
 * le POS annoncait 17 230 la ou le backoffice disait 10 450 pour la meme
 * periode. Les deux ecrans partent desormais de la meme base.
 *
 * Les valeurs de repli servent si le serveur n'a pas encore ete mis a jour :
 * l'app reste juste au lieu d'afficher des cases vides.
 */
function chiffresPeriode(rapport: RapportFinTirage) {
  const gainsDus = rapport.gains_dus ?? rapport.paiement;
  const balance = rapport.balance_periode ?? rapport.vente - gainsDus;

  return {
    gainsDus,
    pasEncorePaye: rapport.pas_encore_paye ?? gainsDus - rapport.paiement,
    balance,
    balanceAvecCommission: rapport.balance_periode_avec_commission ?? balance - rapport.commission,
  };
}

function versDateApi(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formaterDateAffichage(date: Date): string {
  const mois = ['janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];
  return `${String(date.getDate()).padStart(2, '0')} ${mois[date.getMonth()]} ${date.getFullYear()}`;
}

export default function EcranRapport({ utilisateur, onRetour }: Props) {
  const paddingEntete = usePaddingEntete();
  const [rapportActif, setRapportActif] = useState<'fin_tirage' | 'partiel' | 'f_gagnant' | null>(null);
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [datePartiel, setDatePartiel] = useState(new Date());
  const [dateGagnantDebut, setDateGagnantDebut] = useState(new Date());
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
      const chiffres = chiffresPeriode(rapport);
      lignes = [
        { label: 'Tirage :', valeur: loterieChoisie?.nom ?? 'Tout' },
        { label: 'Date :', valeur: `${formaterDateAffichage(dateDebut)} - ${formaterDateAffichage(dateFin)}` },
        { label: "Date D'impression :", valeur: formaterDateAffichage(dateImpression) },
        { label: 'Fiche Vendu :', valeur: String(rapport.fiche_vendu) },
        { label: 'Fiche Gagnant :', valeur: String(rapport.fiche_gagnant) },
        { label: 'Vente :', valeur: rapport.vente.toFixed(0) },
        { label: 'Commission :', valeur: rapport.commission.toFixed(0) },
        { label: 'Gains dus :', valeur: chiffres.gainsDus.toFixed(0) },
        { label: 'Deja paye :', valeur: rapport.paiement.toFixed(0) },
        { label: 'Pas encore paye :', valeur: chiffres.pasEncorePaye.toFixed(0) },
        { label: 'Balance :', valeur: chiffres.balance.toFixed(0) },
        { label: 'Balance (comm.) :', valeur: chiffres.balanceAvecCommission.toFixed(0) },
        // Le solde du compte ne depend pas des dates : il est nomme a part,
        // sinon on le lit comme un resultat de la periode.
        { label: 'Solde du compte :', valeur: rapport.balance.toFixed(0) },
      ];
    } else {
      alerteSimple('Aucun rapport', "Choisis d'abord un type de rapport (Partiel, Fin Tirage, F.Gagnant).");
      return;
    }

    try {
      const config = await obtenirConfiguration();
      const numeroSeriePos = (await obtenirNumeroSeriePosStocke()) ?? String(utilisateur.id);
      await imprimerRapportSunmi(titre, lignes, {
        nomCompagnie: config.app_name ?? 'Lotterie',
        adresseAgent: utilisateur.adresse,
        adresseProprietaire: utilisateur.proprietaire_adresse,
        telephoneAgent: utilisateur.telephone,
        telephoneProprietaire: utilisateur.proprietaire_telephone,
        posId: numeroSeriePos,
        vendeurNom: utilisateur.name,
        logoUrl: utilisateur.logo_url ?? config.logo_url ?? undefined,
        texteFiche: config.text_fiche,
      });
    } catch (e: any) {
      alerteSimple('Impression impossible', e.message ?? "L'imprimante du terminal n'est pas disponible.");
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
      alerteSimple('Attention', 'Impossible de charger le rapport.');
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
      alerteSimple('Attention', 'Impossible de charger le rapport.');
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
      alerteSimple('Attention', 'Impossible de charger le rapport.');
    } finally {
      setChargement(false);
    }
  }

  if (transactionOuvert) {
    return <EcranCompte utilisateur={utilisateur} onRetour={() => setTransactionOuvert(false)} />;
  }

  return (
    <View style={styles.conteneur}>
      <View style={[styles.entete, paddingEntete]}>
        <TouchableOpacity hitSlop={TOUCHE_RETOUR} onPress={onRetour} style={styles.iconeRetour}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.titre}>Rapport</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.grilleBoutons}>
          <TouchableOpacity
            style={[styles.boutonType, { backgroundColor: '#d9a441' }, rapportActif === 'partiel' && styles.boutonTypeActif]}
            activeOpacity={0.85}
            onPress={ouvrirPartiel}
          >
            <View style={styles.iconeCercle}>
              <Ionicons name="pie-chart-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.boutonTypeTexte}>PARTIEL</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boutonType, { backgroundColor: '#2563eb' }, rapportActif === 'fin_tirage' && styles.boutonTypeActif]}
            activeOpacity={0.85}
            onPress={ouvrirFinTirage}
          >
            <View style={styles.iconeCercle}>
              <Ionicons name="flag-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.boutonTypeTexte}>FIN TIRAGE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boutonType, { backgroundColor: '#e67e22' }, rapportActif === 'f_gagnant' && styles.boutonTypeActif]}
            activeOpacity={0.85}
            onPress={ouvrirFicheGagnant}
          >
            <View style={styles.iconeCercle}>
              <Ionicons name="trophy-outline" size={20} color="#fff" />
            </View>
            <Text style={styles.boutonTypeTexte}>F.GAGNANT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.boutonType, { backgroundColor: '#dc2626' }]}
            activeOpacity={0.85}
            onPress={() => setTransactionOuvert(true)}
          >
            <View style={styles.iconeCercle}>
              <Ionicons name="swap-horizontal-outline" size={20} color="#fff" />
            </View>
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
                <LigneDetail label="Gains dus :" valeur={chiffresPeriode(rapport).gainsDus.toFixed(0)} />
                <LigneDetail label="Deja paye :" valeur={rapport.paiement.toFixed(0)} />
                <LigneDetail label="Pas encore paye :" valeur={chiffresPeriode(rapport).pasEncorePaye.toFixed(0)} />
                <LigneDetail label="Balance :" valeur={chiffresPeriode(rapport).balance.toFixed(0)} />
                <LigneDetail label="Balance (comm.) :" valeur={chiffresPeriode(rapport).balanceAvecCommission.toFixed(0)} />
                {/* Le solde du compte ne depend pas des dates : nomme a part,
                    sinon on le lit comme un resultat de la periode. */}
                <LigneDetail label="Solde du compte :" valeur={rapport.balance.toFixed(0)} />
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
    backgroundColor: '#fff',
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 12,
  },
  boutonType: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 92,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  boutonTypeActif: {
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  iconeCercle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonTypeTexte: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
