import { TicketResponse } from './types';
import { abregerMise, EnteteRecu } from './sunmiPrint';

/** Echappe le HTML : un nom de compagnie avec & ou < casserait la page. */
function e(valeur: unknown): string {
  return String(valeur ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function formaterDate(date: Date): string {
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${jj}/${mm}/${date.getFullYear()}, ${hh}:${mi}:${ss}`;
}

/**
 * Reproduit la fiche THERMIQUE (voir imprimerFichesSunmi) en HTML, pour le PDF
 * partage au client : meme entete (logo, compagnie, POS, vendeur, adresses,
 * telephones, date), memes lignes abregees, meme pied de page.
 *
 * L'entete est optionnelle : sans elle (repli d'impression), on retombe sur une
 * fiche minimale plutot que d'echouer.
 */
export function genererRecuHtml(ticket: TicketResponse, entete?: EnteteRecu): string {
  const dateCreation = ticket.created_at ? new Date(ticket.created_at) : new Date();
  const zoneNom = ticket.mises[0]?.tirage.loterie.nom ?? '';

  const misesJouees = ticket.mises.filter((m) => !m.mariage_bonus);
  const mariagesBonus = ticket.mises.filter((m) => m.mariage_bonus);

  const ligne = (mise: TicketResponse['mises'][number]) => {
    const suffixe = mise.option_combinaison ? `(${mise.option_combinaison})` : '';
    const numero = mise.numero_2 ? `${mise.numero}*${mise.numero_2}` : `${mise.numero}${suffixe}`;
    const montant = Number(mise.montant);
    const texte = montant === 0 ? 'gratis' : `${montant.toFixed(2)} HTG`;

    return `<tr>
      <td class="jeu">${e(abregerMise(mise))}</td>
      <td class="numero">${e(numero)}</td>
      <td class="montant">=&gt; ${e(texte)}</td>
    </tr>`;
  };

  const telAgent = entete?.telephoneAgent?.trim();
  const telProprietaire = entete?.telephoneProprietaire?.trim();
  const ligneTel = telAgent || telProprietaire
    ? `<div>Tel: ${e(telAgent || '-')} / ${e(telProprietaire || '-')}</div>`
    : '';

  const blocEntete = entete
    ? `
      ${entete.logoUrl ? `<img class="logo" src="${e(entete.logoUrl)}" />` : ''}
      <div class="titre">***Fiche Original***</div>
      <div class="compagnie">${e(entete.nomCompagnie)}</div>
      <div class="infos">
        <div>POS: ${e(entete.posId)}</div>
        <div>Vendeur: ${e(entete.vendeurNom)}</div>
        <div>Addresse : ${e(entete.adresseAgent || '-')}</div>
        <div>Central: ${e(entete.adresseProprietaire || '-')}</div>
        ${ligneTel}
        <div>Date: ${e(formaterDate(dateCreation))}</div>
      </div>
    `
    : `<div class="titre">***Fiche Original***</div>
       <div class="infos"><div>Date: ${e(formaterDate(dateCreation))}</div></div>`;

  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body>
    <style>
      /* Largeur d'un rouleau thermique 58mm : le PDF ressemble au papier. */
      @page { size: 58mm auto; margin: 0; }
      body {
        font-family: 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.45;
        color: #000;
        margin: 0;
        padding: 10px 8px;
        width: 58mm;
        box-sizing: border-box;
      }
      .logo { display: block; margin: 0 auto 6px; max-width: 60%; height: auto; }
      .titre { text-align: center; font-weight: bold; }
      .compagnie { text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 6px; }
      .infos { text-align: center; }
      .separateur { margin: 6px 0; word-break: break-all; }
      .ticket { text-align: center; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 1px 0; vertical-align: top; }
      .jeu { width: 15%; }
      .numero { width: 40%; }
      .montant { width: 45%; text-align: right; white-space: nowrap; }
      .sousTitre { text-align: center; font-weight: bold; margin-top: 4px; }
      .total { display: flex; justify-content: space-between; font-weight: bold; }
      .pied { text-align: center; margin-top: 8px; }
      .impression { margin-top: 6px; font-size: 11px; }
    </style>

    ${blocEntete}

    <div class="separateur">********************************</div>

    <div class="ticket">#ticket: ${e(ticket.numero_ticket)}</div>
    <div class="ticket">${e(zoneNom)}</div>

    ${ticket.nom_client ? `<div class="infos">Client: ${e(ticket.nom_client)}</div>` : ''}
    ${ticket.telephone_client ? `<div class="infos">Tel client: ${e(ticket.telephone_client)}</div>` : ''}

    <table>${misesJouees.map(ligne).join('')}</table>

    ${mariagesBonus.length > 0
      ? `<div class="sousTitre">--- Mariage Gratuit ---</div>
         <table>${mariagesBonus.map(ligne).join('')}</table>`
      : ''}

    <div class="separateur">********************************</div>
    <div class="total"><span>Total =&gt;</span><span>${Number(ticket.montant_total).toFixed(2)} HTG</span></div>
    <div class="separateur">********************************</div>

    <div class="ticket">${e(ticket.numero_ticket)}</div>

    ${entete?.texteFiche ? `<div class="pied">${e(entete.texteFiche)}</div>` : ''}
    <div class="impression">Impression: ${e(formaterDate(new Date()))}</div>
  </body>
</html>`;
}
