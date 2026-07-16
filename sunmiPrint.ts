import { Platform } from 'react-native';
import * as SunmiPrinterLibrary from '@mitsuharu/react-native-sunmi-printer-library';
import * as ImageManipulator from 'expo-image-manipulator';

import { TicketResponse } from './types';

const LARGEUR_PAPIER_PIXELS = 384; // papier 58mm
const SEPARATEUR = '********************************\n';

export interface EnteteRecu {
  nomCompagnie: string;
  // "Addresse" : l'adresse propre du vendeur (agent/sous-agent).
  adresseAgent?: string | null;
  // "Central" : l'adresse du proprietaire (client) auquel appartient le vendeur.
  adresseProprietaire?: string | null;
  posId: string;
  vendeurNom: string;
  logoUrl?: string | null;
  // Texte configure par le proprietaire, imprime en bas de chaque fiche.
  texteFiche?: string | null;
}

export interface LigneRapport {
  label: string;
  valeur: string;
}

// "L3 Auto".."L7 Auto" -> "Lo3".."Lo7", "MA Auto" -> "MA" (Marriage), tout
// le reste (BPaire, Reverse, P0-P9 Auto, Lo, 3 Chif...) -> "BO".
export function abregerTypeJeu(nomTypeJeu: string): string {
  const nom = nomTypeJeu.trim();

  const correspondanceL = nom.match(/^L(\d)\s*Auto$/i);
  if (correspondanceL) {
    return `Lo${correspondanceL[1]}`;
  }

  if (/^MA\s*Auto$/i.test(nom)) {
    return 'MA';
  }

  return 'BO';
}

function formaterDate(date: Date): string {
  return date.toLocaleString('fr-FR');
}

async function logoEnDataUri(logoUrl: string): Promise<string | null> {
  try {
    // Les logos uploades par les proprietaires peuvent faire plusieurs
    // milliers de pixels de large : on les redimensionne a la largeur du
    // papier avant de les envoyer au SDK d'impression, sinon le decodage
    // d'une trop grande image plante silencieusement sur le Sunmi (peu de RAM).
    const resultat = await ImageManipulator.manipulateAsync(
      logoUrl,
      [{ resize: { width: LARGEUR_PAPIER_PIXELS } }],
      { base64: true, format: ImageManipulator.SaveFormat.PNG }
    );
    if (!resultat.base64) return null;
    return `data:image/png;base64,${resultat.base64}`;
  } catch {
    // Une erreur de logo (reseau, format...) ne doit jamais bloquer l'impression.
    return null;
  }
}

async function verifierImprimante(): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error("L'impression sur l'imprimante Sunmi n'est disponible que sur Android.");
  }

  let pret: boolean;
  try {
    pret = await SunmiPrinterLibrary.prepare();
  } catch (e: any) {
    // On remonte le detail brut de l'erreur native : le message par defaut
    // masquait la vraie cause quand l'erreur native n'a pas de .message.
    throw new Error(`prepare() a echoue: ${e?.message || e?.code || JSON.stringify(e) || 'erreur inconnue'}`);
  }

  if (!pret) {
    throw new Error('Aucune imprimante Sunmi detectee sur cet appareil (prepare a retourne false).');
  }
}

/**
 * Entete commune a toutes les impressions : logo, "***Fiche Original***" (ou
 * le titre fourni), nom de la compagnie, POS, vendeur, adresse et date.
 */
async function imprimerEntete(entete: EnteteRecu, titre: string): Promise<void> {
  if (entete.logoUrl) {
    const dataUri = await logoEnDataUri(entete.logoUrl);
    if (dataUri) {
      await SunmiPrinterLibrary.setAlignment('center');
      await SunmiPrinterLibrary.printImage(dataUri, LARGEUR_PAPIER_PIXELS, 'grayscale');
      await SunmiPrinterLibrary.lineWrap(1);
    }
  }

  await SunmiPrinterLibrary.setAlignment('center');
  await SunmiPrinterLibrary.setTextStyle('bold', true);
  await SunmiPrinterLibrary.printText(`${titre}\n`);
  await SunmiPrinterLibrary.setFontSize(32);
  await SunmiPrinterLibrary.printText(`${entete.nomCompagnie}\n`);
  await SunmiPrinterLibrary.setDefaultFontSize();
  await SunmiPrinterLibrary.setTextStyle('bold', false);
  await SunmiPrinterLibrary.lineWrap(1);

  await SunmiPrinterLibrary.setAlignment('center');
  // Un seul appel pour les 5 lignes : des appels printText() separes
  // inserent un espace parasite entre chaque ligne sur le Sunmi.
  await SunmiPrinterLibrary.printText(
    `POS: ${entete.posId}\n` +
      `Vendeur: ${entete.vendeurNom}\n` +
      `Addresse : ${entete.adresseAgent || '-'}\n` +
      `Central: ${entete.adresseProprietaire || '-'}\n` +
      `Date: ${formaterDate(new Date())}\n`
  );
  await SunmiPrinterLibrary.printText(SEPARATEUR);
}

async function imprimerPied(texteFiche?: string | null): Promise<void> {
  if (texteFiche) {
    await SunmiPrinterLibrary.setAlignment('center');
    await SunmiPrinterLibrary.printText(`${texteFiche}\n`);
  }
  await SunmiPrinterLibrary.setAlignment('left');
  await SunmiPrinterLibrary.printText(`Impression: ${formaterDate(new Date())}\n`);
  await SunmiPrinterLibrary.lineWrap(3);
  try {
    await SunmiPrinterLibrary.cutPaper();
  } catch {
    // Le Sunmi V2 (portable) n'a pas de massicot -- disponible seulement sur les modeles de bureau.
  }
}

