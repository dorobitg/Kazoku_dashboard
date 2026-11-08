/**
 * Kazoku · botons de Smart Life (Tuya)
 * ------------------------------------------------------------------
 * Mostra al dashboard les escenes "Toca per executar" de Smart Life
 * i les executa quan es toca el botó.
 *
 * Instal·lació:
 *   1. Afegeix aquest fitxer al projecte d'Apps Script ("+" > Script > "Smartlife").
 *   2. Omple TUYA a sota amb les dades del teu projecte de iot.tuya.com.
 *   3. A Code.gs, dins de route_(), afegeix aquestes dues línies:
 *        case 'scenes':     return getScenes_();
 *        case 'runScene':   return runScene_(p.id);
 *   4. Executa provaSmartLife() des de l'editor i publica una versió nova.
 */

var TUYA = {
  ACCESS_ID: 'ENGANXA-AQUI-L-ACCESS-ID',
  ACCESS_SECRET: 'ENGANXA-AQUI-L-ACCESS-SECRET',

  // Centre de dades que t'ha funcionat a iot.tuya.com:
  //   'weaz' = Western Europe   ·   'eu' = Central Europe
  //   'us'   = Western America  ·   'ueaz' = Eastern America
  REGION: 'weaz',

  // Escenes a mostrar, en aquest ordre, pel nom exacte que tenen a Smart Life.
  // Buit = totes les escenes "Toca per executar" actives.
  SCENES: [],

  // Opcional: si l'escena no es troba sola, l'ID de la casa (provaSmartLife() el mostra).
  HOME_ID: ''
};

var TUYA_HOSTS = {
  eu: 'https://openapi.tuyaeu.com',
  weaz: 'https://openapi-weaz.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  ueaz: 'https://openapi-ueaz.tuyaus.com'
};

/* ------------------------------------------------------------------ */
/* Accions per al dashboard                                            */
/* ------------------------------------------------------------------ */

function getScenes_() {
  if (!TUYA.ACCESS_ID || /ENGANXA/.test(TUYA.ACCESS_ID)) return { none: true, scenes: [] };
  var cached = cacheGet_('tuya_scenes');
  if (cached) return cached;

  var home = tuyaHomeId_();
  var list = tuyaRequest_('GET', '/v1.0/homes/' + home + '/scenes', null, null) || [];
  var scenes = list.filter(function (s) { return s.enabled !== false; })
    .map(function (s) { return { id: String(s.scene_id), name: String(s.name || '').trim() }; });

  if (TUYA.SCENES.length) {
    var byName = {};
    scenes.forEach(function (s) { byName[s.name.toLowerCase()] = s; });
    scenes = TUYA.SCENES.map(function (n) { return byName[String(n).trim().toLowerCase()]; })
      .filter(function (s) { return !!s; });
  }

  var res = { scenes: scenes.slice(0, 12) };
  cachePut_('tuya_scenes', res, 600);
  return res;
}

function runScene_(id) {
  id = String(id || '');
  // Només s'executen escenes que el dashboard té a la llista.
  var known = getScenes_().scenes.some(function (s) { return s.id === id; });
  if (!known) throw new Error('unknown scene');
  tuyaRequest_('POST', '/v1.0/homes/' + tuyaHomeId_() + '/scenes/' + id + '/trigger', null, null);
  return { ok: true, id: id };
}

/* ------------------------------------------------------------------ */
/* Casa (home_id) de Smart Life                                        */
/* ------------------------------------------------------------------ */

function tuyaHomeId_() {
  if (TUYA.HOME_ID) return String(TUYA.HOME_ID);
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('tuya_home_id');
  if (saved) return saved;

  // L'usuari de Smart Life es dedueix dels aparells vinculats al projecte.
  var devs = tuyaRequest_('GET', '/v1.0/iot-01/associated-users/devices', { size: 20 }, null);
  var list = (devs && (devs.devices || devs.list)) || [];
  var uid = null;
  for (var i = 0; i < list.length && !uid; i++) if (list[i].uid) uid = list[i].uid;
  if (!uid) throw new Error('tuya: cap aparell vinculat (revisa Link App Account)');

  var homes = tuyaRequest_('GET', '/v1.0/users/' + uid + '/homes', null, null) || [];
  if (!homes.length) throw new Error('tuya: cap casa trobada');
  var home = String(homes[0].home_id);
  props.setProperty('tuya_home_id', home);
  return home;
}

/* ------------------------------------------------------------------ */
/* Client de l'API de Tuya (signatura HMAC-SHA256)                     */
/* ------------------------------------------------------------------ */

function tuyaRequest_(method, path, query, body, retried) {
  var token = path === '/v1.0/token' ? '' : tuyaToken_();
  var res = tuyaFetch_(method, path, query, body, token);
  if (!res.success && !retried && (res.code === 1010 || res.code === 1011)) {
    CacheService.getScriptCache().remove('tuya_token');   // token caducat: es demana de nou
    return tuyaRequest_(method, path, query, body, true);
  }
  if (!res.success) throw new Error('tuya ' + res.code + ': ' + res.msg);
  return res.result;
}

function tuyaToken_() {
  var cache = CacheService.getScriptCache();
  var t = cache.get('tuya_token');
  if (t) return t;
  var res = tuyaFetch_('GET', '/v1.0/token', { grant_type: 1 }, null, '');
  if (!res.success) throw new Error('tuya token ' + res.code + ': ' + res.msg);
  var ttl = Math.max(60, Math.min(21600, (res.result.expire_time || 7200) - 120));
  cache.put('tuya_token', res.result.access_token, ttl);
  return res.result.access_token;
}

function tuyaFetch_(method, path, query, body, token) {
  var host = TUYA_HOSTS[TUYA.REGION];
  if (!host) throw new Error('tuya: REGION desconeguda');

  var qs = '';
  if (query) {
    qs = Object.keys(query).sort().map(function (k) { return k + '=' + query[k]; }).join('&');
  }
  var url = path + (qs ? '?' + qs : '');
  var bodyStr = body ? JSON.stringify(body) : '';
  var t = String(Date.now());

  var stringToSign = [method, hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bodyStr, Utilities.Charset.UTF_8)), '', url].join('\n');
  var sign = hex_(Utilities.computeHmacSha256Signature(TUYA.ACCESS_ID + token + t + stringToSign, TUYA.ACCESS_SECRET, Utilities.Charset.UTF_8)).toUpperCase();

  var headers = { client_id: TUYA.ACCESS_ID, sign: sign, t: t, sign_method: 'HMAC-SHA256' };
  if (token) headers.access_token = token;

  var opts = { method: method.toLowerCase(), headers: headers, muteHttpExceptions: true };
  if (bodyStr) { opts.payload = bodyStr; opts.contentType = 'application/json'; }
  var r = UrlFetchApp.fetch(host + url, opts);
  try { return JSON.parse(r.getContentText()); }
  catch (e) { return { success: false, code: r.getResponseCode(), msg: 'resposta no vàlida' }; }
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/* ------------------------------------------------------------------ */
/* Prova manual des de l'editor                                        */
/* ------------------------------------------------------------------ */

function provaSmartLife() {
  PropertiesService.getScriptProperties().deleteProperty('tuya_home_id');
  CacheService.getScriptCache().remove('tuya_scenes');
  Logger.log('Casa: %s', tuyaHomeId_());
  var s = getScenes_().scenes;
  Logger.log('%s escenes:', s.length);
  s.forEach(function (x) { Logger.log('  · %s  (%s)', x.name, x.id); });
}
