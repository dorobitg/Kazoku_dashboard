/* Adreça de l'Apps Script desplegat (la que acaba en /exec).
 * No és secreta: sense el token, l'script només respon "unauthorized".
 * El token NO va aquí: s'introdueix un sol cop a cada dispositiu. */
window.KAZOKU_API = 'https://script.google.com/macros/s/AKfycby1yuxhAdEjfyx8c7_PdulG2fLT4OlhoXVBH-7dC4r9vIfMEHI2ppoIZpBcKKTPMK0mZg/exec';

/* Vídeo en directe de YouTube. Pot ser:
 *   - l'identificador d'un vídeo o directe: '8VFra_zCzAA'
 *   - l'identificador d'un canal (comença per UC): mostra el directe actiu del canal
 * Deixa-ho buit ('') per amagar el vídeo. */
window.KAZOKU_VIDEO = '8VFra_zCzAA';
