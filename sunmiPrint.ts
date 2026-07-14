import { Platform } from 'react-native';
import SunmiPrinter, { AlignValue } from '@es-webdev/react-native-sunmi-printer';

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

// "MA Auto" -> "MA", "L3 Auto" -> "L3", "BPaire" -> "BP", "Lo" -> "Lo", "3 Chif" -> "3"
function abregerTypeJeu(nom: string): string {
  const premierMot = nom.trim().split(' ')[0];
  return premierMot.length > 3 ? premierMot.slice(0, 2) : premierMot;
}

function formaterDate(date: Date): string {
  return date.toLocaleString('fr-FR');
}

async function logoEnBase64(logoUrl: string): Promise<string | null> {
  try {
    const reponse = await fetch(logoUrl);
    const blob = await reponse.blob();
    return await new Promise((resolve, reject) => {
      const lecteur = new FileReader();
      lecteur.onerror = reject;
      lecteur.onload = () => {
        const resultat = lecteur.result as string;
        // printBitmap veut le base64 pur, sans le prefixe "data:image/...;base64,"
        resolve(resultat.split(',')[1] ?? null);
      };
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
  const disponible = await SunmiPrinter.hasPrinter();
  if (!disponible) {
    throw new Error('Aucune imprimante Sunmi detectee sur cet appareil.');
  }
}

/**
 * Entete commune a toutes les impressions : logo, "***Fiche Original***" (ou
 * le titre fourni), nom de la compagnie, POS, vendeur, adresse et date.
 */
async function imprimerEntete(entete: EnteteRecu, titre: string): Promise<void> {
  await SunmiPrinter.printerInit();

  if (entete.logoUrl) {
    const base64 = await logoEnBase64(entete.logoUrl);
    if (base64) {
      await SunmiPrinter.setAlignment(AlignValue.CENTER);
      await SunmiPrinter.printBitmap(base64, LARGEUR_PAPIER_PIXELS);
      await SunmiPrinter.lineWrap(1);
    }
  }

  await SunmiPrinter.setAlignment(AlignValue.CENTER);
  await SunmiPrinter.setFontWeight(true);
  await SunmiPrinter.printerText(`${titre}\n`);
  await SunmiPrinter.setFontSize(32);
  await SunmiPrinter.printerText(`${entete.nomCompagnie}\n`);
  await SunmiPrinter.setFontSize(24);
  await SunmiPrinter.setFontWeight(false);
  await SunmiPrinter.lineWrap(1);

  await SunmiPrinter.setAlignment(AlignValue.LEFT);
  await SunmiPrinter.printerText(`POS: ${entete.posId}\n`);
  await SunmiPrinter.printerText(`Vendeur: ${entete.vendeurNom}\n`);
  if (entete.adresse) {
    await SunmiPrinter.printerText(`Addresse : ${entete.adresse}\n`);
    await SunmiPrinter.printerText(`Central: ${entete.nomCompagnie}\n`);
  }
  await SunmiPrinter.printerText(`Date: ${formaterDate(new Date())}\n`);
  await SunmiPrinter.setAlignment(AlignValue.CENTER);
  await SunmiPrinter.printerText(SEPARATEUR);
}

async function imprimerPied(): Promise<void> {
  await SunmiPrinter.setAlignment(AlignValue.LEFT);
  await SunmiPrinter.printerText(`Impression: ${formaterDate(new Date())}\n`);
  await SunmiPrinter.lineWrap(3);
  await SunmiPrinter.cutPaper();
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
    await SunmiPrinter.lineWrap(1);
    await SunmiPrinter.printerText(`#ticket: ${ticket.numero_ticket}\n`);

    const zonesImprimees = new Set<string>();

    for (const mise of ticket.mises) {
      const zoneNom = mise.tirage.loterie.nom;
      if (!zonesImprimees.has(zoneNom)) {
        zonesImprimees.add(zoneNom);
        await SunmiPrinter.printerText(`${zoneNom}\n`);
      }

      const abrev = abregerTypeJeu(mise.type_jeu.nom);
      const numero = mise.numero_2 ? `${mise.numero}*${mise.numero_2}` : mise.numero;
      const montant = Number(mise.montant);
      const montantTexte = montant === 0 ? 'gratis' : `${montant.toFixed(2)} HTG`;

      await SunmiPrinter.printColumnsText(
        [abrev, numero, `=> ${montantTexte}`],
        [4, 10, 18],
        [AlignValue.LEFT, AlignValue.LEFT, AlignValue.RIGHT]
      );
    }

    await SunmiPrinter.printerText(SEPARATEUR);
    await SunmiPrinter.setFontWeight(true);
    await SunmiPrinter.printColumnsText(
      ['Total =>', `${Number(ticket.montant_total).toFixed(2)} HTG`],
      [16, 16],
      [AlignValue.LEFT, AlignValue.RIGHT]
    );
    await SunmiPrinter.setFontWeight(false);
    await SunmiPrinter.printerText(SEPARATEUR);

    grandTotal += Number(ticket.montant_total);
  }

  if (tickets.length > 1) {
    await SunmiPrinter.lineWrap(1);
    await SunmiPrinter.setFontWeight(true);
    await SunmiPrinter.printColumnsText(
      ['Grand Total =>', `${grandTotal.toFixed(2)} HTG`],
      [16, 16],
      [AlignValue.LEFT, AlignValue.RIGHT]
    );
    await SunmiPrinter.setFontWeight(false);
    await SunmiPrinter.printerText(SEPARATEUR);
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

  await SunmiPrinter.setAlignment(AlignValue.LEFT);
  for (const ligne of lignes) {
    await SunmiPrinter.printColumnsText([ligne.label, ligne.valeur], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
  }
  await SunmiPrinter.setAlignment(AlignValue.CENTER);
  await SunmiPrinter.printerText(SEPARATEUR);

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

  await SunmiPrinter.setAlignment(AlignValue.LEFT);
  await SunmiPrinter.printColumnsText(['Solde', `${resume.balance.toFixed(0)} HTG`], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
  await SunmiPrinter.printColumnsText(['Total Recharge', `${resume.totalRecharge.toFixed(0)} HTG`], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
  await SunmiPrinter.printColumnsText(['Total Retrait', `${resume.totalRetrait.toFixed(0)} HTG`], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
  await SunmiPrinter.setAlignment(AlignValue.CENTER);
  await SunmiPrinter.printerText(SEPARATEUR);

  await SunmiPrinter.setAlignment(AlignValue.LEFT);
  for (const t of transactions) {
    await SunmiPrinter.printColumnsText([t.ref_code, t.type], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
    await SunmiPrinter.printColumnsText([t.dateAffichee, `${t.montant.toFixed(0)} HTG`], [18, 14], [AlignValue.LEFT, AlignValue.RIGHT]);
  }
  await SunmiPrinter.setAlignment(AlignValue.CENTER);
  await SunmiPrinter.printerText(SEPARATEUR);

  await imprimerPied();
}