/**
 * Imprime un ou plusieurs tickets a la suite sur l'imprimante thermique Sunmi,
 * dans le meme format que la fiche papier de reference (entete + lignes par
 * ticket + total par ticket + grand total si plusieurs tickets).
 */
export async function imprimerFichesSunmi(tickets: TicketResponse[], entete: EnteteRecu): Promise<void> {
  await verifierImprimante();
  await imprimerEntete(entete, '***Fiche Original***');

  let grandTotal = 0;

  for (const ticket of tickets) {
    const zoneNom = ticket.mises[0]?.tirage.loterie.nom ?? '';
    await SunmiPrinterLibrary.setAlignment('center');
    // Un seul appel (numero de ticket + zone) pour eviter tout espace
    // parasite entre les deux lignes.
    await SunmiPrinterLibrary.printText(`#ticket: ${ticket.numero_ticket}\n${zoneNom}\n`);

    await SunmiPrinterLibrary.setAlignment('left');
    for (const mise of ticket.mises) {
      const abrev = abregerTypeJeu(mise.type_jeu.nom);
      // Lotto 4/5 chiffres : suffixe "-1"/"-2"/"-3" pour identifier l'option
      // de combinaison jouee (voir CalculGainService::evaluerLo4/evaluerLo5).
      const suffixeOption = mise.option_combinaison ? `-${mise.option_combinaison}` : '';
      const numero = mise.numero_2 ? `${mise.numero}*${mise.numero_2}` : `${mise.numero}${suffixeOption}`;
      const montant = Number(mise.montant);
      const montantTexte = montant === 0 ? 'gratis' : `${montant.toFixed(2)} HTG`;

      // Somme des largeurs <= 31 : a 32 pile, le dernier caractere ("G" de
      // "HTG") deborde sur une ligne a part.
      await SunmiPrinterLibrary.printColumnsText(
        [abrev, numero, `=> ${montantTexte}`],
        [4, 11, 15],
        ['left', 'left', 'right']
      );
    }

    await SunmiPrinterLibrary.printText(SEPARATEUR);
    await SunmiPrinterLibrary.setTextStyle('bold', true);
    await SunmiPrinterLibrary.printColumnsText(
      ['Total =>', `${Number(ticket.montant_total).toFixed(2)} HTG`],
      [14, 13],
      ['left', 'right']
    );
    await SunmiPrinterLibrary.setTextStyle('bold', false);
    await SunmiPrinterLibrary.printText(SEPARATEUR);

    grandTotal += Number(ticket.montant_total);
  }

  if (tickets.length > 1) {
    await SunmiPrinterLibrary.setTextStyle('bold', true);
    await SunmiPrinterLibrary.printColumnsText(
      ['Grand Total =>', `${grandTotal.toFixed(2)} HTG`],
      [14, 13],
      ['left', 'right']
    );
    await SunmiPrinterLibrary.setTextStyle('bold', false);
    await SunmiPrinterLibrary.printText(SEPARATEUR);
  }

  await imprimerPied(entete.texteFiche);
}

/**
 * Imprime un rapport generique (Partiel, Fin Tirage, Fiche Gagnant...)
 * sous forme de liste label/valeur, avec la meme entete que les fiches.
 */
export async function imprimerRapportSunmi(titre: string, lignes: LigneRapport[], entete: EnteteRecu): Promise<void> {
  await verifierImprimante();
  await imprimerEntete(entete, titre);

  await SunmiPrinterLibrary.setAlignment('left');
  for (const ligne of lignes) {
    await SunmiPrinterLibrary.printColumnsText([ligne.label, ligne.valeur], [16, 11], ['left', 'right']);
  }
  await SunmiPrinterLibrary.setAlignment('center');
  await SunmiPrinterLibrary.printText(SEPARATEUR);

  await imprimerPied(entete.texteFiche);
}

export interface LigneTransaction {
  ref_code: string;
  type: string;
  montant: number;
  dateAffichee: string;
}

/**
 * Imprime le rapport Transaction : solde + totaux, puis chaque transaction
 * (reference/type sur une ligne, date/montant sur la suivante).
 */
export async function imprimerTransactionsSunmi(
  resume: { balance: number; totalRecharge: number; totalRetrait: number },
  transactions: LigneTransaction[],
  entete: EnteteRecu
): Promise<void> {
  await verifierImprimante();
  await imprimerEntete(entete, 'Rapport Transaction');

  await SunmiPrinterLibrary.setAlignment('left');
  await SunmiPrinterLibrary.printColumnsText(['Solde', `${resume.balance.toFixed(0)} HTG`], [16, 11], ['left', 'right']);
  await SunmiPrinterLibrary.printColumnsText(['Total Recharge', `${resume.totalRecharge.toFixed(0)} HTG`], [16, 11], ['left', 'right']);
  await SunmiPrinterLibrary.printColumnsText(['Total Retrait', `${resume.totalRetrait.toFixed(0)} HTG`], [16, 11], ['left', 'right']);
  await SunmiPrinterLibrary.setAlignment('center');
  await SunmiPrinterLibrary.printText(SEPARATEUR);

  await SunmiPrinterLibrary.setAlignment('left');
  for (const t of transactions) {
    await SunmiPrinterLibrary.printColumnsText([t.ref_code, t.type], [16, 11], ['left', 'right']);
    await SunmiPrinterLibrary.printColumnsText([t.dateAffichee, `${t.montant.toFixed(0)} HTG`], [16, 11], ['left', 'right']);
  }
  await SunmiPrinterLibrary.setAlignment('center');
  await SunmiPrinterLibrary.printText(SEPARATEUR);

  await imprimerPied(entete.texteFiche);
}
