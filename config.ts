// Tunnel Cloudflare (protocole http2/TCP, plus stable que QUIC sur ce reseau).
// Le port 80 en LAN a ete teste et echoue systematiquement (McAfee Web Protection
// intercepte probablement le port 80) ; le port 8010 en LAN reste bloque par le
// routeur/pare-feu. Le tunnel est la seule methode verifiee fiable pour l'instant.
export const API_URL = 'https://shslotto.net/api';
