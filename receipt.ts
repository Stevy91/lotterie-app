import { TicketResponse } from './types';

export function genererRecuHtml(ticket: TicketResponse): string {
  const lignes = ticket.mises
    .map(
      (mise) => `
        <tr>
          <td>${mise.tirage.loterie.nom}</td>
          <td>${mise.type_jeu.nom}</td>
          <td>${mise.numero_2 ? `${mise.numero} x ${mise.numero_2}` : mise.numero}</td>
          <td>${Number(mise.montant).toFixed(2)}</td>
        </tr>
      `
    )
    .join('');

  return `
    <html>
      <body style="font-family: monospace; padding: 16px; width: 280px;">
        <h2 style="text-align:center; margin-bottom: 4px;">TICKET</h2>
        <p style="text-align:center; margin: 0;">${ticket.numero_ticket}</p>
        <p style="text-align:center; margin: 0 0 12px 0;">${new Date(ticket.created_at).toLocaleString()}</p>
        ${ticket.nom_client ? `<p>Client: ${ticket.nom_client}</p>` : ''}
        ${ticket.telephone_client ? `<p>Tel: ${ticket.telephone_client}</p>` : ''}
        <table style="width:100%; border-collapse: collapse; margin-top: 8px;">
          <thead>
            <tr>
              <th style="text-align:left;">Loterie</th>
              <th style="text-align:left;">Jeu</th>
              <th style="text-align:left;">No</th>
              <th style="text-align:left;">Mise</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
        <hr />
        <p style="text-align:right; font-weight:bold;">
          TOTAL: ${Number(ticket.montant_total).toFixed(2)}
        </p>
        <p style="text-align:center; margin-top: 16px;">Bonne chance !</p>
      </body>
    </html>
  `;
}
