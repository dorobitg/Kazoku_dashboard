/**
 * Kazoku · backend del dashboard familiar
 * ------------------------------------------------------------------
 * Google Apps Script que fa de pont entre el dashboard (GitHub Pages)
 * i els teus serveis de Google: Calendar, Tasks, Drive (fotos),
 * més Open-Meteo (temps) i canals RSS.
 *
 * Respon en JSONP perquè el Safari d'iOS 12 no tingui problemes de CORS.
 *
 * IMPORTANT: aquest fitxer viu al teu projecte d'Apps Script, no a GitHub.
 * El token i la teva ubicació no han d'aparèixer mai al repositori públic.
 */

var CONFIG = {
  // Clau secreta compartida amb el dashboard. Canvia-la per una cadena llarga i aleatòria.
  TOKEN: 'CANVIA-AQUEST-TOKEN',

  // Calendaris a mostrar (IDs). Buit = tots els calendaris visibles del teu compte.
  // L'ID es troba a Google Calendar > Configuració del calendari > "ID del calendari".
  CALENDAR_IDS: [],

  // Llista de Google Tasks. '@default' = la llista principal ("Les meves tasques").
  TASKLIST_ID: '@default',

  // Carpeta de Google Drive amb les fotos (l'ID és la part final de l'URL de la carpeta).
  PHOTO_FOLDER_ID: '',
  // Cada quantes hores canvia la foto (24 = foto del dia).
  PHOTO_ROTATE_HOURS: 24,

  // Ubicació per al temps (2 decimals és prou precís).
  LAT: 41.39,
  LON: 2.17,
  TIMEZONE: 'Europe/Madrid',

  // Canals RSS o Atom.
  FEEDS: [
    { name: 'Exemple', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' }
  ],
  RSS_MAX_ITEMS: 15
};

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (!p.k || p.k !== CONFIG.TOKEN) throw new Error('unauthorized');
    out = { ok: true, data: route_(p) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  var json = JSON.stringify(out);
  var cb = p.callback;
  if (cb && /^[A-Za-z0-9_.$]{1,64}$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function route_(p) {
  switch (p.action) {
    case 'calendar':   return getCalendar_(Number(p.start), Number(p.end));
    case 'tasks':      return listTasks_();
    case 'addTask':    return addTask_(p.title);
    case 'toggleTask': return toggleTask_(p.id);
    case 'deleteTask': return deleteTask_(p.id);
    case 'weather':    return getWeather_();
    case 'rss':        return getRss_();
    case 'photo':      return getPhoto_();
    case 'ping':       return { now: Date.now() };
    default: throw new Error('unknown action');
  }
}

/* ------------------------------------------------------------------ */
/* Calendari                                                           */
/* ------------------------------------------------------------------ */

function getCalendar_(start, end) {
  if (!start || !end || end <= start) throw new Error('bad range');
  if (end - start > 50 * 864e5) end = start + 50 * 864e5;

  var key = 'cal_' + start + '_' + end;
  var cached = cacheGet_(key);
  if (cached) return cached;

  var cals;
  if (CONFIG.CALENDAR_IDS.length) {
    cals = CONFIG.CALENDAR_IDS.map(function (id) { return CalendarApp.getCalendarById(id); })
      .filter(function (c) { return !!c; });
  } else {
    cals = CalendarApp.getAllCalendars().filter(function (c) { return !c.isHidden(); });
  }

  var from = new Date(start), to = new Date(end), events = [];
  var calendars = cals.map(function (cal, i) {
    cal.getEvents(from, to).forEach(function (ev) {
      var allDay = ev.isAllDayEvent();
      var s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      var en = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
      events.push({
        t: ev.getTitle() || '(sense títol)',
        s: s.getTime(),
        e: en.getTime(),
        a: allDay,
        c: i,
        l: ev.getLocation() || ''
      });
    });
    return { name: cal.getName(), i: i };
  });

  events.sort(function (x, y) { return (x.a === y.a) ? x.s - y.s : (x.a ? -1 : 1); });
  var res = { calendars: calendars, events: events };
  cachePut_(key, res, 300);
  return res;
}

/* ------------------------------------------------------------------ */
/* Tasques (servei avançat "Tasks" activat a appsscript.json)          */
/* ------------------------------------------------------------------ */

function listTasks_() {
  var items = [], pageToken = null;
  do {
    var res = Tasks.Tasks.list(CONFIG.TASKLIST_ID, {
      showCompleted: true, showHidden: true, maxResults: 100, pageToken: pageToken
    });
    items = items.concat(res.items || []);
    pageToken = res.nextPageToken;
  } while (pageToken && items.length < 300);

  var dayAgo = Date.now() - 24 * 36e5;
  var tasks = items.filter(function (t) {
    if (!t.title || t.deleted) return false;
    if (t.status !== 'completed') return true;
    return t.completed && new Date(t.completed).getTime() > dayAgo;
  }).map(function (t) {
    return {
      id: t.id,
      title: t.title,
      done: t.status === 'completed',
      due: t.due ? new Date(t.due).getTime() : null,
      pos: t.position || ''
    };
  });

  tasks.sort(function (a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0;
  });
  return { tasks: tasks };
}

function addTask_(title) {
  title = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) throw new Error('empty title');
  Tasks.Tasks.insert({ title: title }, CONFIG.TASKLIST_ID);
  return listTasks_();
}

function toggleTask_(id) {
  if (!id) throw new Error('missing id');
  var t = Tasks.Tasks.get(CONFIG.TASKLIST_ID, id);
  if (t.status === 'completed') {
    Tasks.Tasks.patch({ status: 'needsAction', completed: null }, CONFIG.TASKLIST_ID, id);
  } else {
    Tasks.Tasks.patch({ status: 'completed' }, CONFIG.TASKLIST_ID, id);
  }
  return listTasks_();
}

function deleteTask_(id) {
  if (!id) throw new Error('missing id');
  Tasks.Tasks.remove(CONFIG.TASKLIST_ID, id);
  return listTasks_();
}

/* ------------------------------------------------------------------ */
/* Temps (Open-Meteo, sense clau)                                      */
/* ------------------------------------------------------------------ */

function getWeather_() {
  var cached = cacheGet_('weather');
  if (cached) return cached;

  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + CONFIG.LAT + '&longitude=' + CONFIG.LON
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
    + '&timezone=' + encodeURIComponent(CONFIG.TIMEZONE) + '&forecast_days=5';
  var r = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  var d = r.daily || {};
  var res = {
    now: {
      temp: r.current.temperature_2m,
      feels: r.current.apparent_temperature,
      code: r.current.weather_code,
      day: r.current.is_day === 1,
      hum: r.current.relative_humidity_2m,
      wind: r.current.wind_speed_10m
    },
    days: (d.time || []).map(function (date, i) {
      return {
        date: date,
        code: d.weather_code[i],
        max: d.temperature_2m_max[i],
        min: d.temperature_2m_min[i],
        rain: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
        sunrise: d.sunrise ? d.sunrise[i] : null,
        sunset: d.sunset ? d.sunset[i] : null
      };
    })
  };
  cachePut_('weather', res, 1200);
  return res;
}

/* ------------------------------------------------------------------ */
/* RSS / Atom                                                          */
/* ------------------------------------------------------------------ */

function getRss_() {
  var cached = cacheGet_('rss');
  if (cached) return cached;

  var all = [];
  var reqs = CONFIG.FEEDS.map(function (f) {
    return { url: f.url, muteHttpExceptions: true, followRedirects: true,
             headers: { 'User-Agent': 'Mozilla/5.0 (Kazoku dashboard)' } };
  });
  var responses = UrlFetchApp.fetchAll(reqs);
  responses.forEach(function (resp, i) {
    if (resp.getResponseCode() >= 300) return;
    try {
      all = all.concat(parseFeed_(resp.getContentText(), CONFIG.FEEDS[i].name));
    } catch (err) { /* canal trencat: s'ignora */ }
  });

  all.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
  var res = { items: all.slice(0, CONFIG.RSS_MAX_ITEMS) };
  cachePut_('rss', res, 1800);
  return res;
}

function parseFeed_(xml, source) {
  var items = [];
  try {
    var root = XmlService.parse(xml).getRootElement();
    var atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');
    if (root.getName() === 'feed') {
      root.getChildren('entry', atom).forEach(function (en) {
        items.push(item_(source, en.getChildText('title', atom),
          en.getChildText('updated', atom) || en.getChildText('published', atom),
          en.getChildText('summary', atom) || en.getChildText('content', atom)));
      });
    } else {
      var channel = root.getChild('channel') || root;
      channel.getChildren('item').forEach(function (it) {
        items.push(item_(source, it.getChildText('title'), it.getChildText('pubDate'),
          it.getChildText('description')));
      });
    }
  } catch (err) {
    // XML mal format (passa sovint): extracció tolerant amb expressions regulars.
    var re = /<(item|entry)\b[\s\S]*?<\/\1>/gi, m;
    while ((m = re.exec(xml)) && items.length < 30) {
      var block = m[0];
      items.push(item_(source, tag_(block, 'title'),
        tag_(block, 'pubDate') || tag_(block, 'updated') || tag_(block, 'published'),
        tag_(block, 'description') || tag_(block, 'summary')));
    }
  }
  return items.filter(function (x) { return x.title; });
}

function tag_(block, name) {
  var m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(block);
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : '';
}

function item_(source, title, date, summary) {
  var d = date ? new Date(date) : null;
  return {
    source: source,
    title: clean_(title, 160),
    date: d && !isNaN(d.getTime()) ? d.getTime() : null,
    summary: clean_(summary, 220)
  };
}

function clean_(s, max) {
  s = String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
}

/* ------------------------------------------------------------------ */
/* Foto del dia (carpeta de Google Drive)                              */
/* ------------------------------------------------------------------ */
/* Google va tancar l'accés de lectura als àlbums de Google Fotos per a
 * apps de tercers el març de 2025. Per això les fotos surten d'una carpeta
 * de Drive (pots copiar-hi un àlbum o fer que el mòbil hi pugi fotos).    */

function getPhoto_() {
  if (!CONFIG.PHOTO_FOLDER_ID) return { none: true };

  var ids = cacheGet_('photo_ids');
  if (!ids) {
    ids = [];
    var files = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID).getFiles();
    while (files.hasNext() && ids.length < 2000) {
      var f = files.next();
      if (/^image\//.test(f.getMimeType())) ids.push(f.getId());
    }
    ids.sort();
    cachePut_('photo_ids', ids, 6 * 3600);
  }
  if (!ids.length) return { none: true };

  var period = Math.floor(Date.now() / (CONFIG.PHOTO_ROTATE_HOURS * 36e5));
  var id = ids[(period * 7919) % ids.length];
  var file = DriveApp.getFileById(id);
  var token = ScriptApp.getOAuthToken();

  var blob = null, taken = null;
  try {
    var meta = JSON.parse(UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink,imageMediaMetadata(time),createdTime',
      { headers: { Authorization: 'Bearer ' + token } }).getContentText());
    taken = (meta.imageMediaMetadata && meta.imageMediaMetadata.time) || meta.createdTime || null;
    if (meta.thumbnailLink) {
      var big = meta.thumbnailLink.replace(/=s\d+$/, '=s1400');
      var r = UrlFetchApp.fetch(big, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (r.getResponseCode() === 200) blob = r.getBlob();
    }
  } catch (err) { /* recurs al fitxer original */ }

  if (!blob) {
    blob = file.getSize() < 4 * 1024 * 1024 ? file.getBlob() : file.getThumbnail();
  }

  return {
    id: id,
    period: period,
    hours: CONFIG.PHOTO_ROTATE_HOURS,
    name: file.getName(),
    taken: taken,
    mime: blob.getContentType() || 'image/jpeg',
    data: Utilities.base64Encode(blob.getBytes())
  };
}

/* ------------------------------------------------------------------ */
/* Utilitats                                                           */
/* ------------------------------------------------------------------ */

function cacheGet_(key) {
  try {
    var v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (err) { return null; }
}

function cachePut_(key, value, seconds) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(value), seconds); } catch (err) { /* massa gran */ }
}

/** Executa'l un cop des de l'editor per autoritzar tots els permisos i comprovar la configuració. */
function provaConfiguracio() {
  var now = Date.now();
  Logger.log('Calendari: %s esdeveniments', getCalendar_(now, now + 7 * 864e5).events.length);
  Logger.log('Tasques: %s', listTasks_().tasks.length);
  Logger.log('Temps: %s °C', getWeather_().now.temp);
  Logger.log('RSS: %s articles', getRss_().items.length);
  var ph = getPhoto_();
  Logger.log('Foto: %s', ph.none ? 'cap carpeta configurada' : ph.name);
}
