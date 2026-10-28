/* Dades d'exemple per al mode demostració (?demo). No s'usa en funcionament normal. */
(function () {
  'use strict';

  function at(dayOffset, h, m) {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + dayOffset, h || 0, m || 0).getTime();
  }
  function ev(t, d, h, m, durMin, c, l) {
    var s = at(d, h, m);
    return { t: t, s: s, e: s + durMin * 60e3, a: false, c: c, l: l || '' };
  }
  function allDay(t, d, days, c) {
    return { t: t, s: at(d), e: at(d + (days || 1)), a: true, c: c, l: '' };
  }

  var events = [
    allDay('Castanyada a l\'escola', 4, 1, 1),
    ev('Esmorzar amb l\'Anna', 0, 8, 30, 45, 2, 'Forn de la plaça'),
    ev('Natació · Pol', 0, 17, 30, 60, 0, 'Piscina municipal'),
    ev('Reunió de pares', 0, 19, 0, 60, 1, 'Escola Els Pins'),
    ev('Sopar amb els avis', 0, 21, 0, 120, 3),
    ev('Dentista · Laia', 1, 10, 15, 45, 0, 'Clínica Dental Rambla'),
    ev('Recollir paquet', 1, 18, 0, 30, 2, 'Punt de recollida'),
    ev('Assaig coral', 2, 20, 0, 90, 3),
    ev('Mercat de pagès', 5, 10, 0, 120, 1),
    ev('Excursió a Montserrat', 6, 9, 0, 480, 0),
    ev('Revisió cotxe', -1, 9, 0, 60, 2, 'Taller Puig'),
    ev('Ioga', -2, 19, 0, 60, 3),
    ev('Natació · Pol', 7, 17, 30, 60, 0),
    ev('Aniversari de la Marta', 9, 18, 0, 180, 1),
    ev('Tutoria', 11, 16, 0, 45, 1),
    ev('Natació · Pol', -7, 17, 30, 60, 0),
    ev('Cinema', -5, 20, 30, 120, 3),
    allDay('Tots Sants', 5, 1, 2),
    ev('ITV', 14, 8, 0, 60, 2),
    ev('Natació · Pol', 14, 17, 30, 60, 0),
    ev('Sopar de l\'AMPA', 16, 21, 0, 150, 1)
  ];

  var tasks = [
    { id: 't1', title: 'Comprar llet, pa i ous', done: false, due: null },
    { id: 't2', title: 'Trucar al lampista per la caldera', done: false, due: Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) },
    { id: 't3', title: 'Signar l\'autorització de l\'excursió', done: false, due: null },
    { id: 't4', title: 'Reservar taula per divendres', done: false, due: null },
    { id: 't5', title: 'Regar les plantes del balcó', done: true, due: null },
    { id: 't6', title: 'Pagar la quota de l\'AMPA', done: true, due: null }
  ];
  var n = 10;

  function sorted() {
    return { tasks: JSON.parse(JSON.stringify(tasks)).sort(function (a, b) { return a.done === b.done ? 0 : a.done ? 1 : -1; }) };
  }

  function ymd(off) {
    var d = new Date(); d.setDate(d.getDate() + off);
    var p = function (x) { return x < 10 ? '0' + x : x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  window.KazokuDemo = function (action, p) {
    switch (action) {
      case 'calendar':
        return { calendars: [{ name: 'Família', i: 0 }], events: events.filter(function (e) {
          return e.s < Number(p.end) && e.e > Number(p.start);
        }).sort(function (a, b) { return a.a === b.a ? a.s - b.s : a.a ? -1 : 1; }) };
      case 'tasks': return sorted();
      case 'addTask': tasks.push({ id: 'n' + (++n), title: p.title, done: false, due: null }); return sorted();
      case 'toggleTask':
        tasks.forEach(function (t) { if (t.id === p.id) t.done = !t.done; }); return sorted();
      case 'deleteTask': tasks = tasks.filter(function (t) { return t.id !== p.id; }); return sorted();
      case 'weather':
        return {
          now: { temp: 17.6, feels: 16.9, code: 2, day: true, hum: 64, wind: 9 },
          days: [
            { date: ymd(0), code: 2, max: 20.4, min: 12.1 },
            { date: ymd(1), code: 61, max: 17.8, min: 11.6 },
            { date: ymd(2), code: 3, max: 18.9, min: 10.4 },
            { date: ymd(3), code: 0, max: 21.2, min: 11.0 },
            { date: ymd(4), code: 1, max: 22.0, min: 12.3 }
          ]
        };
      case 'rss':
        var now = Date.now();
        return { items: [
          { source: 'Diari de Prova', title: 'La tardor arriba amb pluges suaus i temperatures agradables al litoral', date: now - 25 * 60e3, summary: 'Text d\'exemple: aquí apareix el resum de l\'article quan toques el titular.' },
          { source: 'Ciència Oberta', title: 'Un nou estudi explica per què les fulles canvien de color', date: now - 2 * 36e5, summary: 'Text d\'exemple.' },
          { source: 'Cuina de Temporada', title: 'Cinc receptes amb castanyes i moniatos per a aquesta setmana', date: now - 5 * 36e5, summary: 'Text d\'exemple.' },
          { source: 'Diari de Prova', title: 'El mercat municipal amplia l\'horari els dissabtes', date: now - 9 * 36e5, summary: 'Text d\'exemple.' },
          { source: 'Ciència Oberta', title: 'Com observar la pluja d\'estels d\'aquest mes sense telescopi', date: now - 26 * 36e5, summary: 'Text d\'exemple.' },
          { source: 'Cuina de Temporada', title: 'Guia ràpida per conservar bolets a casa', date: now - 30 * 36e5, summary: 'Text d\'exemple.' }
        ] };
      case 'photo':
        return { url: 'img/placeholder.svg', taken: '2024:08:14 10:22:01', period: Math.floor(Date.now() / 864e5), hours: 24 };
    }
    throw new Error('unknown action');
  };
})();
