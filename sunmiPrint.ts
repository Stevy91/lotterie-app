import { Platform } from 'react-native';
import * as SunmiPrinterLibrary from '@mitsuharu/react-native-sunmi-printer-library';

import { TicketResponse } from './types';

const LARGEUR_PAPIER_PIXELS = 384; // papier 58mm
const SEPARATEUR = '********************************\n';

export interface EnteteRecu {
  nomCompagnie: string;
  adresse?: string | null;
  posId: string;
  vendeurNom: string;
  logoUrl?: string | null;
}

export interface LigneRapport {
  label: string;
  valeur: string;
}

// "L3 Auto".."L7 Auto" -> "Lo3".."Lo7", "MA Auto" -> "MA" (Marriage), tout
// le reste (BPaire, Reverse, P0-P9 Auto, Lo, 3 Chif...) -> "BO".
function abregerTypeJeu(nomTypeJeu: string): string {
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
    const reponse = await fetch(logoUrl);
    const blob = await reponse.blob();
    return await new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onerror = reject;
      // printImage attend l'URI de donnees complete ("data:image/...;base64,...").
      lecteur.onload = () => resolve((lecteur.result as string) ?? null);
      lecteur.readAsDataURL(blob);
    });
  } catch {
    // Une erreur de logo (reseau, format...) ne doit jamais bloquer l'impression.
    return null;
  }
}

async function verifierImprimante(): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error("L'impression sur l'imprimante Sunmi n'est disponible que sur Android.");
  }
  const pret = await SunmiPrinterLibrary.prepare();
  if (!pret) {
    throw new Error('Aucune imprimante Sunmi detectee sur cet appareil.');
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
  await SunmiPrinterLibrary.printText(`POS: ${entete.posId}\n`);
  await SunmiPrinterLibrary.printText(`Vendeur: ${entete.vendeurNom}\n`);
  if (entete.adresse) {
    await SunmiPrinterLibrary.printText(`Addresse : ${entete.adresse}\n`);
    await SunmiPrinterLibrary.printText(`Central: ${entete.nomCompagnie}\n`);
  }
  await SunmiPrinterLibrary.printText(`Date: ${formaterDate(new Date())}\n`);
  await SunmiPrinterLibrary.printText(SEPARATEUR);
}

async function imprimerPied(): Promise<void> {
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
      const numero = mise.numero_2 ? `${mise.numero}*${mise.numero_2}` : mise.numero;
      const montant = Number(mise.montant);
      const montantTexte = montant === 0 ? 'gratis' : `${montant.toFixed(2)} HTG`;

      await SunmiPrinterLibrary.printColumnsText(
        [abrev, numero, `=> ${montantTexte}`],
        [3, 9, 14],
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

  await imprimerPied();
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

  await imprimerPied();
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

  await imprimerPied();
}
