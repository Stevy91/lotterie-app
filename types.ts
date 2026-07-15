export interface Loterie {
  id: number;
  nom: string;
  heure_ouverture: string;
  heure_fermeture: string;
  is_active: boolean;
}

export interface TypeJeu {
  id: number;
  nom: string;
  nombre_chiffres: number;
  is_active: boolean;
  est_reverse: boolean;
  est_combinaison: boolean;
  generation_auto: string | null;
  visible_bouton: boolean;
}

export interface Tirage {
  id: number;
  loterie_id: number;
  date_tirage: string;
  statut: string;
  numero_1?: string | null;
  numero_2?: string | null;
  numero_3?: string | null;
  loterie: Loterie;
}

export interface Ligne {
  localId: string;
  tirage: Tirage;
  typeJeu: TypeJeu;
  numero: string;
  numero2?: string;
  montant: number;
}

export interface MiseResponse {
  id: number;
  numero: string;
  numero_2: string | null;
  montant: string;
  gain_potentiel: string;
  gain_reel: string;
  statut: string;
  type_jeu: TypeJeu;
  tirage: Tirage;
}

export interface AgentResponse {
  id: number;
  name: string;
  username: string;
  adresse: string | null;
  proprietaire_adresse: string | null;
  parent: { id: number; name: string } | null;
}

export interface TicketResponse {
  id: number;
  numero_ticket: string;
  nom_client: string | null;
  telephone_client: string | null;
  montant_total: string;
  gain_total: string;
  statut: string;
  paye: boolean;
  paye_le: string | null;
  created_at: string;
  mises: MiseResponse[];
  agent?: AgentResponse;
}
