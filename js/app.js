/* Kazoku · dashboard familiar
 * JavaScript ES5 pur: funciona al Safari d'iOS 12 (iPad mini 2) i a qualsevol navegador modern.
 * Configuració: obre la pàgina amb  #api=<URL de l'Apps Script>&k=<token>
 * Mode demostració: afegeix ?demo a l'URL.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Ajustos                                                             */
  /* ------------------------------------------------------------------ */

  var SETTINGS = {
    nightStart: 23,          // hora en què s'enfosqueix la pantalla
    nightEnd: 7,             // hora en què torna el mode de dia
    wakeMinutes: 5,          // minuts que es desperta en tocar la pantalla de nit
    refresh: {               // cada quant es refresca cada bloc (ms)
      tasks: 60e3,
      calendar: 10 * 60e3,
      weather: 30 * 60e3,
      rss: 30 * 60e3
    },
    forecastDays: 3,         // dies de previsió a la capçalera
    newsRotate: 20e3,        // canvi de pàgina de lectures
    idleReset: 3 * 60e3,     // torna a la vista "Dia" després d'aquest temps sense tocar
    reloadEvery: 6 * 36e5    // recàrrega completa preventiva (memòria d'iOS 12)
  };

  var DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
  var DAYS_AB = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
  var DAY_KANJI = ['日', '月', '火', '水', '木', '金', '土'];
  var MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost',
                'setembre', 'octubre', 'novembre', 'desembre'];
  var CAL_COLORS = ['var(--shu)', 'var(--asagi)', 'var(--sumi)', 'var(--kincha)', 'var(--sumi-2)'];

  var WMO = {
    0: ['Serè', '晴'], 1: ['Gairebé serè', '晴'], 2: ['Mig ennuvolat', '曇'], 3: ['Ennuvolat', '曇'],
    45: ['Boira', '霧'], 48: ['Boira gebradora', '霧'],
    51: ['Plugim feble', '雨'], 53: ['Plugim', '雨'], 55: ['Plugim intens', '雨'],
    56: ['Plugim gelat', '雨'], 57: ['Plugim gelat', '雨'],
    61: ['Pluja feble', '雨'], 63: ['Pluja', '雨'], 65: ['Pluja intensa', '雨'],
    66: ['Pluja gelada', '雨'], 67: ['Pluja gelada', '雨'],
    71: ['Neu feble', '雪'], 73: ['Neu', '雪'], 75: ['Neu intensa', '雪'], 77: ['Neu granulada', '雪'],
    80: ['Ruixats', '雨'], 81: ['Ruixats', '雨'], 82: ['Ruixats forts', '雨'],
    85: ['Ruixats de neu', '雪'], 86: ['Ruixats de neu', '雪'],
    95: ['Tempesta', '雷'], 96: ['Tempesta i calamarsa', '雷'], 99: ['Tempesta i calamarsa', '雷']
  };

  /* ------------------------------------------------------------------ */
  /* Utilitats                                                           */
  /* ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function deMonth(m) {
    var n = MONTHS[m];
    return (/^[aeiou]/.test(n) ? "d'" : 'de ') + n;
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mondayOf(d) { var s = startOfDay(d); return addDays(s, -((s.getDay() + 6) % 7)); }

  // Safari 12 interpreta "2026-10-27" com a UTC: es parseja a mà.
  function parseYmd(s) {
    var m = /^(\d{4})[-:](\d{2})[-:](\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function relTime(ms) {
    if (!ms) return '';
    var diff = Date.now() - ms, min = Math.round(diff / 60e3);
    if (min < 1) return 'ara';
    if (min < 60) return 'fa ' + min + ' min';
    var h = Math.round(min / 60);
    if (h < 24) return 'fa ' + h + ' h';
    var d = Math.round(h / 24);
    return d === 1 ? 'ahir' : 'fa ' + d + ' dies';
  }

  function on(el, ev, fn) { el.addEventListener(ev, fn, false); }

  function closest(el, cls, stop) {
    while (el && el !== stop) {
      if (el.classList && el.classList.contains(cls)) return el;
      el = el.parentNode;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Configuració i API (JSONP)                                          */
  /* ------------------------------------------------------------------ */

  var DEMO = /[?&]demo\b/.test(location.search);
  var cfg = readConfig();

  function readConfig() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem('kazoku.cfg') || '{}') || {}; } catch (e) { c = {}; }
    var h = (location.hash.replace(/^#/, '') + '&' + location.search.replace(/^\?/, '')).replace(/^&|&$/g, '');
    if (h) {
      var changed = false;
      h.split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i < 1) return;
        var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
        if ((k === 'api' || k === 'k') && v) { c[k] = v; changed = true; }
      });
      if (changed) { try { localStorage.setItem('kazoku.cfg', JSON.stringify(c)); } catch (e) {} }
    }
    if (window.KAZOKU_API) c.api = window.KAZOKU_API;
    return c;
  }

  var seq = 0;
  function api(action, params, cb) {
    if (DEMO) {
      setTimeout(function () {
        var r;
        try { r = window.KazokuDemo(action, params || {}); } catch (e) { setStatus(action, e); return cb(e); }
        setStatus(action, null);
        cb(null, r);
      }, 120);
      return;
    }
    var name = '__kz' + (++seq) + '_' + Date.now();
    var q = ['action=' + encodeURIComponent(action), 'k=' + encodeURIComponent(cfg.k),
             'callback=' + name, '_=' + Date.now()];
    if (params) {
      for (var p in params) {
        if (Object.prototype.hasOwnProperty.call(params, p)) q.push(p + '=' + encodeURIComponent(params[p]));
      }
    }
    var s = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { finish(new Error('timeout')); }, 30000);
    function finish(err, data) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window[name] = function () {};             // resposta tardana: s'ignora
      if (s.parentNode) s.parentNode.removeChild(s);
      setStatus(action, err);
      cb(err, data);
    }
    window[name] = function (res) {
      if (res && res.ok) finish(null, res.data);
      else finish(new Error((res && res.error) || 'error'));
    };
    s.onerror = function () { finish(new Error('network')); };
    s.src = cfg.api + (cfg.api.indexOf('?') < 0 ? '?' : '&') + q.join('&');
    document.body.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Estat de connexió                                                   */
  /* ------------------------------------------------------------------ */

  var errors = {};
  var lastOk = null;
  var inSetup = false;
  function setStatus(source, err) {
    if (err && err.message === 'unauthorized' && !inSetup && !DEMO) {
      // Token desat incorrecte o canviat: es torna a demanar.
      try { localStorage.removeItem('kazoku.cfg'); } catch (e) {}
      cfg.k = null;
      showSetup();
      return;
    }
    if (err) errors[source] = err.message;
    else { delete errors[source]; lastOk = new Date(); }
    var keys = Object.keys(errors);
    var el = $('status');
    var txt;
    if (keys.length) {
      var msg = errors[keys[0]];
      txt = msg === 'unauthorized' ? 'Token incorrecte: revisa la configuració'
          : msg === 'timeout' || msg === 'network' ? 'Sense connexió'
          : 'Error (' + keys[0] + '): ' + msg;
      if (lastOk) txt += ' · últim refresc ' + hm(lastOk);
      el.className = 'status err';
    } else {
      txt = (DEMO ? 'Mode demostració · ' : '') + 'Actualitzat ' + hm(lastOk || new Date());
      el.className = 'status';
    }
    el.innerHTML = '<i></i>' + esc(txt);
  }

  /* ------------------------------------------------------------------ */
  /* Rellotge, data i mode nit                                           */
  /* ------------------------------------------------------------------ */

  var lastMinute = -1, lastDay = '';
  var wakeUntil = 0;

  function tick() {
    var now = new Date();
    if (now.getMinutes() !== lastMinute) {
      lastMinute = now.getMinutes();
      $('clock').textContent = hm(now);
      updateNight(now);
    }
    var k = dayKey(now);
    if (k !== lastDay) {
      var first = !lastDay;
      lastDay = k;
      $('seal').textContent = DAY_KANJI[now.getDay()];
      var dn = DAYS[now.getDay()];
      $('date-main').textContent = dn.charAt(0).toUpperCase() + dn.slice(1);
      $('date-sub').textContent = now.getDate() + ' ' + deMonth(now.getMonth());
      if (!first) { loadCalendar(); renderWeather(); }
    }
  }

  function isNightHour(h) {
    return SETTINGS.nightStart > SETTINGS.nightEnd
      ? (h >= SETTINGS.nightStart || h < SETTINGS.nightEnd)
      : (h >= SETTINGS.nightStart && h < SETTINGS.nightEnd);
  }

  function updateNight(now) {
    var night = isNightHour(now.getHours()) && Date.now() > wakeUntil && !/[?&]day\b/.test(location.search);
    document.body.classList.toggle('night', night);
  }

  // De nit, el primer toc només desperta la pantalla.
  function wakeGuard(e) {
    if (!document.body.classList.contains('night')) return;
    e.preventDefault();
    e.stopPropagation();
    wakeUntil = Date.now() + SETTINGS.wakeMinutes * 60e3;
    updateNight(new Date());
    setTimeout(function () { updateNight(new Date()); }, SETTINGS.wakeMinutes * 60e3 + 1000);
  }

  /* ------------------------------------------------------------------ */
  /* Temps                                                               */
  /* ------------------------------------------------------------------ */

  var weather = null;

  function loadWeather() {
    api('weather', null, function (err, data) {
      if (!err && data) { weather = data; renderWeather(); }
    });
  }

  function wmo(code, isDay) {
    var w = WMO[code] || ['—', '天'];
    if (isDay === false && code <= 1) return [w[0], '夜'];
    return w;
  }

  function renderWeather() {
    if (!weather) return;
    var n = weather.now, w = wmo(n.code, n.day);
    var today = weather.days && weather.days[0];
    var html = '<div class="w-now"><div class="w-kanji">' + w[1] + '</div><div>' +
      '<div class="w-temp">' + Math.round(n.temp) + '<sup>°</sup></div>' +
      '<div class="w-desc">' + esc(w[0]) + '</div>' +
      (today ? '<div class="w-desc w-range">' + Math.round(today.max) + '° · ' + Math.round(today.min) + '°</div>' : '') +
      '</div></div><div class="w-days">';
    var todayKey = dayKey(new Date());
    var count = 0;
    (weather.days || []).forEach(function (d) {
      var dt = parseYmd(d.date);
      if (!dt || dayKey(dt) <= todayKey || count >= SETTINGS.forecastDays) return;
      count++;
      html += '<div class="w-day"><div class="d">' + DAYS_AB[dt.getDay()] + '</div>' +
        '<div class="k">' + wmo(d.code)[1] + '</div>' +
        '<div class="t">' + Math.round(d.max) + '° <span>' + Math.round(d.min) + '°</span></div></div>';
    });
    $('weather').innerHTML = html + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Calendari                                                           */
  /* ------------------------------------------------------------------ */

  var cal = { view: 'day', sel: null, data: null, rangeStart: null };
  var lastTouch = Date.now();

  function calRange() {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    var start = mondayOf(first);
    return { start: start, end: addDays(start, 42) };
  }

  function loadCalendar() {
    var r = calRange();
    api('calendar', { start: r.start.getTime(), end: r.end.getTime() }, function (err, data) {
      if (!err && data) { cal.data = data; cal.rangeStart = r.start; renderCalendar(); }
    });
  }

  function eventsOn(day) {
    if (!cal.data) return [];
    var d0 = startOfDay(day).getTime(), d1 = addDays(day, 1).getTime();
    return cal.data.events.filter(function (e) {
      return e.s < d1 && (e.e > d0 || e.s >= d0);
    });
  }

  function colorOf(e) { return CAL_COLORS[(e.c || 0) % CAL_COLORS.length]; }

  function evRow(e, day) {
    var d0 = startOfDay(day).getTime();
    var time, cls = 'ev-time';
    if (e.a) { time = 'Tot el dia'; cls += ' all'; }
    else if (e.s < d0) { time = '···'; }
    else { time = hm(new Date(e.s)); }
    var past = !e.a && e.e < Date.now();
    return '<div class="ev' + (past ? ' past' : '') + '">' +
      '<div class="' + cls + '">' + time + '</div>' +
      '<div class="ev-bar" style="background:' + colorOf(e) + '"></div>' +
      '<div class="ev-main"><div class="ev-title">' + esc(e.t) + '</div>' +
      (e.l ? '<div class="ev-loc">' + esc(e.l) + '</div>' : '') + '</div></div>';
  }

  function dayGroup(label, day, emptyText) {
    var evs = eventsOn(day);
    var html = '<div class="day-group"><div class="day-label">' + label + '</div>';
    if (!evs.length) html += '<div class="empty">' + emptyText + '</div>';
    evs.forEach(function (e) { html += evRow(e, day); });
    return html + '</div>';
  }

  function renderCalendar() {
    var body = $('cal-body');
    var tabs = $('cal-tabs').getElementsByTagName('button');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = tabs[i].getAttribute('data-view') === cal.view ? 'on' : '';
    }
    if (!cal.data) { body.innerHTML = '<div class="empty">Carregant…</div>'; return; }

    var today = startOfDay(new Date());
    var html = '';

    if (cal.view === 'day') {
      var tm = addDays(today, 1);
      html = dayGroup('Avui', today, 'Cap esdeveniment avui.') +
             dayGroup('Demà · ' + DAYS[tm.getDay()], tm, 'Res previst.');
    } else if (cal.view === 'week') {
      var mon = mondayOf(today);
      for (var d = 0; d < 7; d++) {
        var day = addDays(mon, d), evs = eventsOn(day);
        var rowCls = 'wk-row' + (sameDay(day, today) ? ' today' : day < today ? ' past' : '');
        html += '<div class="' + rowCls + '"><div class="wk-day"><div class="ab">' + DAYS_AB[day.getDay()] +
          '</div><div class="n">' + day.getDate() + '</div></div><div class="wk-evs">';
        var max = 3;
        evs.slice(0, max).forEach(function (e) {
          html += '<div class="wk-ev"><i style="background:' + colorOf(e) + '"></i>' +
            (e.a ? '' : '<b>' + hm(new Date(Math.max(e.s, day.getTime()))) + '</b>') + esc(e.t) + '</div>';
        });
        if (evs.length > max) html += '<div class="wk-more">+' + (evs.length - max) + ' més</div>';
        html += '</div></div>';
      }
    } else {
      var start = cal.rangeStart || calRange().start;
      var month = today.getMonth();
      var sel = cal.sel ? parseYmd(cal.sel) : today;
      html = '<div class="mo-grid">';
      for (var h = 1; h <= 7; h++) html += '<div class="mo-h">' + DAYS_AB[h % 7] + '</div>';
      for (var c = 0; c < 42; c++) {
        var cd = addDays(start, c), ce = eventsOn(cd);
        if (c === 35 && cd.getMonth() !== month) break;   // 6a fila buida
        var cls = 'mo-c' + (cd.getMonth() !== month ? ' out' : '') +
          (sameDay(cd, today) ? ' today' : '') + (sameDay(cd, sel) ? ' sel' : '');
        html += '<div class="' + cls + '" data-day="' + dayKey(cd) + '"><span class="n">' + cd.getDate() +
          '</span><div class="mo-dots">';
        ce.slice(0, 3).forEach(function (e) { html += '<i style="background:' + colorOf(e) + '"></i>'; });
        html += '</div></div>';
      }
      html += '</div><div class="mo-list">' +
        dayGroup(sameDay(sel, today) ? 'Avui' : DAYS[sel.getDay()] + ' ' + sel.getDate() + ' ' + deMonth(sel.getMonth()),
                 sel, 'Res aquest dia.') + '</div>';
    }
    body.innerHTML = '<div class="scroll">' + html + '</div>';
  }

  function initCalendar() {
    on($('cal-tabs'), 'click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute('data-view');
      if (!v) return;
      cal.view = v; cal.sel = null;
      renderCalendar();
    });
    on($('cal-body'), 'click', function (e) {
      var cell = closest(e.target, 'mo-c', this);
      if (!cell) return;
      cal.sel = cell.getAttribute('data-day');
      renderCalendar();
    });
    // Torna a la vista per defecte si ningú la toca.
    setInterval(function () {
      if (cal.view !== 'day' && Date.now() - lastTouch > SETTINGS.idleReset) {
        cal.view = 'day'; cal.sel = null; renderCalendar();
      }
    }, 30e3);
  }

  /* ------------------------------------------------------------------ */
  /* Tasques                                                             */
  /* ------------------------------------------------------------------ */

  var tasks = [];
  var busy = 0;
  var tmpId = 0;

  function loadTasks() {
    if (busy) return;
    api('tasks', null, function (err, data) {
      if (!err && data && !busy) { tasks = data.tasks; renderTasks(); }
    });
  }

  function mutate(action, params, localChange) {
    localChange();
    renderTasks();
    busy++;
    api(action, params, function (err, data) {
      busy--;
      if (!err && data) { if (!busy) { tasks = data.tasks; renderTasks(); } }
      else if (!busy) loadTasks();
    });
  }

  function renderTasks() {
    var pending = 0, html = '';
    var today = startOfDay(new Date()).getTime();
    tasks.forEach(function (t) {
      if (!t.done) pending++;
      var due = '';
      if (t.due && !t.done) {
        var dd = new Date(t.due);
        var dl = new Date(dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()); // Tasks desa la data a 00:00 UTC
        var late = dl.getTime() < today;
        due = '<span class="task-due' + (late ? ' late' : '') + '">' +
          (dl.getTime() === today ? 'Avui' : DAYS_AB[dl.getDay()] + ' ' + dl.getDate() + ' ' + deMonth(dl.getMonth())) +
          '</span>';
      }
      html += '<li class="task' + (t.done ? ' done' : '') + (t.pending ? ' pending' : '') + '" data-id="' + esc(t.id) + '">' +
        '<button class="task-check"><span class="box"></span><span class="task-title">' + esc(t.title) + due + '</span></button>' +
        '<button class="task-del" aria-label="Esborra">×</button></li>';
    });
    if (!tasks.length) html = '<li class="empty">Cap tasca. Bona feina.</li>';
    $('task-list').innerHTML = html;
    $('task-count').textContent = pending ? pending + (pending === 1 ? ' pendent' : ' pendents') : '';
  }

  function findTask(id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  function initTasks() {
    on($('task-form'), 'submit', function (e) {
      e.preventDefault();
      var input = $('task-input');
      var title = input.value.replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
      if (!title) return;
      input.value = '';
      input.blur();
      mutate('addTask', { title: title }, function () {
        var firstDone = 0;
        while (firstDone < tasks.length && !tasks[firstDone].done) firstDone++;
        tasks.splice(firstDone, 0, { id: 'tmp' + (++tmpId), title: title, done: false, pending: true });
      });
    });

    var armed = null, armTimer = null;
    function disarm() {
      if (armed) { armed.className = 'task-del'; armed.textContent = '×'; }
      armed = null; clearTimeout(armTimer);
    }

    on($('task-list'), 'click', function (e) {
      var li = closest(e.target, 'task', this);
      if (!li) return;
      var id = li.getAttribute('data-id');
      var t = findTask(id);
      if (!t || t.pending) return;

      var del = closest(e.target, 'task-del', li);
      if (del) {
        if (armed === del) {
          disarm();
          mutate('deleteTask', { id: id }, function () { tasks = tasks.filter(function (x) { return x.id !== id; }); });
        } else {
          disarm();
          armed = del; del.className = 'task-del arm'; del.textContent = 'Esborrar';
          armTimer = setTimeout(disarm, 3500);
        }
        return;
      }
      if (closest(e.target, 'task-check', li)) {
        disarm();
        mutate('toggleTask', { id: id }, function () { t.done = !t.done; });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Foto                                                                */
  /* ------------------------------------------------------------------ */

  var photo = { src: null, nextAt: 0 };

  function loadPhoto() {
    api('photo', null, function (err, data) {
      if (err || !data) { photo.nextAt = Date.now() + 10 * 60e3; return; }
      if (data.none) { showPhoto('img/placeholder.svg', 'Afegeix fotos a la carpeta de Drive'); photo.nextAt = Date.now() + 36e5; return; }
      var src = data.url || ('data:' + data.mime + ';base64,' + data.data);
      showPhoto(src, captionFor(data));
      var hours = data.hours || 24;
      photo.nextAt = (data.period + 1) * hours * 36e5 + 30e3;
    });
  }

  function captionFor(d) {
    var dt = parseYmd(d.taken);
    return dt ? dt.getDate() + ' ' + deMonth(dt.getMonth()) + ' de ' + dt.getFullYear() : '';
  }

  function showPhoto(src, caption) {
    var box = $('photo');
    var old = box.getElementsByClassName('photo-img');
    var img = document.createElement('div');
    img.className = 'photo-img';
    var pre = new Image();
    pre.onload = function () {
      img.style.backgroundImage = 'url("' + src + '")';
      box.insertBefore(img, $('photo-cap'));
      setTimeout(function () { img.className = 'photo-img show'; }, 30);
      setTimeout(function () {
        for (var i = old.length - 1; i >= 0; i--) if (old[i] !== img) box.removeChild(old[i]);
      }, 2000);
      photo.src = src;
      var cap = $('photo-cap');
      if (caption) { cap.innerHTML = '<b>写</b>' + esc(caption); cap.className = 'photo-cap'; }
      else cap.className = 'photo-cap hidden';
    };
    pre.src = src;
  }

  /* ------------------------------------------------------------------ */
  /* Lectures (RSS)                                                      */
  /* ------------------------------------------------------------------ */

  var news = { items: [], page: 0, per: 3, items_by_id: [] };

  function loadRss() {
    api('rss', null, function (err, data) {
      if (!err && data) { news.items = data.items || []; news.page = 0; renderNews(); }
    });
  }

  function newsPages() { return Math.max(1, Math.ceil(news.items.length / news.per)); }

  function renderNews() {
    var list = $('news-list');
    if (!news.items.length) { list.innerHTML = '<div class="empty">Cap lectura disponible.</div>'; $('news-dots').innerHTML = ''; return; }
    var pages = newsPages();
    if (news.page >= pages) news.page = 0;
    var html = '<div class="news-page">';
    news.items.slice(news.page * news.per, news.page * news.per + news.per).forEach(function (it, i) {
      html += '<button class="news-item" data-i="' + (news.page * news.per + i) + '">' +
        '<div class="news-meta">' + esc(it.source) + (it.date ? ' <span>· ' + relTime(it.date) + '</span>' : '') + '</div>' +
        '<div class="news-title">' + esc(it.title) + '</div></button>';
    });
    list.innerHTML = html + '</div>';
    var dots = '';
    for (var p = 0; p < pages && pages > 1; p++) dots += '<i' + (p === news.page ? ' class="on"' : '') + '></i>';
    $('news-dots').innerHTML = dots;
  }

  function initNews() {
    setInterval(function () {
      if (news.items.length <= news.per) return;
      var pg = $('news-list').firstChild;
      if (pg && pg.style) pg.style.opacity = '0';
      setTimeout(function () { news.page = (news.page + 1) % newsPages(); renderNews(); }, 800);
    }, SETTINGS.newsRotate);

    on($('news-list'), 'click', function (e) {
      var b = closest(e.target, 'news-item', this);
      if (!b) return;
      var it = news.items[+b.getAttribute('data-i')];
      if (!it) return;
      openOverlay('<div class="reader"><div class="news-meta">' + esc(it.source) +
        (it.date ? ' <span>· ' + relTime(it.date) + '</span>' : '') + '</div><h3>' + esc(it.title) + '</h3>' +
        (it.summary ? '<p>' + esc(it.summary) + '</p>' : '') + '<small>Toca per tancar</small></div>', false);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Capa a pantalla completa                                            */
  /* ------------------------------------------------------------------ */

  var overlayTimer = null;
  function openOverlay(html, dark) {
    var o = $('overlay');
    o.innerHTML = html;
    o.className = 'overlay' + (dark ? ' dark' : '');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(closeOverlay, 60e3);
  }
  function closeOverlay() { $('overlay').className = 'overlay hidden'; $('overlay').innerHTML = ''; }

  function initOverlay() {
    on($('overlay'), 'click', closeOverlay);
    on($('photo'), 'click', function () {
      if (photo.src) openOverlay('<div class="lb-img" style="background-image:url(&quot;' + esc(photo.src) + '&quot;)"></div>', true);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pantalla de configuració                                            */
  /* ------------------------------------------------------------------ */

  function showSetup() {
    inSetup = true;
    $('app').className = 'app hidden';
    var needApi = !cfg.api;
    var base = location.href.replace(/[#?].*$/, '');
    openOverlay('<form id="setup-form" class="setup" autocomplete="off"><h1>Kazoku</h1>' +
      '<p>Escriu el token per connectar aquest dispositiu. Només cal fer-ho un cop.</p>' +
      (needApi ? '<label>Adreça de l\'Apps Script</label><input id="setup-api" type="url" placeholder="https://script.google.com/macros/s/.../exec">' : '') +
      '<label>Token</label><input id="setup-k" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="kz-...">' +
      '<button type="submit">Connecta</button>' +
      '<p class="setup-err" id="setup-err"></p>' +
      '<p><a href="' + esc(base) + '?demo">Veure la demostració</a></p></form>', false);
    clearTimeout(overlayTimer);
    on($('setup-form'), 'submit', function (e) {
      e.preventDefault();
      var k = $('setup-k').value.replace(/\s+/g, '');
      var a = needApi ? $('setup-api').value.replace(/\s+/g, '') : cfg.api;
      if (!k || !a) { $('setup-err').textContent = 'Falta omplir algun camp.'; return; }
      cfg.k = k; cfg.api = a;
      $('setup-err').textContent = 'Comprovant…';
      api('ping', null, function (err) {
        if (err) {
          $('setup-err').textContent = err.message === 'unauthorized' ? 'Token incorrecte. Revisa majúscules i guions.' : 'No s\'ha pogut connectar (' + err.message + ').';
          return;
        }
        try { localStorage.setItem('kazoku.cfg', JSON.stringify({ api: a, k: k })); } catch (x) {}
        location.href = base;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Arrencada                                                           */
  /* ------------------------------------------------------------------ */

  function every(ms, fn) { fn(); setInterval(fn, ms); }

  function start() {
    if (!DEMO && (!cfg.api || !cfg.k)) { showSetup(); return; }

    document.addEventListener('touchstart', wakeGuard, true);
    document.addEventListener('mousedown', wakeGuard, true);
    document.addEventListener('touchstart', function () { lastTouch = Date.now(); }, false);
    document.addEventListener('mousedown', function () { lastTouch = Date.now(); }, false);

    initCalendar();
    initTasks();
    initNews();
    initOverlay();
    renderCalendar();

    every(1000, tick);
    every(SETTINGS.refresh.tasks, loadTasks);
    every(SETTINGS.refresh.calendar, loadCalendar);
    every(SETTINGS.refresh.weather, loadWeather);
    every(SETTINGS.refresh.rss, loadRss);
    every(60e3, function () { if (Date.now() >= photo.nextAt) loadPhoto(); });

    // Quan l'iPad torna de repòs o es reactiva la pestanya, es refresca tot.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadTasks(); loadCalendar(); loadWeather(); }
    }, false);

    // Recàrrega preventiva; s'ajorna si algú està escrivint.
    setInterval(function () {
      if (Date.now() - lastTouch > 60e3 && document.activeElement !== $('task-input')) location.reload();
    }, SETTINGS.reloadEvery);
  }

  start();
})();
