/**
 * Webflow/maelabord.js — ný forsíða KPI (prófun á eigin síðu, 2026-10-29)
 *
 * Á að leysa dashboard.js af sem forsíða þegar hún hefur verið prófuð. Gamla
 * forsíðan stendur óbreytt á meðan.
 * Tillagan: https://claude.ai/artifact/WCp7txe3czLFTUEeJZvLGm
 *
 * Tvær reglur ráða útlitinu (Ólafur, 2026-10-29):
 *   1. Engar krónur á forsíðunni: hlutföll, mælar og fjöldi. Krónutölurnar
 *      eru á Sölutölum. Gagnakallið skilar heldur engum krónum.
 *   2. Ekkert um gagnapípuna á síðunni: enginn innlestrartími, engin
 *      „áætlað“-merki. Fyrirvararnir eru í core/sql/maelabord_v1.sql.
 *
 * Eins og vidskiptavinir.js og vorur.js smíðar skráin ALLT sitt markup og
 * alla stíla sjálf; Webflow-Embed ber aðeins festinguna <div id="sk-maelabord">.
 * Útlitið fylgir núverandi forsíðu (litir úr dashboard-theme.css og
 * Webflow-þemanu), ekki IBM Plex-útliti hinna síðnanna.
 *
 * ── GÖGN ────────────────────────────────────────────────────────────
 * Eitt kall: api.maelabord_v1(p_month, p_day) (core/sql/maelabord_v1.sql).
 * Falli það sést villa með „Reyna aftur“; síðan hrynur ekki.
 *
 * ── HAMIR ───────────────────────────────────────────────────────────
 *   venjulegur   mánaðarval (‹ › og ársyfirlit) + dagsval innan mánaðarins.
 *                Uppfærir á 5 mín. fresti á meðan dagurinn í dag er valinn.
 *   ?skjar=1     fyrir Samsung-skjáinn: engir hnappar, klukka, alltaf
 *                dagurinn í dag, fyllir skjáinn án skrunstikna, uppfærir
 *                á 5 mín. fresti.
 *
 * ── AUÐKENNING ──────────────────────────────────────────────────────
 * Webflow/auth.js (site-wide) skiptir publishableKey út fyrir JWT
 * innskráðs notanda. Hér er ekkert um það.
 *
 * KREFST (page-scoped head code, ALDREI site-wide):
 *   window.STORKAUP_CONFIG.supabaseUrl + .publishableKey
 */
