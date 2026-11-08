/**
 * Kazoku · preu de la llum (PVPC, tarifa 2.0TD, Península)
 * ------------------------------------------------------------------
 * Fitxer separat: afegeix-lo al projecte d'Apps Script com a fitxer nou
 * ("+" > Script > "Energia") i afegeix aquesta línia dins de route_() a Code.gs:
 *
 *     case 'energy':     return getEnergy_();
 *
 * Fonts públiques de Red Eléctrica (sense clau):
 *   1. apidatos.ree.es  (indicador PVPC, €/MWh)
 *   2. api.esios.ree.es/archives/70  (fitxer diari del PVPC, camp PCB)
 * Si la primera falla, es prova la segona.
 */

var ENERGY_TZ = 'Europe/Madrid';

function getEnergy_() {
  var day = Utilities.formatDate(new Date(), ENERGY_TZ, 'yyyy-MM-dd');
  var key = 'energy_' + day;
  var cached = cacheGet_(key);
  if (cached) return cached;

  var hours = null, source = '';
  try { hours = energyFromApidatos_(day); source = 'apidatos.ree.es'; } catch (e) { hours = null; }
  if (!hours || hours.length < 20) {
    try { hours = energyFromEsiosArchive_(day); source = 'esios.ree.es'; } catch (e) { hours = null; }
  }
  if (!hours || hours.length < 20) throw new Error('energy unavailable');

  var res = { day: day, unit: '€/kWh', source: source, hours: rankTiers_(hours) };
  cachePut_(key, res, 3 * 3600);
  return res;
}

/** apidatos.ree.es → [{h: 0..23, p: €/kWh}] (mitjana horària si les dades són quart-horàries). */
function energyFromApidatos_(day) {
  var url = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
    + '?start_date=' + day + 'T00:00&end_date=' + day + 'T23:59&time_trunc=hour';
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
  if (r.getResponseCode() !== 200) throw new Error('apidatos ' + r.getResponseCode());
  var json = JSON.parse(r.getContentText());
  var series = null;
  (json.included || []).forEach(function (s) {
    var t = (s.attributes && s.attributes.title) || s.type || '';
    if (!series && (String(s.id) === '1001' || /PVPC/i.test(t))) series = s;
  });
  if (!series) throw new Error('no PVPC series');
  return groupByHour_((series.attributes.values || []).map(function (v) {
    return { d: new Date(v.datetime), p: Number(v.value) / 1000 };
  }));
}

/** api.esios.ree.es/archives/70 → [{h, p}] (camp PCB, en €/MWh amb coma decimal). */
function energyFromEsiosArchive_(day) {
  var url = 'https://api.esios.ree.es/archives/70/download_json?locale=es&date=' + day;
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('esios ' + r.getResponseCode());
  var rows = JSON.parse(r.getContentText()).PVPC || [];
  return rows.map(function (row) {
    return { h: parseInt(String(row.Hora).split('-')[0], 10), p: parseFloat(String(row.PCB).replace(',', '.')) / 1000 };
  }).filter(function (x) { return !isNaN(x.h) && !isNaN(x.p); });
}

function groupByHour_(points) {
  var acc = {};
  points.forEach(function (pt) {
    if (isNaN(pt.p) || isNaN(pt.d.getTime())) return;
    var h = Number(Utilities.formatDate(pt.d, ENERGY_TZ, 'H'));
    if (!acc[h]) acc[h] = { s: 0, n: 0 };
    acc[h].s += pt.p; acc[h].n++;
  });
  return Object.keys(acc).map(function (h) {
    return { h: Number(h), p: acc[h].s / acc[h].n };
  }).sort(function (a, b) { return a.h - b.h; });
}

/** Terços per preu: 0 = barat (verd), 1 = mig (groc), 2 = car (vermell). */
function rankTiers_(hours) {
  var sorted = hours.slice().sort(function (a, b) { return a.p - b.p; });
  var n = sorted.length;
  sorted.forEach(function (x, i) { x.t = i < Math.round(n / 3) ? 0 : i < Math.round(2 * n / 3) ? 1 : 2; });
  return hours.map(function (x) { return { h: x.h, p: Math.round(x.p * 10000) / 10000, t: x.t }; });
}

/** Prova manual des de l'editor. */
function provaEnergia() {
  var e = getEnergy_();
  Logger.log('Font: %s · %s hores', e.source, e.hours.length);
  e.hours.forEach(function (x) { Logger.log('%s h  %s €/kWh  %s', x.h, x.p.toFixed(4), ['verd', 'groc', 'vermell'][x.t]); });
}