(function () {
  "use strict";

  var MOUNT_ID = 'sk-maelabord';
  var REFRESH_MS = 5 * 60 * 1000;
  var FIRST_MONTH = '2025-01';
  var GOAL_NEW = 0.10;   // ný fyrirtæki, markmið (sama og data-digital-adoption-target-pct)

  var cfg = window.STORKAUP_CONFIG || {};
  var BASE = String(cfg.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = cfg.publishableKey;

  var MN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
  // „m.v. meðal ___“ — þolfall
  var WD_ACC = ['sunnudag', 'mánudag', 'þriðjudag', 'miðvikudag', 'fimmtudag', 'föstudag', 'laugardag'];
  var WD_NOM = ['Sunnudagur', 'Mánudagur', 'Þriðjudagur', 'Miðvikudagur', 'Fimmtudagur', 'Föstudagur', 'Laugardagur'];

  // ── hjálparar ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Handsmíðað eins og í vidskiptavinir.js: toLocaleString('is-IS') er
  // óáreiðanlegt í Chrome á Windows.
  function num(v, dec) {
    var n = Number(v);
    if (v == null || v === '' || isNaN(n)) return '–';
    var f = Math.pow(10, dec || 0);
    n = Math.round(n * f) / f;
    var parts = Math.abs(n).toFixed(dec || 0).split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (n < 0 ? '−' : '') + int + (parts[1] ? ',' + parts[1] : '');
  }

  function isNum(v) { return v != null && v !== '' && !isNaN(Number(v)); }
  function pct(v, dec) { return isNum(v) ? num(Number(v) * 100, dec == null ? 1 : dec) + ' %' : '–'; }
  function signed(v) {
    if (!isNum(v)) return '–';
    var p = Math.round(Number(v) * 100);
    return (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + ' %';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayIso() { return isoDate(new Date()); }
  function monthOf(iso) { return String(iso).slice(0, 7); }
  function parseIso(iso) { var p = String(iso).split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function monthIdx(ym) { var p = ym.split('-'); return (+p[0]) * 12 + (+p[1] - 1); }
  function idxMonth(i) { return Math.floor(i / 12) + '-' + pad(i % 12 + 1); }
  function lastDayOf(ym) { var d = parseIso(ym + '-01'); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoDate(d); }
  function monthLabel(ym) { var p = ym.split('-'); var s = MN[+p[1] - 1]; return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + p[0]; }
  function dayLabel(iso) { var d = parseIso(iso); return WD_NOM[d.getDay()] + ' ' + d.getDate() + '. ' + MN[d.getMonth()]; }

  // ── gagnalag ─────────────────────────────────────────────────────────
  function readError(res) {
    return res.text().then(function (t) {
      var m = 'HTTP ' + res.status;
      try { var j = JSON.parse(t); if (j && j.message) m += ' — ' + j.message; }
      catch (e) { if (t) m += ' — ' + t.slice(0, 200); }
      return Promise.reject(new Error(m));
    });
  }

  function rpc(fn, body) {
    return fetch(BASE + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: KEY, Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json', 'Content-Profile': 'api', 'Accept-Profile': 'api'
      },
      body: JSON.stringify(body || {})
    }).then(function (res) { return res.ok ? res.json() : readError(res); });
  }

  // ── ástand ───────────────────────────────────────────────────────────
  var tv = false;
  try { tv = new URL(location.href).searchParams.get('skjar') === '1'; } catch (e) {}

  var state = {
    month: monthOf(todayIso()),
    day: null,          // null = sjálfgefið (í dag / síðasti dagur mánaðar)
    pickerOpen: false,
    data: null,
    loading: false,
    error: null
  };
  var root = null;
  var reqSeq = 0;

  function load() {
    var seq = ++reqSeq;
    state.loading = true;
    state.error = null;
    render();
    return rpc('maelabord_v1', { p_month: state.month + '-01', p_day: tv ? null : state.day })
      .then(function (j) {
        if (seq !== reqSeq) return;     // eldra svar á eftir nýrra vali
        state.data = j;
        state.loading = false;
        render();
      })
      .catch(function (err) {
        if (seq !== reqSeq) return;
        state.loading = false;
        state.error = String(err && err.message || err);
        render();
      });
  }

  // ── myndræn hjálpartæki ─────────────────────────────────────────────
  // Frávikssúla eins og .diverge á gömlu forsíðunni: grænt upp, blátt niður.
  // Hlutfallskvarði (log2): vinstri endi = helmingur (−50 %), hægri = tvöföldun
  // (+100 %), svo +68 % og +61 % greinast í sundur og −50 % og +100 % eru jafn
  // langt frá miðju. Út fyrir enda: súlan full og ör við endann.
  function diverge(v) {
    var html = '<div class="skm-div" aria-hidden="true"><div class="skm-div-mid"></div>';
    if (isNum(v)) {
      var r = 1 + Number(v);
      var x = r > 0 ? Math.log(r) / Math.LN2 : -Infinity;
      var w = Math.min(Math.abs(x), 1) * 50;
      html += x >= 0
        ? '<div class="skm-div-pos" style="width:' + w + '%"></div>'
        : '<div class="skm-div-neg" style="width:' + w + '%;left:' + (50 - w) + '%"></div>';
      if (Math.abs(x) > 1) {
        html += '<div class="skm-div-over" style="' + (x > 0 ? 'right' : 'left') + ':10px">' +
                (x > 0 ? '›' : '‹') + '</div>';
      }
    }
    return html + '</div><div class="skm-div-scale" aria-hidden="true"><span>−50 %</span><span>+100 %</span></div>';
  }

  function donut(fill, color, big, small, size) {
    var f = isNum(fill) ? Math.max(0, Math.min(1, Number(fill))) * 100 : 0;
    return '<div class="skm-donut skm-donut--' + (size || 'm') + '" style="background:conic-gradient(' + color + ' ' + f + '%, var(--skm-line) ' + f + '%)">' +
      '<div class="skm-donut-in"><span class="skm-donut-big" style="color:' + color + '">' + big + '</span>' +
      '<span class="skm-donut-small">' + esc(small) + '</span></div></div>';
  }

  function hourlyChart(day) {
    var hrs = (day && day.hourly) || [];
    var avg = (day && day.weekday_hourly) || [];
    var byH = {}, avgH = {};
    hrs.forEach(function (x) { byH[x.h] = Number(x.n) || 0; });
    avg.forEach(function (x) { avgH[x.h] = Number(x.n) || 0; });
    var max = 1;
    for (var h = 0; h < 24; h++) max = Math.max(max, byH[h] || 0, avgH[h] || 0);
    max *= 1.1;
    var nowH = state.data && state.data.is_today ? new Date().getHours() : 24;
    var bars = '', labels = '';
    for (h = 0; h < 24; h++) {
      var v = byH[h] || 0;
      var cls = h > nowH ? 'skm-bar skm-bar--future' : (h === nowH ? 'skm-bar skm-bar--now' : 'skm-bar');
      bars += '<div class="skm-col" title="' + pad(h) + ':00 · ' + v + ' pantanir · meðaltal ' + num(avgH[h] || 0, 1) + '">' +
        '<div class="' + cls + '" style="height:' + (v / max * 100) + '%"></div>' +
        '<div class="skm-avg" style="bottom:' + ((avgH[h] || 0) / max * 100) + '%"></div></div>';
      labels += '<div>' + (h % 3 === 0 ? pad(h) : '') + '</div>';
    }
    return '<div class="skm-hourly" role="img" aria-label="Pantanir á klukkustund á móti meðaltali sama vikudags">' + bars + '</div>' +
      '<div class="skm-hourly-lbl" aria-hidden="true">' + labels + '</div>';
  }

  // ── spjöld ───────────────────────────────────────────────────────────
  function card(key, inner, extra) {
    return '<article class="skm-card skm-k-' + key + (extra ? ' ' + extra : '') + '">' + inner + '</article>';
  }

  function head(title, sub) {
    return '<div class="skm-head"><h2 class="skm-title">' + title + '</h2>' +
      (sub ? '<div class="skm-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function cards(j) {
    var day = j.day_block || {};
    var mon = j.month_block || {};
    var sh = j.shares || {};
    var nc = j.new_companies || {};
    var d = parseIso(j.day);
    var wd = WD_ACC[d.getDay()];
    var cmpDay = 'm.v. meðal ' + wd + (j.is_today ? ' á sama tíma' : '');
    var ym = j.month;
    var py = monthLabel(idxMonth(monthIdx(ym) - 12)).toLowerCase();
    // Líðandi mánuður er borinn saman við sama tímabil í fyrra (maelabord_v1.sql).
    var cmpMonth = 'm.v. ' + (ym === monthOf(todayIso()) ? 'sama tímabil ' : '') + py;

    function dayFoot(kind) {
      var parts = [];
      if (isNum(day['yesterday_' + kind])) parts.push('í gær ' + signed(day['yesterday_' + kind]));
      if (kind !== 'aov' && isNum(day['lastweek_' + kind])) parts.push('fyrir viku ' + signed(day['lastweek_' + kind]));
      return parts.join(' · ');
    }

    var up = isNum(day.pace_orders) && Number(day.pace_orders) >= 0;
    var c = {};

    c.orders = card('orders',
      '<div class="skm-orders-top">' +
        '<div>' + head('<strong>Vefpantanir</strong> ' + (j.is_today ? 'í dag' : esc(dayLabel(j.day)))) +
        '<div class="skm-big">' + num(day.orders) + '</div></div>' +
        '<div class="skm-pill ' + (up ? 'skm-pill--up' : 'skm-pill--down') + '">' + signed(day.pace_orders) +
        ' <span>' + esc(cmpDay) + '</span></div>' +
      '</div>' + hourlyChart(day) +
      '<div class="skm-legend"><span><i class="skm-sw skm-sw--bar"></i>Pantanir á klst.</span>' +
      '<span><i class="skm-sw skm-sw--avg"></i>Meðal ' + esc(wd) + '</span></div>');

    c.revenue = card('revenue', head('<strong>Velta</strong> ' + (j.is_today ? 'í dag' : 'dagsins'), cmpDay) +
      '<div class="skm-val">' + signed(day.pace_revenue) + '</div>' + diverge(day.pace_revenue) +
      '<div class="skm-foot">' + esc(dayFoot('revenue')) + '</div>', 'skm-center');

    c.aov = card('aov', head('<strong>Meðalpöntun</strong> ' + (j.is_today ? 'í dag' : 'dagsins'), 'm.v. meðal ' + wd) +
      '<div class="skm-val">' + signed(day.pace_aov) + '</div>' + diverge(day.pace_aov) +
      '<div class="skm-foot">' + esc(dayFoot('aov')) + '</div>', 'skm-center');

    c.mOrders = card('m-orders', head(esc(monthLabel(ym).split(' ')[0]) + ' <strong>vefpantanir</strong>', cmpMonth) +
      '<div class="skm-val">' + signed(mon.yoy_orders) + '</div>' + diverge(mon.yoy_orders) +
      '<div class="skm-foot">' + num(mon.orders) + ' pantanir</div>', 'skm-center');

    c.mRevenue = card('m-revenue', head(esc(monthLabel(ym).split(' ')[0]) + ' <strong>vefsala</strong>', cmpMonth) +
      '<div class="skm-val">' + signed(mon.yoy_revenue) + '</div>' + diverge(mon.yoy_revenue) +
      '<div class="skm-foot">meðalpöntun ' + signed(mon.yoy_aov) + '</div>', 'skm-center');

    c.newco = card('newco', head('<strong>Ný fyrirtæki</strong> á vef', 'í ' + MN[+ym.split('-')[1] - 1]) +
      donut(isNum(nc.pct) ? Number(nc.pct) / GOAL_NEW : null, 'var(--skm-orange)', num(nc.n), pct(nc.pct) + ' · markmið 10 %') +
      '<div class="skm-foot">' + num(nc.active) + ' fyrirtæki keyptu á vef</div>', 'skm-center');

    c.webOrders = card('web-orders', head('<strong>Vefpantanir</strong> %', 'af öllum pöntunum') +
      donut(sh.web_orders_pct, 'var(--skm-blue)', pct(sh.web_orders_pct), 'í ' + MN[+ym.split('-')[1] - 1]), 'skm-center');

    c.webRevenue = card('web-revenue', head('<strong>Vefsala</strong> %', 'af heildarsölu') +
      donut(sh.web_revenue_pct, 'var(--skm-green-ink)', pct(sh.web_revenue_pct), 'í ' + MN[+ym.split('-')[1] - 1]), 'skm-center');

    c.goal = card('goal', head('<strong>Vefsala</strong> markmið', '50 % árið ' + ym.split('-')[0]) +
      donut(sh.goal_pct, 'var(--skm-orange-ink)', pct(sh.goal_pct, 0), 'af markmiði'), 'skm-center');

    var bw = isNum(sh.basket_web_share) ? Number(sh.basket_web_share) * 100 : null;
    c.basket = card('basket', head('<strong>Karfa</strong> hlutföll', 'stærð körfu: vefur á móti BC') +
      '<div class="skm-val">' + (bw == null ? '–' : num(bw / (100 - bw) * 100) + ' %') + '</div>' +
      '<div class="skm-split" aria-hidden="true"><div style="width:' + (bw == null ? 50 : bw) + '%"></div><div></div></div>' +
      '<div class="skm-split-lbl"><span>VEFUR ' + (bw == null ? '–' : num(bw) + ' %') + '</span>' +
      '<span>BC ' + (bw == null ? '–' : num(100 - bw) + ' %') + '</span></div>', 'skm-center');

    var prods = j.products || [];
    var pmax = prods.length ? Number(prods[0].n) || 1 : 1;
    c.products = card('products', head('<strong>Mest seldar</strong> vörur ' + (j.is_today ? 'í dag' : 'dagsins'), 'fjöldi pantana') +
      (prods.length ? '<ol class="skm-prod">' + prods.map(function (p, i) {
        return '<li><span class="skm-rank">' + (i + 1) + '</span><span class="skm-pname" title="' + esc(p.sku) + '">' + esc(p.name) + '</span>' +
          '<span class="skm-pbar" aria-hidden="true"><span style="width:' + (Number(p.n) / pmax * 100) + '%"></span></span>' +
          '<span class="skm-pn">' + num(p.n) + '</span></li>';
      }).join('') + '</ol>' : '<p class="skm-empty">Engar vörulínur enn.</p>'));

    var cats = (j.categories || []).slice(0, 4);
    var COLORS = ['var(--skm-blue)', 'var(--skm-green)', 'var(--skm-orange)', 'var(--skm-teal)'];
    c.cats = card('cats', head('<strong>Flokkar</strong> ' + (j.is_today ? 'í dag' : 'dagsins'), 'hlutfall vörulína') +
      (cats.length ?
        '<div class="skm-split skm-split--cats" aria-hidden="true">' + cats.map(function (k, i) {
          return '<div style="width:' + (Number(k.pct) * 100) + '%;background:' + COLORS[i] + '"></div>';
        }).join('') + '</div>' +
        '<ul class="skm-cats">' + cats.map(function (k, i) {
          return '<li><i class="skm-sw" style="background:' + COLORS[i] + '"></i>' + esc(k.name) + ' <strong>' + pct(k.pct, 0) + '</strong></li>';
        }).join('') + '</ul>' : '<p class="skm-empty">Engar vörulínur enn.</p>'));

    var order = tv
      ? ['orders', 'revenue', 'aov', 'newco', 'mOrders', 'mRevenue', 'webOrders', 'webRevenue', 'goal', 'basket', 'products', 'cats']
      : ['orders', 'revenue', 'aov', 'mOrders', 'mRevenue', 'newco', 'basket', 'webOrders', 'webRevenue', 'goal', 'cats', 'products'];
    return order.map(function (k) { return c[k]; }).join('');
  }

  // ── haus ─────────────────────────────────────────────────────────────
  function header() {
    if (tv) {
      var now = new Date();
      return '<header class="skm-header"><h1 class="skm-h1">Mælaborð</h1>' +
        '<div class="skm-tvclock"><span>' + esc(dayLabel(todayIso())) + '</span>' +
        '<span class="skm-clock">' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + '</span></div></header>';
    }
    var cur = monthIdx(monthOf(todayIso()));
    var sel = monthIdx(state.month);
    var day = state.data && monthOf(state.data.day) === state.month ? state.data.day : (state.day || '');
    var max = state.month === monthOf(todayIso()) ? todayIso() : lastDayOf(state.month);

    var picker = '';
    if (state.pickerOpen) {
      var years = [];
      for (var y = +FIRST_MONTH.slice(0, 4); y <= Math.floor(cur / 12); y++) years.push(y);
      picker = '<div class="skm-picker" role="dialog" aria-label="Veldu mánuð">' + years.map(function (yr) {
        var cells = '';
        for (var m = 0; m < 12; m++) {
          var i = yr * 12 + m;
          var dis = i > cur || i < monthIdx(FIRST_MONTH);
          cells += '<button type="button" class="skm-pm' + (i === sel ? ' is-sel' : '') + '" data-act="month" data-month="' + idxMonth(i) + '"' + (dis ? ' disabled' : '') + '>' +
            esc(MN[m].charAt(0).toUpperCase() + MN[m].slice(1, 3)) + '</button>';
        }
        return '<div class="skm-py"><div class="skm-py-year">' + yr + '</div><div class="skm-pgrid">' + cells + '</div></div>';
      }).join('') + '</div>';
    }

    return '<header class="skm-header">' +
      '<div class="skm-hleft"><h1 class="skm-h1">Mælaborð</h1>' +
        '<label class="skm-daypick"><span class="skm-sr">Dagur</span>' +
        '<input type="date" data-act="day" value="' + esc(day) + '" min="' + state.month + '-01" max="' + max + '"></label>' +
      '</div>' +
      '<nav class="skm-mnav" aria-label="Mánuður">' +
        '<button type="button" class="skm-arrow" data-act="prev" aria-label="Fyrri mánuður"' + (sel <= monthIdx(FIRST_MONTH) ? ' disabled' : '') + '>‹</button>' +
        '<button type="button" class="skm-mbtn" data-act="picker" aria-haspopup="dialog" aria-expanded="' + state.pickerOpen + '">' + esc(monthLabel(state.month)) + ' ▾</button>' +
        '<button type="button" class="skm-arrow" data-act="next" aria-label="Næsti mánuður"' + (sel >= cur ? ' disabled' : '') + '>›</button>' +
        picker +
      '</nav></header>';
  }

  function render() {
    if (!root) return;
    var body;
    if (state.error && !state.data) {
      body = '<div class="skm-err">Ekki tókst að sækja tölurnar. <button type="button" data-act="retry">Reyna aftur</button>' +
        '<div class="skm-err-d">' + esc(state.error) + '</div></div>';
    } else if (!state.data) {
      body = '<div class="skm-loading">Sæki tölur…</div>';
    } else {
      body = '<div class="skm-grid' + (state.loading ? ' is-loading' : '') + '">' + cards(state.data) + '</div>';
    }
    root.innerHTML = '<div class="skm' + (tv ? ' skm--tv' : '') + '">' + header() + body + '</div>';
  }

  // ── atburðir ─────────────────────────────────────────────────────────
  function setMonth(ym) {
    state.month = ym;
    state.day = null;
    state.pickerOpen = false;
    load();
  }

  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) {
      if (state.pickerOpen && !e.target.closest('.skm-picker')) { state.pickerOpen = false; render(); }
      return;
    }
    var act = t.getAttribute('data-act');
    if (act === 'prev') setMonth(idxMonth(monthIdx(state.month) - 1));
    else if (act === 'next') setMonth(idxMonth(monthIdx(state.month) + 1));
    else if (act === 'picker') { state.pickerOpen = !state.pickerOpen; render(); }
    else if (act === 'month') setMonth(t.getAttribute('data-month'));
    else if (act === 'retry') load();
  }

  function onChange(e) {
    var t = e.target;
    if (t.getAttribute('data-act') === 'day' && t.value) {
      state.day = t.value;
      load();
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && state.pickerOpen) { state.pickerOpen = false; render(); }
  }

  // ── stílar ───────────────────────────────────────────────────────────
  var CSS = [
    '#' + MOUNT_ID + '{--skm-bg:#fafaf9;--skm-card:#f5f6ff;--skm-line:#e9e9e9;--skm-ink:#282828;--skm-ink2:#424242;--skm-mute:#757575;',
    '--skm-num:#5246f8;--skm-blue:#8077fa;--skm-green:#c4e08c;--skm-green-ink:#7fb02a;--skm-orange:#fdc65d;--skm-orange-ink:#e09a12;--skm-teal:#66cad8;--skm-mid:#9a98e1;--skm-up:#257b17;--skm-up-bg:#f0fdf4;--skm-down:#3f35d4;--skm-down-bg:#eeedfe;',
    'font-family:"Sf Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--skm-ink);font-size:15px;line-height:1.5}',
    '.skm{width:100%;box-sizing:border-box;padding:8px 0 40px;display:flex;flex-direction:column;gap:20px}',
    '.skm-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}',
    '.skm-hleft{display:flex;flex-wrap:wrap;align-items:center;gap:12px}',
    '.skm-h1{margin:0;font-size:24px;font-weight:700}',
    '.skm-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.skm-daypick input{font:inherit;font-size:14px;color:var(--skm-ink);background:#fff;border:1px solid var(--skm-line);border-radius:999px;padding:8px 14px;min-height:40px}',
    '.skm-mnav{position:relative;display:flex;align-items:center;gap:6px}',
    '.skm-arrow{font:inherit;font-size:20px;line-height:1;color:var(--skm-num);background:#fff;border:1px solid var(--skm-line);border-radius:999px;width:44px;height:44px;cursor:pointer}',
    '.skm-arrow:disabled{color:#c8c8c8;cursor:default}',
    '.skm-mbtn{font:inherit;font-size:15px;font-weight:600;color:#fff;background:var(--skm-num);border:0;border-radius:999px;padding:0 20px;height:44px;min-width:170px;cursor:pointer}',
    '.skm-picker{position:absolute;right:0;top:52px;z-index:20;width:340px;background:#fff;border:1px solid var(--skm-line);border-radius:16px;box-shadow:0 12px 32px rgba(40,40,40,.12);padding:16px;display:flex;flex-direction:column;gap:14px}',
    '.skm-py-year{font-size:13px;font-weight:700;color:var(--skm-ink2);margin-bottom:6px}',
    '.skm-pgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
    '.skm-pm{font:inherit;font-size:13px;min-height:40px;border-radius:10px;border:1px solid var(--skm-line);background:#fff;color:var(--skm-ink);cursor:pointer}',
    '.skm-pm.is-sel{background:var(--skm-num);border-color:var(--skm-num);color:#fff}',
    '.skm-pm:disabled{color:#c8c8c8;cursor:default}',
    '.skm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;transition:opacity .2s}',
    '.skm-grid.is-loading{opacity:.55}',
    '.skm-card{min-width:0;background:var(--skm-card);border:1px solid var(--skm-line);border-radius:16px;padding:26px 22px;display:flex;flex-direction:column;gap:12px}',
    '.skm-center{align-items:center;text-align:center;justify-content:center}',
    '.skm-k-orders{grid-column:span 2}',
    '.skm-k-products{grid-column:1/-1}',
    '.skm-title{margin:0;font-size:14px;font-weight:400}',
    '.skm-sub{font-size:12px;color:var(--skm-mute)}',
    '.skm-big{color:var(--skm-num);font-size:40px;line-height:1.05;font-weight:700;font-variant-numeric:tabular-nums}',
    '.skm-val{color:var(--skm-num);font-size:32px;line-height:1.1;font-weight:700;font-variant-numeric:tabular-nums}',
    '.skm-foot{font-size:12px;color:var(--skm-mute);min-height:18px}',
    '.skm-orders-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px}',
    '.skm-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:600}',
    '.skm-pill span{font-weight:400;color:var(--skm-ink2)}',
    '.skm-pill--up{background:var(--skm-up-bg);color:var(--skm-up)}',
    '.skm-pill--down{background:var(--skm-down-bg);color:var(--skm-down)}',
    '.skm-hourly{height:130px;display:flex;align-items:flex-end;gap:4px}',
    '.skm-col{flex:1;height:100%;position:relative;display:flex;align-items:flex-end}',
    '.skm-bar{width:100%;min-height:3px;background:var(--skm-blue);border-radius:4px 4px 1px 1px}',
    '.skm-bar--now{background:var(--skm-num)}',
    '.skm-bar--future{background:transparent}',
    '.skm-avg{position:absolute;left:0;right:0;height:2px;background:var(--skm-mid)}',
    '.skm-hourly-lbl{display:flex;gap:4px;font-size:11px;color:var(--skm-mute)}',
    '.skm-hourly-lbl div{flex:1;text-align:center}',
    '.skm-legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:var(--skm-ink2)}',
    '.skm-legend span{display:inline-flex;align-items:center;gap:6px}',
    '.skm-sw{display:inline-block;width:10px;height:10px;border-radius:3px}',
    '.skm-sw--bar{background:var(--skm-blue)}',
    '.skm-sw--avg{width:14px;height:2px;border-radius:0;background:var(--skm-mid)}',
    '.skm-div{position:relative;width:90%;height:24px;background:#fff;border:1px solid var(--skm-line);border-radius:16px}',
    '.skm-div-mid{position:absolute;left:50%;top:50%;width:1px;height:32px;background:var(--skm-mid);transform:translate(-50%,-50%);z-index:1}',
    '.skm-div-pos{position:absolute;top:0;bottom:0;left:50%;background:var(--skm-green);border-radius:0 16px 16px 0}',
    '.skm-div-neg{position:absolute;top:0;bottom:0;background:var(--skm-blue);border-radius:16px 0 0 16px}',
    '.skm-div-over{position:absolute;top:50%;transform:translateY(-50%);z-index:2;font-size:18px;font-weight:700;line-height:1;color:#fff}',
    '.skm-div-scale{width:90%;margin-top:-8px;display:flex;justify-content:space-between;font-size:10px;color:var(--skm-mute)}',
    '.skm-donut{border-radius:50%;display:flex;align-items:center;justify-content:center}',
    '.skm-donut--m{width:150px;height:150px}',
    '.skm-donut-in{width:80%;height:80%;border-radius:50%;background:var(--skm-card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}',
    '.skm-donut-big{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}',
    '.skm-donut-small{font-size:11px;color:var(--skm-mute);max-width:80%}',
    '.skm-split{width:90%;height:24px;display:flex;border:1px solid var(--skm-line);border-radius:16px;overflow:hidden;background:var(--skm-green)}',
    '.skm-split>div:first-child{background:var(--skm-blue)}',
    '.skm-split--cats{width:100%;background:#fff}',
    '.skm-split-lbl{width:90%;display:flex;justify-content:space-between;font-size:12px;font-weight:600}',
    '.skm-split-lbl span:first-child{color:var(--skm-num)}.skm-split-lbl span:last-child{color:var(--skm-up)}',
    '.skm-prod{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 24px}',
    '.skm-prod li{display:grid;grid-template-columns:26px minmax(0,1fr) minmax(50px,22%) 26px;gap:10px;align-items:center}',
    '.skm-rank{width:24px;height:24px;border-radius:50%;background:#fff;border:1px solid var(--skm-line);font-size:12px;font-weight:700;color:var(--skm-num);display:flex;align-items:center;justify-content:center}',
    '.skm-pname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}',
    '.skm-pbar{height:10px;background:#fff;border:1px solid var(--skm-line);border-radius:999px;overflow:hidden}',
    '.skm-pbar span{display:block;height:100%;background:var(--skm-blue)}',
    '.skm-pn{font-weight:700;color:var(--skm-num);text-align:right;font-variant-numeric:tabular-nums}',
    '.skm-cats{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:14px}',
    '.skm-cats li{display:flex;align-items:center;gap:8px}',
    '.skm-empty{margin:0;color:var(--skm-mute);font-size:14px}',
    '.skm-err,.skm-loading{background:var(--skm-card);border:1px solid var(--skm-line);border-radius:16px;padding:24px;color:var(--skm-ink2)}',
    '.skm-err button{font:inherit;margin-left:8px;color:#fff;background:var(--skm-num);border:0;border-radius:999px;padding:6px 14px;cursor:pointer}',
    '.skm-err-d{margin-top:8px;font-size:12px;color:var(--skm-mute)}',
    '@media (max-width:1100px){.skm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.skm-prod{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@media (max-width:640px){.skm-grid{grid-template-columns:minmax(0,1fr)}.skm-k-orders,.skm-k-products{grid-column:auto}.skm-prod{grid-template-columns:minmax(0,1fr)}}',
    // Skjáhamur: 6 dálkar, fyllir gluggann, stærra letur, engin skrunun.
    // Fixed yfir allan gluggann: annars ýta toppbil og valmynd Webflow neðstu röðinni út fyrir.
    '.skm--tv{position:fixed;inset:0;z-index:2147483000;width:auto;background:var(--skm-bg);box-sizing:border-box;padding:min(24px,2.5vh) 32px;gap:min(16px,1.6vh);overflow:hidden}',
    '.skm--tv .skm-h1{font-size:30px}',
    '.skm-tvclock{display:flex;align-items:baseline;gap:18px;font-size:22px;font-weight:600}',
    '.skm-clock{color:var(--skm-mute);font-variant-numeric:tabular-nums}',
    '.skm--tv .skm-grid{flex:1;min-height:0;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:1.3fr 1fr .75fr;gap:min(16px,1.6vh)}',
    '.skm--tv .skm-card{padding:min(20px,2vh) 20px;gap:min(10px,1vh);overflow:hidden}',
    '.skm--tv .skm-k-orders{grid-column:span 3}',
    '.skm--tv .skm-k-products{grid-column:span 4}',
    '.skm--tv .skm-k-cats{grid-column:span 2}',
    '.skm--tv .skm-title{font-size:19px}.skm--tv .skm-sub,.skm--tv .skm-foot{font-size:15px}',
    '.skm--tv .skm-big{font-size:min(60px,6vh)}.skm--tv .skm-val{font-size:min(46px,4.6vh)}',
    '.skm--tv .skm-hourly{height:auto;flex:1;min-height:80px}',
    '.skm--tv .skm-donut--m{width:min(170px,16vh);height:min(170px,16vh)}.skm--tv .skm-donut-big{font-size:32px}.skm--tv .skm-donut-small{font-size:13px}',
    '.skm--tv .skm-pname{font-size:17px}.skm--tv .skm-cats{font-size:17px}'
  ].join('\n');

  // ── ræsing ───────────────────────────────────────────────────────────
  function boot() {
    root = document.getElementById(MOUNT_ID);
    if (!root || root.getAttribute('data-booted') === '1') return;   // vörn gegn tvíræsingu
    root.setAttribute('data-booted', '1');

    if (!BASE || !KEY) {
      root.innerHTML = '<div class="skm-err">Vantar STORKAUP_CONFIG (supabaseUrl/publishableKey) í head-kóða síðunnar.</div>';
      return;
    }

    if (!document.getElementById('skm-style')) {
      var st = document.createElement('style'); st.id = 'skm-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKey);

    render();
    load();

    // Uppfærsla: skjárinn alltaf, venjulegur hamur aðeins á meðan dagurinn í dag er valinn.
    setInterval(function () {
      if (document.hidden) return;
      if (tv) { state.month = monthOf(todayIso()); load(); return; }
      if (state.data && state.data.is_today) load();
    }, REFRESH_MS);
    if (tv) setInterval(function () { if (!document.hidden) render(); }, 30 * 1000);   // klukkan
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
