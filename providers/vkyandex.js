// ============================================================
//  vkyandex v1.0.1 — Nuvio scraper (VK Video + Yandex arama yardımı)
//  Akış: TMDB (Türkçe + İngilizce ad, yıl, süre) -> VK Video araması
//        + Yandex (web + video araması) ile VK video numaraları toplanır
//        -> başlıkta film adı (TR veya EN) + ZORUNLU Türkçe etiket
//           (tr dublaj / Türkçe dublaj / izle / film izle / filmi izle ...) aranır
//        -> yıl + süre ile TMDB filmine eşleştirilir (Nuvio'daki poster = o TMDB kaydı)
//        -> her bağlantı test edilir, çalışan başlık takımıyla oynatıcıya verilir.
// ============================================================

var AYAR = {
  SITE: 'https://vkvideo.ru',
  API: 'https://api.vkvideo.ru/method',
  LOGIN: 'https://login.vk.ru/?act=get_anonym_token',
  V: '5.289',
  CLIENT_ID: '52461373',
  // DevTools -> Ağ -> "?act=get_anonym_token" isteği -> Yük (Payload). VkVideo.kt'deki CLIENT_SECRET ve DEVICE_ID ile AYNI değerleri yaz.
  CLIENT_SECRET: '',
  DEVICE_ID: '',
  EKLENTI_ADI: 'VK Video',   // akış kartında görünen ad
  DEBUG_MODU: false,         // true: akış çıkmazsa nedenini yazan "DEBUG" satırları görünür
  TANI: false,               // true: akış adının yanına test kodları (V0:403 V1:200 ...) yazılır, testi geçemeyenler de en sonda görünür

  MIN_SURE: 1200,            // sn: bundan kısa videolar elenir (0 = hiç eleme)
  ZORUNLU_ETIKET: true,      // true: başlıkta tr dublaj / türkçe dublaj / izle / film izle ... YOKSA video alınmaz
  YIL_TOLERANS: 1,           // başlıktaki yıl TMDB yılından en fazla kaç yıl farklı olabilir
  MAX_ADAY: 10,              // en fazla kaç aday video için bağlantı çekilsin

  // VK Video'nun kendi aramasında denenecek etiketler (her film adı için ayrı sorgu: TR ad + EN ad)
  VK_ETIKETLER: ['Türkçe Dublaj', 'TR Dublaj', 'izle', 'film izle', 'filmi izle', 'tr izle', 'tr dublaj izle', ''],
  MAX_SORGU: 14,             // VK Video'da en fazla kaç arama yapılsın
  SORGU_SAYFA: 2,            // her aramada en fazla kaç sayfa (sayfa başı ~30 video)

  // Yandex yardımı: "film adı tr dublaj izle vkvideo.ru" tarzı aramalardan VK video numaraları toplanır
  YANDEX: true,
  YANDEX_ETIKETLER: ['tr dublaj izle vkvideo.ru', 'Türkçe Dublaj film izle vkvideo.ru', 'filmi izle vkvideo.ru', 'film izle vkvideo.ru'],
  YANDEX_SORGU: 8,           // Yandex'e en fazla kaç sorgu gitsin
  YANDEX_SURE: 7000,         // ms: Yandex aşamasının üst sınırı
  YANDEX_ADAY: 24,           // Yandex'ten gelen en fazla kaç video VK API ile doğrulansın

  PARALEL: 6,                // aynı anda en fazla kaç arama isteği
  ARAMA_SURESI: 8500,        // ms: arama aşaması üst sınırı
  KAYNAK_SURESI: 7000,       // ms: video bağlantılarının çekilmesi üst sınırı
  GENEL_SURE: 30000          // ms: dolunca o ana kadar bulunan akışlar VERİLİR (boş dönmez)
};

var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var PROVIDER_ID = 'vkyandex';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';
var UA_VK = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
var UA_ENGINE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

var dbg = [];

// ---------------- Genel yardımcılar ----------------

function noop() {}
function uniq(list) {
  var out = [];
  list.forEach(function (x) { if (x && out.indexOf(x) === -1) out.push(x); });
  return out;
}
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}
function waitWithin(promises, ms) {
  return new Promise(function (resolve) {
    var left = promises.length, done = false;
    if (!left) { resolve(); return; }
    var t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
    promises.forEach(function (p) {
      p.then(noop, noop).then(function () {
        left--;
        if (left === 0 && !done) { done = true; clearTimeout(t); resolve(); }
      });
    });
  });
}
function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return TR_MAP[c]; });
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }
function fmtDur(sec) {
  if (!sec) return '';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (h ? h + ':' + p(m) : m) + ':' + p(s);
}
function heightOf(key) {
  var m = String(key || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}
function formBody(o) {
  return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k])); }).join('&');
}
function getJson(url) {
  return withTimeout(fetch(url), 10000).then(function (res) { return res.json(); });
}
function pageHeaders(extra) {
  var h = {
    'User-Agent': ANDROID_UA,
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8,ru;q=0.5',
    'Referer': AYAR.SITE + '/'
  };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}
function vkHeaders(extra) {
  var h = { 'User-Agent': UA_VK, 'Accept': '*/*', 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

// Aynı anda çok istek yavaş ağda hepsini zaman aşımına sokuyor: normal istekler sıraya girer, prio istekler girmez.
var NET_ACTIVE = 0, NET_QUEUE = [];
function netAcquire(prio) {
  return new Promise(function (resolve) {
    if (prio || NET_ACTIVE < (AYAR.PARALEL || 4)) { NET_ACTIVE++; resolve(true); return; }
    NET_QUEUE.push({ t: Date.now(), r: resolve });
  });
}
function netRelease() {
  NET_ACTIVE = Math.max(0, NET_ACTIVE - 1);
  while (NET_QUEUE.length && NET_ACTIVE < (AYAR.PARALEL || 4)) {
    var w = NET_QUEUE.shift();
    if (Date.now() - w.t > 7000) { w.r(false); continue; }
    NET_ACTIVE++; w.r(true); break;
  }
}

// { status, ok, text, url, ct } — opt: { method, body, timeout, prio, noBody }
function getRaw(url, headers, label, opt) {
  opt = opt || {};
  var prio = !!opt.prio;
  var tmo = opt.timeout || (prio ? 8000 : 6000);
  return netAcquire(prio).then(function (granted) {
    if (!granted) return { status: 0, ok: false, text: '', err: 'sira' };
    var init = { headers: headers || pageHeaders() };
    if (opt.method) init.method = opt.method;
    if (opt.body) init.body = opt.body;
    return withTimeout(fetch(url, init), tmo).then(function (res) {
      var ct = '';
      try { ct = (res.headers && res.headers.get && res.headers.get('content-type')) || ''; } catch (e) {}
      if (opt.noBody) {
        try { if (res.body && res.body.cancel) res.body.cancel(); } catch (e) {}
        return { status: res.status, ok: res.ok, text: '', url: res.url || '', ct: ct };
      }
      return withTimeout(res.text(), tmo).then(
        function (t) { return { status: res.status, ok: res.ok, text: t || '', url: res.url || '', ct: ct }; },
        function () { return { status: res.status, ok: false, text: '', url: res.url || '', ct: ct }; }
      );
    }).catch(function (e) {
      return { status: 0, ok: false, text: '', err: (e && e.message) || 'hata' };
    }).then(function (r) { netRelease(); return r; });
  }).then(function (r) {
    if (label) dbg.push(label + ' ' + (r.status || r.err || '?') + '/' + (r.text || '').length);
    return r;
  });
}

// ---------------- VK API (anonim token) ----------------

var TOKEN = null, TOKEN_P = null, TOKEN_T = 0;

function getToken(force) {
  if (force) { TOKEN = null; TOKEN_P = null; }
  if (TOKEN && Date.now() - TOKEN_T < 25 * 60 * 1000) return Promise.resolve(TOKEN);
  if (TOKEN_P) return TOKEN_P;
  TOKEN_P = getRaw(AYAR.LOGIN, vkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }), 'T', {
    method: 'POST', prio: true, timeout: 8000,
    body: formBody({
      client_id: AYAR.CLIENT_ID, client_secret: AYAR.CLIENT_SECRET, app_id: AYAR.CLIENT_ID,
      version: '1', device_id: AYAR.DEVICE_ID
    })
  }).then(function (r) {
    var tok = '';
    try { var j = JSON.parse(r.text); tok = (j && j.data && j.data.access_token) || ''; } catch (e) {}
    TOKEN_P = null;
    if (!tok) throw new Error('token alinamadi st=' + (r.status || r.err) + ' ' + String(r.text || '').slice(0, 80));
    TOKEN = tok; TOKEN_T = Date.now();
    return tok;
  }, function (e) { TOKEN_P = null; throw e; });
  return TOKEN_P;
}

function api(method, params, prio, retried) {
  return getToken(false).then(function (tok) {
    var p = {};
    Object.keys(params).forEach(function (k) { p[k] = params[k]; });
    p.access_token = tok;
    return getRaw(AYAR.API + '/' + method + '?v=' + AYAR.V + '&client_id=' + AYAR.CLIENT_ID,
      vkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }), '', { method: 'POST', body: formBody(p), prio: !!prio });
  }).then(function (r) {
    var j = null;
    try { j = JSON.parse(r.text); } catch (e) {}
    if (!j) throw new Error('VK yanit yok ' + method + ' st=' + (r.status || r.err));
    if (j.error) {
      var code = j.error.error_code;
      if (code === 5 && !retried) return getToken(true).then(function () { return api(method, params, prio, true); });
      throw new Error('VK hata ' + code + ' (' + method + '): ' + String(j.error.error_msg || '').slice(0, 60));
    }
    return j.response;
  });
}

// ---------------- Video listesi yardımcıları ----------------

function newAcc() { return { map: {}, list: [] }; }
function vkey(o) {
  var k = o.owner_id + '_' + o.id;
  return o.access_key ? k + '_' + o.access_key : k;
}
function baseKey(key) { return String(key).split('_').slice(0, 2).join('_'); }

function collectVideos(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { collectVideos(x, acc); }); return; }
  if (node.owner_id && node.id && node.title && node.duration !== undefined &&
      Number(node.id) !== 0 && Number(node.owner_id) !== 0) {
    var k = vkey(node);
    if (!acc.map[k]) { acc.map[k] = node; acc.list.push(node); }
  }
  Object.keys(node).forEach(function (kk) {
    var v = node[kk];
    if (v && typeof v === 'object') collectVideos(v, acc);
  });
}

function findCursor(root) {
  var best = null, bestCount = -1, sec = '';
  try {
    var s0 = root && root.catalog && root.catalog.sections && root.catalog.sections[0];
    sec = (s0 && s0.id) ? String(s0.id) : '';
  } catch (e) {}
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    var nf = n.next_from ? String(n.next_from) : '';
    if (nf) {
      var tmp = newAcc();
      collectVideos(n, tmp);
      if (tmp.list.length > bestCount) {
        bestCount = tmp.list.length;
        best = { next: nf, section: n.section_id ? String(n.section_id) : sec };
      }
    }
    Object.keys(n).forEach(function (k) { var v = n[k]; if (v && typeof v === 'object') walk(v); });
  }
  walk(root);
  return best;
}

function toItem(o, src) {
  var key = vkey(o);
  return {
    id: key, owner: String(o.owner_id),
    title: decodeHtml(String(o.title || '')).trim(),
    dur: parseInt(o.duration, 10) || 0,
    desc: String(o.description || '').slice(0, 300),
    src: src || 'vk'
  };
}

// VK Video araması (sitedeki gibi sayfa sayfa)
function searchVk(q, pages, sink) {
  var cur = null, page = 0, seenL = {};
  function unseen(o) { return !seenL[vkey(o)]; }
  function step() {
    if (page >= pages) return Promise.resolve();
    page++;
    var params = { q: q, count: '30', extended: '1' };
    if (cur) params.start_from = cur.next;
    return api('catalog.getVideoSearchWeb2', params, false).then(function (resp) {
      var acc = newAcc();
      collectVideos(resp, acc);
      function proceed(resp2, acc2) {
        acc2.list.forEach(function (o) { if (unseen(o)) { seenL[vkey(o)] = 1; sink.push(toItem(o, 'vk')); } });
        var nxt = findCursor(resp2);
        cur = (nxt && (!cur || nxt.next !== cur.next)) ? nxt : null;
        return cur ? step() : Promise.resolve();
      }
      if (cur && cur.section && !acc.list.some(unseen)) {
        return api('catalog.getSection', { section_id: cur.section, start_from: cur.next, count: '30', extended: '1' }, false).then(function (r2) {
          var a2 = newAcc();
          collectVideos(r2, a2);
          return a2.list.some(unseen) ? proceed(r2, a2) : proceed(resp, acc);
        }, function () { return proceed(resp, acc); });
      }
      return proceed(resp, acc);
    });
  }
  return step().catch(function (e) { dbg.push('arama hata [' + q.slice(0, 24) + '] ' + ((e && e.message) || '')); });
}

// ---------------- Yandex yardımı ----------------

function vkNorm(h) {
  return String(h || '').replace(/%252F/gi, '/').replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%3D/gi, '=')
    .replace(/%3F/gi, '?').replace(/%26/gi, '&').replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
}

// Sonuç sayfasındaki VK video numaraları: vkvideo.ru/video-123_456, vk.com/video-123_456, ?z=video-123_456, video_ext.php?oid=..&id=..
function parseEngine(html) {
  var h = vkNorm(html), out = [], seen = {}, m;
  function add(oid, id, hash) {
    if (!oid || !id || !parseInt(oid, 10) || !parseInt(id, 10)) return;
    var k = oid + '_' + id;
    if (seen[k]) return;
    seen[k] = 1;
    out.push({ key: k, vid: k + (hash ? '_' + hash : '') });
  }
  var r1 = /(?:vkvideo\.ru|vk\.com|vk\.ru)\/(?:video|clip)(-?\d+)_(\d+)(?:_([0-9a-f]{8,}))?/gi;
  while ((m = r1.exec(h)) !== null) add(m[1], m[2], m[3]);
  var r2 = /[?&]z=(?:video|clip)(-?\d+)_(\d+)/gi;
  while ((m = r2.exec(h)) !== null) add(m[1], m[2], '');
  var r3 = /video_ext\.php\?[^"'\s<>\\]*?oid=(-?\d+)[^"'\s<>\\]*?&id=(\d+)(?:[^"'\s<>\\]*?hash=([0-9a-f]{8,}))?/gi;
  while ((m = r3.exec(h)) !== null) add(m[1], m[2], m[3]);
  return out;
}

function yandexHeaders() {
  return pageHeaders({
    'User-Agent': ANDROID_UA,
    'Referer': 'https://yandex.com.tr/',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
  });
}

// Her sorgu için Yandex adresleri: mobil web, video araması (VK videolarını doğrudan listeler)
function yandexUrls(q, qi) {
  var e = encodeURIComponent(q);
  var all = [
    'https://yandex.com.tr/video/search?text=' + e,
    'https://yandex.com.tr/search/touch/?text=' + e.replace(/%20/g, '+') + '&lr=11508',
    'https://yandex.com/video/search?text=' + e,
    'https://yandex.com.tr/search/?text=' + e
  ];
  return all.slice(0, qi < 2 ? 4 : 2);
}

function yandexQueries(names, year) {
  var qs = [];
  AYAR.YANDEX_ETIKETLER.forEach(function (tag) {
    names.forEach(function (n) { qs.push(n + ' ' + tag); });
  });
  names.forEach(function (n) { qs.push('site:vkvideo.ru ' + n + (year ? ' ' + year : '') + ' izle'); });
  return uniq(qs.map(function (q) { return q.replace(/[:!?,"]+/g, ' ').replace(/\s+/g, ' ').replace(/site\s+vkvideo/, 'site:vkvideo').trim(); }))
    .slice(0, AYAR.YANDEX_SORGU);
}

// Yandex isteklerini en fazla 4'lü paralel çalıştırır; süre dolunca bırakır
function yandexRun(queries, sink) {
  var tasks = [];
  queries.forEach(function (q, qi) {
    yandexUrls(q, qi).forEach(function (u, ui) { tasks.push({ u: u, lbl: '' }); });
  });
  var idx = 0, active = 0, captcha = 0, deadline = Date.now() + AYAR.YANDEX_SURE;
  return new Promise(function (resolve) {
    var fin = false;
    function pump() {
      while (active < 4 && idx < tasks.length && Date.now() < deadline) {
        (function (t) {
          active++;
          getRaw(t.u, yandexHeaders(), t.lbl, { timeout: 6500, prio: true }).then(function (r) {
            var items = (r && r.ok) ? parseEngine(r.text) : [];
            if (r && r.ok && !items.length && /captcha/i.test(r.text || '')) captcha++;
            items.forEach(function (it) { sink.push(it); });
          }, noop).then(function () { active--; pump(); });
        })(tasks[idx++]);
      }
      if (!fin && active === 0 && (idx >= tasks.length || Date.now() >= deadline)) {
        fin = true;
        if (captcha) dbg.push('yandex captcha ' + captcha);
        resolve();
      }
    }
    pump();
  });
}

// ---------------- Başlık analizi ----------------

var STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
var NOISE = {};
['tr', 'turkce', 'turkish', 'trk', 'turk', 'dublaj', 'dublajli', 'dub', 'trdub', 'trdublaj', 'izle', 'film', 'filmi', 'filmler', 'full',
 'hd', 'fhd', 'uhd', 'bluray', 'brrip', 'bdrip', 'webrip', 'webdl', 'web', 'dl', 'hdrip', 'hdtv', 'dvdrip', 'dvd', 'x264', 'x265', 'h264', 'hevc',
 'aac', 'ac3', 'dts', 'dual', 'cift', 'tek', 'parca', 'part', 'kisim', 'bolum', 'hdfilm', 'filmizle', 'fullizle', 'yerli', 'yabanci', 'mp4', 'mkv',
 'avi', 'mov', 'com', 'ru', 'org', 'net', 'www', 'vk', 'vkvideo', 'video', 'izlesene', 'altyazi', 'altyazili', 'sub', 'subs', 'subtitle', 'subtitles',
 'en', 'eng', 'english', 'ingilizce', 'imax', 'extended', 'remastered', 'nf', 'amzn', 'sansursuz', 'tamami', 'sinema', 'yeni']
  .forEach(function (w) { NOISE[w] = 1; });

// "m1080ptr" -> 1080p tr | "filmizle" -> film izle | "2004tr" -> 2004 tr | "720pizle" -> 720p izle
function splitTok(t) {
  var m;
  if (/^\d{5,}$/.test(t)) return [];
  m = t.match(/^m?(2160|1080|720|480|360)p(tr|dual|dublaj|turkce|izle|hd|sub)?$/);
  if (m) return m[2] ? [m[1] + 'p', m[2]] : [m[1] + 'p'];
  m = t.match(/^((?:19|20)\d{2})(tr|dublaj|izle|turkce|dual|hd)$/);
  if (m) return [m[1], m[2]];
  m = t.match(/^(tr|trdub|trdublaj|dublaj|dublajli|dual|turkce)(izle|hd|film|filmi)$/) ||
      t.match(/^(film|filmi|hd|full|tek|parca|bolum|tr|dublaj|turkce|\d{3,4}p)(izle)$/) ||
      t.match(/^(izle)(tr|dublaj|turkce|hd)$/);
  if (m) return [m[1], m[2]];
  m = t.match(/^(tr|en|eng)(sub|subs|altyazi)$/);
  if (m) return [m[1], 'sub'];
  return [t];
}

function analyze(title) {
  var raw = String(title || '')
    .replace(/^\s*\d{1,3}\s*[.)\-–:]\s+/, '')            // liste sıra numarası
    .replace(/\s*[\(\[]\s*\d\s*[\)\]]\s*$/, '')          // "Film (1)"
    .replace(/(^|[^0-9])[257][.,][01](?![0-9])/g, '$1'); // ses düzeni 5.1 / 7.1
  var toks = [];
  asciiLower(raw).split(/[^a-z0-9]+/).filter(Boolean).forEach(function (t) {
    splitTok(t).forEach(function (x) { if (x) toks.push(x); });
  });
  var info = { years: [], res: 0, words: [], nums: [], bag: toks, tagset: {} };
  toks.forEach(function (t) {
    var m;
    info.tagset[t] = 1;
    if (/^(19|20)\d{2}$/.test(t)) { info.years.push(parseInt(t, 10)); return; }
    m = t.match(/^(2160|1080|720|480|360)p$/);
    if (m) { info.res = Math.max(info.res, parseInt(m[1], 10)); return; }
    if (t === '4k') { info.res = Math.max(info.res, 2160); return; }
    if (NOISE[t]) return;
    if (/^\d{1,2}$/.test(t)) { info.nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { info.nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    info.words.push(t);
  });
  info.joined = toks.join('');
  return info;
}

// Aranan başlıktan anlamlı kelimeler (TMDB tarafı)
function sigTokens(s) {
  var words = [], nums = [];
  var parts = asciiLower(s).split(/[^a-z0-9]+/).filter(Boolean);
  parts.forEach(function (t) {
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);                       // 4 haneli sayılar (2012, 1917) film adının parçası olabilir
  });
  return { words: words, nums: nums };
}

function lev(a, b) {
  if (a === b) return 0;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
function looseEq(a, b) {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && lev(a, b) <= 1;
}
// Türkçe ek toleransı: "Bourneun" ~ "Bourne", "Yolcu" ~ "Yolcusu"
var TR_SUF = /^(i|u|a|e|s|n|si|su|in|un|an|en|ya|ye|yi|yu|da|de|ta|te|ler|lar|leri|lari|nin|nun|dan|den|tan|ten|nda|nde|ndan|nden|ni|na|ne|ndaki)$/;
function sufEq(a, b) {
  var s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  return s.length >= 4 && l.length > s.length && l.length - s.length <= 5 && l.indexOf(s) === 0 && TR_SUF.test(l.slice(s.length));
}
function tokEq(w, b) { return looseEq(w, b) || sufEq(w, b); }

// Ad eşleşmesi: TR veya EN adlardan biri başlıkta tam geçmeli. Dönüş: { exact, extra } ya da null
function nameMatch(info, wants) {
  for (var i = 0; i < wants.length; i++) {
    var want = String(wants[i] || '').replace(/['’`]/g, '');
    var sw = sigTokens(want), ww = sw.words;
    if (!ww.length) continue;
    var covered = ww.every(function (w) { return info.bag.some(function (b) { return tokEq(w, b); }); });
    if (!covered) {
      var wn = norm(want);                                    // bitişik yazım: "YapayZeka" ~ "Yapay Zeka"
      if (wn.length >= 6 && info.joined && info.joined.indexOf(wn) > -1) covered = true;
    }
    if (!covered) continue;
    if (ww.length === 1 && ww[0].length <= 2 && info.words.length > 3) continue;   // "Up", "It": başka film olabilir
    if (sw.nums.length) {                                     // sıra numarası (Taken 2 / Taken 3) aynı olmalı
      if (!sw.nums.some(function (n) { return info.nums.indexOf(n) > -1; })) continue;
    } else if (info.nums.some(function (n) { return n >= 2 && n <= 20; })) {
      continue;                                               // aranan adda sayı yok ama başlıkta 2/3/4: devam filmi
    }
    var extra = info.words.filter(function (b) { return !ww.some(function (w) { return tokEq(w, b); }); });
    return { exact: extra.length === 0, extra: extra.length, name: wants[i] };
  }
  return null;
}

// Etiket: TR dublaj / Türkçe dublaj / TR / izle ... Dönüş: { ok, label, strength }
function langInfo(info) {
  var t = info.tagset;
  function has() { for (var i = 0; i < arguments.length; i++) if (t[arguments[i]]) return true; return false; }
  var dub = has('dublaj', 'dublajli', 'dub', 'trdub', 'trdublaj');
  var tr = has('tr', 'turkce', 'turkish', 'trk', 'turk', 'turkiye', 'trdub', 'trdublaj');
  var sub = has('altyazi', 'altyazili', 'sub', 'subs', 'subtitle', 'subtitles');
  var dual = has('dual', 'cift');
  var foreign = has('en', 'eng', 'english', 'ingilizce', 'rus', 'russian', 'rusca', 'ger', 'german', 'fre', 'french', 'vostfr', 'arabic', 'arapca', 'hindi', 'multi');
  var izle = has('izle');
  if (dub && !(foreign && !tr)) return { ok: true, label: tr ? 'TR Dublaj' : 'Dublaj', strength: tr ? 4 : 3 };
  if (tr && dual) return { ok: true, label: 'TR Dual', strength: 2 };
  if (tr && !sub && !foreign) return { ok: true, label: 'TR', strength: 2 };
  if (izle && !tr && !sub && !foreign) return { ok: true, label: 'TR İzle', strength: 1 };
  return { ok: false, label: sub ? 'Altyazı' : '?', strength: 0 };
}

// Puanlama: null = ele, yoksa { score, lang, strength, info }
function rankItem(item, ctx) {
  if (/[\u0400-\u04FF]/.test(item.title)) return null;                          // Rusça (Kiril) başlık
  var info = analyze(item.title);
  var nm = nameMatch(info, ctx.wants);
  if (!nm) return null;

  var li = langInfo(info);
  if (!li.ok && item.desc) {                                                     // açıklamada etiket varsa kullan
    var li2 = langInfo(analyze(item.desc));
    if (li2.ok && li2.strength >= 3) li = li2;
  }
  if (!li.ok) {
    if (AYAR.ZORUNLU_ETIKET) return null;                                       // etiket YOKSA alma
    if (info.tagset.altyazi || info.tagset.altyazili || info.tagset.sub) return null;
    li = { ok: true, label: 'Dil ?', strength: 0 };
  }

  var score = 50 + li.strength * 5;
  if (nm.exact) score += 10;
  score -= Math.min(15, nm.extra * 3);

  if (info.years.length && ctx.year) {                                           // başlıktaki yıl (adın parçası olan yıl sayılmaz)
    var nameWords = sigTokens(nm.name).words;
    var ys = info.years.filter(function (y) { return nameWords.indexOf(String(y)) === -1; });
    if (ys.length) {
      var yd = 99;
      ys.forEach(function (y) { yd = Math.min(yd, Math.abs(y - ctx.year)); });
      if (yd > (AYAR.YIL_TOLERANS || 0)) return null;
      score += yd === 0 ? 20 : 10;
    }
  }

  if (item.dur) {
    if (item.dur < (AYAR.MIN_SURE || 0)) return null;                            // fragman / klip / kesit
    if (ctx.runtime) {
      var r = item.dur / (ctx.runtime * 60), d = Math.abs(r - 1);
      if (r < 0.5 || r > 1.7) return null;                                       // süre bambaşka: başka içerik / birleşik
      if (d <= 0.06) score += 25; else if (d <= 0.15) score += 10; else if (d > 0.35) score -= 15;
    }
  }
  if (info.res >= 1080) score += 3; else if (info.res >= 720) score += 2;
  if (item.src === 'yandex') score += 1;

  if (score < 55) return null;
  return { score: score, lang: li.label, strength: li.strength, info: info };
}

// ---------------- Video bağlantıları ----------------

function isImage(u) {
  if (u.indexOf('.mp4') > -1 || u.indexOf('.m3u8') > -1 || u.indexOf('.mpd') > -1) return false;
  return u.indexOf('.jpg') > -1 || u.indexOf('.jpeg') > -1 || u.indexOf('.png') > -1 || u.indexOf('.webp') > -1 ||
    u.indexOf('getVideoPreview') > -1 || u.indexOf('userapi.com') > -1 || u.indexOf('vkuserphoto') > -1;
}
function isMedia(u) {
  if (isImage(u)) return false;
  if (u.indexOf('video_ext.php') > -1) return false;
  var host = (u.match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '';
  if (/(^|\.)(vkvideo\.ru|vk\.com|vk\.ru|m\.vk\.com)$/i.test(host)) return false;
  return u.indexOf('.m3u8') > -1 || u.indexOf('.mpd') > -1 || u.indexOf('.mp4') > -1 || u.indexOf('okcdn.ru') > -1 ||
    /(mycdn\.me|vkuservideo\.(net|ru)|vkvd\d*\.)/i.test(host) || /[?&]type=\d/.test(u);
}
function cleanUrl(u) { return String(u || '').replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'); }

function scanUrls(node, hint, out) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') { if (node.indexOf('http') === 0) out.push([hint, node]); return; }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { scanUrls(x, hint, out); }); return; }
  Object.keys(node).forEach(function (k) {
    if (k === 'image' || k === 'first_frame' || k.indexOf('photo_') === 0) return;
    scanUrls(node[k], k, out);
  });
}

function qualityOf(hint, u) {
  var m = String(hint || '').match(/(\d{3,4})/);
  if (m) return parseInt(m[1], 10);
  var t = String(u || '').match(/[?&]type=(\d+)/);
  if (t) return { 0: 144, 1: 240, 2: 360, 3: 480, 4: 720, 5: 1080, 6: 1440, 7: 2160 }[parseInt(t[1], 10)] || 0;
  return 0;
}

// Bir videonun oynatma bağlantıları: [{ hint, url, src }]
// Kaynaklar: video.getByIds (+ video.get yedeği), getForPlay, getPlayerConfig, oynatıcı (embed) sayfası;
// hiçbiri bağlantı vermezse: vk.com / m.vk.com sayfaları (mobil UA). Her denemenin sonucu tek "play ..." satırında özetlenir.
function getPlay(item) {
  var key = item.id, parts = key.split('_'), oid = parts[0] || '', vid = parts[1] || '', ak = parts[2] || '';
  var links = [], seen = {}, gotItem = false;
  var stat = { api: 0, play: 0, embed: 0, alt: 0 }, rej = [], errs = [], es = [];
  function reject(u) {
    var h = (String(u).match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '';
    if (h && !isImage(u) && /\.(m3u8|mp4|mpd)|okcdn|mycdn|vkuservideo|vkvd/i.test(u) && rej.indexOf(h) === -1 && rej.length < 4) rej.push(h.slice(0, 24));
  }
  function push(hint, u, src) {
    var cu = cleanUrl(u);
    if (seen[cu]) return;
    if (isMedia(cu)) { seen[cu] = 1; links.push({ hint: hint, url: cu, src: src }); stat[src]++; } else reject(cu);
  }
  function add(node, src) {
    var list = [];
    scanUrls(node, '', list);
    list.forEach(function (p) { push(p[0], p[1], src); });
  }
  // HTML / JS içinde nerede olursa olsun medya adreslerini bulur
  function addHtml(html, src) {
    var t = String(html || '').replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&quot;/g, '"').replace(/&amp;/g, '&'), m;
    var rx = /"([A-Za-z0-9_]+)"\s*:\s*"(https?:\/\/[^"\s]+)"/g;
    while ((m = rx.exec(t)) !== null) push(m[1], m[2], src);
    var rx2 = /https?:\/\/[^\s"'<>\\]+/g;
    while ((m = rx2.exec(t)) !== null) push('', m[0], src);
  }
  function fromItems(r) {
    var acc = newAcc();
    collectVideos(r, acc);
    if (acc.list.length) {
      gotItem = true;
      var o = acc.list[0];
      add(o, 'api');
      if (!item.dur) item.dur = parseInt(o.duration, 10) || 0;
      if (o.player) item.player = String(o.player);
    } else add(r, 'api');
  }
  function embedOne(u, hdr, src) {
    return getRaw(u, hdr, '', { prio: true, timeout: 7000 }).then(function (r) {
      es.push((r.status || r.err || '?') + '/' + (r.text || '').length);
      if (r.ok) addHtml(r.text, src);
    });
  }
  function fetchEmbed() {
    var std = AYAR.SITE + '/video_ext.php?oid=' + oid + '&id=' + vid + (ak ? '&hash=' + ak : '');
    var urls = [item.player || std];
    if (item.player && item.player !== std) urls.push(std);
    return Promise.all(urls.map(function (u) { return embedOne(u, vkHeaders({ 'Accept': 'text/html,*/*' }), 'embed').catch(noop); }));
  }
  function fetchAlt() {                                   // son yedek: vk.com video_ext + mobil sayfa (mobil UA)
    if (links.length) return Promise.resolve();
    var mh = pageHeaders({ 'User-Agent': ANDROID_UA, 'Accept': 'text/html,*/*', 'Referer': AYAR.SITE + '/' });
    var urls = [
      'https://vk.com/video_ext.php?oid=' + oid + '&id=' + vid + (ak ? '&hash=' + ak : ''),
      'https://m.vk.com/video' + oid + '_' + vid + (ak ? '?access_key=' + ak : ''),
      (item.player || (AYAR.SITE + '/video_ext.php?oid=' + oid + '&id=' + vid + (ak ? '&hash=' + ak : '')))
    ];
    return Promise.all(urls.map(function (u) { return embedOne(u, mh, 'alt').catch(noop); }));
  }
  function err(tag) { return function (e) { errs.push(tag + ':' + String((e && e.message) || '').slice(0, 40)); }; }
  var playParams = { videos: key, video: key, owner_id: oid, video_id: vid, id: vid };
  var main = api('video.getByIds', { videos: key }, true).then(fromItems, err('getByIds'))
    .then(function () {
      if (gotItem) return null;
      return api('video.get', { videos: key }, true).then(fromItems, err('get'));
    })
    .then(fetchEmbed);
  return Promise.all([
    main,
    api('video.getForPlay', playParams, true).then(function (r) { add(r, 'play'); }, err('forPlay')),
    api('video.getPlayerConfig', playParams, true).then(function (r) { add(r, 'play'); }, err('cfg'))
  ]).then(fetchAlt).then(function () {
    dbg.push('play ' + key + ' item:' + (gotItem ? 1 : 0) + ' api:' + stat.api + ' play:' + stat.play + ' embed:' + stat.embed + ' alt:' + stat.alt +
      ' es:' + es.join(',') + (rej.length ? ' rej:' + rej.join(',') : '') + (errs.length ? ' err:' + errs.join(',') : ''));
    return links;
  });
}

function isHlsLink(l) { return l.url.indexOf('.m3u8') > -1 || /hls/i.test(String(l.hint || '')); }
function isDashLink(l) { return l.url.indexOf('.mpd') > -1 || /dash/i.test(String(l.hint || '')); }
function isMp4Link(l) { return !isHlsLink(l) && !isDashLink(l); }

// Oynatıcıya verilecek başlık yöntemleri: hangisi çalışıyorsa o kullanılır
var HDR_VARIANTS = [
  function () { return { 'User-Agent': UA_VK, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE }; },
  function () { return { 'User-Agent': ANDROID_UA, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE }; },
  function () { return { 'User-Agent': UA_VK }; },
  function () { return {}; }
];

function probeState(r, isHls) {                      // 1 = çalışıyor, -1 = çalışmıyor, 0 = belirsiz (ağ hatası)
  if (!r || !r.status) return 0;
  if (isHls) return (r.ok && /^\s*#EXTM3U/.test(r.text || '')) ? 1 : -1;
  if (r.status === 200 || r.status === 206) return /text\/html|json/i.test(r.ct || '') ? -1 : 1;
  return -1;
}

// Adreste srcAg=CHROME_LINUX gibi değer varsa adres o tarayıcı kimliğine bağlıdır: önce ona uyan UA denenir
function uaForUrl(u) {
  var m = String(u || '').match(/[?&]srcAg=([^&]+)/);
  if (!m) return '';
  var a = String(m[1]).toUpperCase();
  if (/ANDROID|MOBILE/.test(a)) return ANDROID_UA;
  if (/WINDOWS/.test(a)) return UA_ENGINE;
  if (/LINUX/.test(a)) return UA_VK;
  return '';
}
function hdrList(url) {
  var list = [], ua = uaForUrl(url), seenH = {};
  function add(h) { var k = JSON.stringify(h); if (seenH[k]) return; seenH[k] = 1; list.push(h); }
  if (ua) {
    add({ 'User-Agent': ua, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE });
    add({ 'User-Agent': ua });
  }
  HDR_VARIANTS.forEach(function (mk) { add(mk()); });
  add({ 'User-Agent': UA_VK, 'Referer': AYAR.SITE + '/' });
  add({ 'User-Agent': ANDROID_UA });
  return list;
}

// Her bağlantı ayrı denenir: önce ilk 3 başlık takımı, tutmazsa kalanlar. Kabul edilen takım l.headers, kesin ölü ise l.dead
function probeLink(l) {
  var isH = !isMp4Link(l), hv = hdrList(l.url);
  function one(i) {
    var ph = {};
    Object.keys(hv[i]).forEach(function (k) { ph[k] = hv[i][k]; });
    if (!isH) ph['Range'] = 'bytes=0-1';
    return getRaw(l.url, ph, '', { timeout: 4000, prio: true, noBody: !isH }).then(function (r) {
      return { i: i, v: probeState(r, isH), st: r.status || r.err || '?' };
    });
  }
  function wave(from, to) {
    var idx = [];
    for (var i = from; i < Math.min(to, hv.length); i++) idx.push(i);
    return Promise.all(idx.map(one));
  }
  function good(rs) { return rs.some(function (x) { return x.v === 1; }); }
  return wave(0, 3).then(function (a) {
    return good(a) ? a : wave(3, hv.length).then(function (b) { return a.concat(b); });
  }).then(function (rs) {
    var okR = null, unknown = false;
    rs.forEach(function (x) { if (x.v === 1 && !okR) okR = x; if (x.v === 0) unknown = true; });
    l.diag = rs.map(function (x) { return 'V' + x.i + ':' + x.st; }).join(' ');
    if (okR) l.headers = hv[okR.i];
    else if (!unknown) l.dead = true;
    return l;
  }, function () { return l; });
}

function verifyItem(item, links) {
  var pl = { links: links, hlsVars: [], headers: HDR_VARIANTS[0](), allDead: false };
  if (!links.length) return Promise.resolve(pl);
  var targets = links.filter(isMp4Link).slice(0, 4).concat(links.filter(isHlsLink).slice(0, 1));
  if (!targets.length) return Promise.resolve(pl);
  return Promise.all(targets.map(probeLink)).then(function () {
    var okL = null;
    targets.forEach(function (l) { if (!l.dead && l.headers && !okL) okL = l; });
    if (!okL) targets.forEach(function (l) { if (!l.dead && !okL) okL = l; });
    if (okL && okL.headers) pl.headers = okL.headers;
    pl.allDead = !okL && targets.some(function (l) { return l.dead; });
    dbg.push('probe ' + item.id + ' ' + targets.map(function (l) { return (isMp4Link(l) ? 'mp4' : 'hls') + ':' + (l.diag || '?'); }).join(' | '));
    return pl;
  });
}

function absUrl(u, base) {
  u = String(u || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  var m = String(base).match(/^(https?:\/\/[^\/]+)/i);
  if (u.charAt(0) === '/') return (m ? m[1] : '') + u;
  return String(base).replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/') + u;
}
function parseHlsMaster(text, base) {
  var lines = String(text || '').split(/\r?\n/), best = {}, out = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    var rm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/), bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1], 10) || 0;
    var j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].charAt(0) === '#')) j++;
    if (j >= lines.length) continue;
    var h = 0;
    if (rm) {
      var L = Math.max(parseInt(rm[1], 10), parseInt(rm[2], 10));
      h = L >= 3400 ? 2160 : L >= 2400 ? 1440 : L >= 1700 ? 1080 : L >= 1100 ? 720 : L >= 800 ? 480 : L >= 560 ? 360 : L >= 380 ? 240 : 144;
    }
    var key = h || ('bw' + bw);
    if (!best[key] || bw > best[key].bw) best[key] = { url: absUrl(lines[j], base), h: h, bw: bw };
  }
  Object.keys(best).forEach(function (k) { out.push(best[k]); });
  out.sort(function (a, b) { return (b.h - a.h) || (b.bw - a.bw); });
  return out;
}
function expandHls(url, headers) {
  return getRaw(url, headers || HDR_VARIANTS[0](), '', { timeout: 3000, prio: true }).then(function (r) {
    return r.ok ? parseHlsMaster(r.text, url) : [];
  });
}

function makeStreams(item, ranked, pl) {
  var headers = pl.headers || HDR_VARIANTS[0]();
  var parts = [AYAR.EKLENTI_ADI, ranked.lang], dur = fmtDur(item.dur);
  function lbl(extra) {
    var a = parts.concat([extra]);
    if (dur) a.push(dur);
    if (AYAR.DEBUG_MODU) a.push('[' + String(item.title).slice(0, 60) + ']');
    return a.join(' | ');
  }
  var mp4 = [], extras = [], mp4h = {}, seen = {};
  (pl.links || []).forEach(function (l) {
    var u = l.url, hint = String(l.hint || '');
    if (seen[u]) return;
    seen[u] = 1;
    var hdr = l.headers || headers;
    var dg = (AYAR.TANI && l.diag) ? ' [' + l.diag + ']' : '';
    var bad = l.dead ? ' (test başarısız)' : '';
    var s;
    if (isHlsLink(l)) {
      s = { name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' HLS' + dg, title: lbl('HLS Auto' + bad), url: u, quality: 'Auto', headers: hdr, provider: PROVIDER_ID };
      if (l.dead) s._dead = true;
      extras.push(s);
      return;
    }
    if (isDashLink(l)) {
      extras.push({ name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' DASH', title: lbl('DASH Auto'), url: u, quality: 'Auto', headers: hdr, provider: PROVIDER_ID });
      return;
    }
    var q = qualityOf(hint, u), key = q ? q + 'p' : 'Auto';
    var tag = (q && mp4h[q]) ? ' #2' : '';
    if (q) mp4h[q] = (mp4h[q] || 0) + 1;
    s = { name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' ' + key + tag + dg, title: lbl(key + tag + bad), url: u, quality: key, type: 'mp4', headers: hdr, provider: PROVIDER_ID };
    if (l.dead) s._dead = true;
    mp4.push(s);
  });
  (pl.hlsVars || []).forEach(function (v) {
    if (!v.h || mp4h[v.h] || seen[v.url]) return;
    seen[v.url] = 1;
    mp4h[v.h] = 1;
    mp4.push({ name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' ' + v.h + 'p', title: lbl(v.h + 'p HLS'), url: v.url, quality: v.h + 'p', headers: pl.hlsHdr || headers, provider: PROVIDER_ID });
  });
  mp4.sort(function (a, b) { return heightOf(b.quality) - heightOf(a.quality); });
  return mp4.concat(extras);
}

// ============================================================
//  NUVIO GİRİŞ NOKTASI
// ============================================================

function debugStream(msg) {
  if (!AYAR.DEBUG_MODU) return [];
  return [msg].concat(dbg.slice(0, 80)).map(function (r) {
    return { name: 'DEBUG ' + r, title: 'DEBUG ' + r, url: 'https://debug.invalid/', quality: 'Auto', provider: PROVIDER_ID };
  });
}

// VK Video sorguları: her etiket için önce TR ad sonra EN ad (ör. "Kelebek Etkisi Türkçe Dublaj", "The Butterfly Effect Türkçe Dublaj")
function buildVkQueries(names, year) {
  var qs = [];
  AYAR.VK_ETIKETLER.forEach(function (tag) {
    names.forEach(function (n) { qs.push((n + ' ' + tag).trim()); });
  });
  names.forEach(function (n) { if (year) qs.push(n + ' ' + year + ' TR'); });
  return uniq(qs.map(function (q) { return q.replace(/\s+/g, ' ').trim(); }).filter(function (q) { return q.length >= 3; }))
    .slice(0, AYAR.MAX_SORGU);
}

function getStreamsInner(tmdbId, mediaType, holder) {
  holder = holder || { partial: [], pu: {} };
  if (mediaType !== 'movie') return Promise.resolve([]);
  dbg = ['vkyandex v1.0.1'];
  var T0 = Date.now();
  var base = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;

  return Promise.all([
    getJson(base + '&language=tr-TR&append_to_response=alternative_titles,translations'),
    getJson(base + '&language=en-US').catch(function () { return {}; })
  ]).then(function (both) {
    var info = both[0], en = both[1] || {};
    var year = parseInt((info.release_date || '').slice(0, 4), 10) || 0;
    if (!info.title && !info.original_title) return debugStream('TMDB bilgisi eksik');

    // Aranan adlar: Türkçe ad + İngilizce ad + orijinal ad (+ TMDB'deki TR/US/GB alternatif adları eşleştirme için)
    var names = uniq([info.title, en.title, info.original_title]).filter(function (n) { return n && n.length >= 2; });
    var alts = [];
    try {
      ((info.alternative_titles && info.alternative_titles.titles) || []).forEach(function (a) {
        if (a && a.title && /^(TR|US|GB)$/.test(a.iso_3166_1 || '')) alts.push(a.title);
      });
      ((info.translations && info.translations.translations) || []).forEach(function (t) {
        if (t && (t.iso_639_1 === 'tr' || t.iso_639_1 === 'en') && t.data && t.data.title) alts.push(t.data.title);
      });
    } catch (e) {}
    var wants = uniq(names.concat(alts.slice(0, 8)));
    var ctx = { year: year, runtime: info.runtime || en.runtime || 0, wants: wants };
    dbg.push('film ' + names.join(' / ') + ' ' + year + ' ' + ctx.runtime + 'dk');

    var queries = buildVkQueries(names, year);
    var sinks = queries.map(function () { return []; });
    var engSink = [];
    var jobs = queries.map(function (q, i) { return searchVk(q, AYAR.SORGU_SAYFA, sinks[i]); });
    if (AYAR.YANDEX) jobs.push(yandexRun(yandexQueries(names, year), engSink));

    return waitWithin(jobs, AYAR.ARAMA_SURESI).then(function () {
      var seen = {}, all = [];
      sinks.forEach(function (l) {
        l.forEach(function (it) { var b = baseKey(it.id); if (!seen[b]) { seen[b] = 1; all.push(it); } });
      });
      dbg.push('vk sonuc ' + all.length + ' ' + (Date.now() - T0) + 'ms');

      var ranked = [];
      function rankAll() {
        ranked = [];
        all.forEach(function (it) {
          var r = rankItem(it, ctx);
          if (r) ranked.push({ item: it, r: r });
        });
        ranked.sort(function (a, b) { return (b.r.strength - a.r.strength) || (b.r.score - a.r.score); });
      }
      rankAll();
      dbg.push('aday ' + ranked.length);

      // Yandex'ten gelen VK numaraları VK API'den doğrulanır (gerçek başlık + süre), 10'arlı toplu istek
      function yandexDogrula() {
        var cands = [], sn = {};
        engSink.forEach(function (it) { if (!seen[it.key] && !sn[it.key]) { sn[it.key] = 1; cands.push(it); } });
        dbg.push('yandex aday ' + cands.length);
        if (!cands.length) return Promise.resolve();
        var lim = cands.slice(0, AYAR.YANDEX_ADAY), chunks = [], i;
        for (i = 0; i < lim.length; i += 10) chunks.push(lim.slice(i, i + 10));
        return waitWithin(chunks.map(function (ch) {
          return api('video.getByIds', { videos: ch.map(function (c) { return c.vid; }).join(',') }, false).then(function (r) {
            var acc = newAcc();
            collectVideos(r, acc);
            acc.list.forEach(function (o) {
              var it = toItem(o, 'yandex'), b = baseKey(it.id);
              if (it.id.split('_').length < 3) {                       // API erişim anahtarı vermediyse Yandex adresindeki hash'i kullan
                ch.forEach(function (c) { if (c.key === b && c.vid.split('_').length > 2) it.id = c.vid; });
              }
              if (!seen[b]) { seen[b] = 1; all.push(it); }
            });
          }, function (e) { dbg.push('yandex dogrulama ' + ((e && e.message) || '')); });
        }), 4500).then(function () { rankAll(); dbg.push('yandex sonrasi aday ' + ranked.length); });
      }

      return yandexDogrula().then(function () {
        if (AYAR.DEBUG_MODU) ranked.slice(0, 6).forEach(function (x) { dbg.push('aday ' + x.r.score + ' ' + x.r.lang + ' ' + x.item.title.slice(0, 50) + ' ' + fmtDur(x.item.dur)); });
        if (!ranked.length) return debugStream('uygun video yok: ' + names[0] + ' ' + year);

        var top = ranked.slice(0, AYAR.MAX_ADAY);
        var res = top.map(function () { return null; }), hjobs = [];
        var ljobs = top.map(function (x, i) {
          return getPlay(x.item).then(function (links) { return verifyItem(x.item, links); }).then(function (pl) {
            res[i] = pl;
            if (!pl.allDead) {                                           // ilk hazır kaynaklar: süre dolarsa en azından bunlar verilsin
              try {
                makeStreams(x.item, x.r, pl).forEach(function (s) { if (!s._dead && !holder.pu[s.url]) { holder.pu[s.url] = 1; holder.partial.push(s); } });
              } catch (e) {}
            }
            var hl = null;
            pl.links.forEach(function (l) { if (!hl && isHlsLink(l) && !l.dead) hl = l; });
            if (hl) {
              pl.hlsHdr = hl.headers || pl.headers;
              hjobs.push(expandHls(hl.url, pl.hlsHdr).then(function (v) { pl.hlsVars = v; }, noop));
            }
          }, function (e) { dbg.push('play hata ' + x.item.id + ' ' + ((e && e.message) || '')); });
        });
        return waitWithin(ljobs, AYAR.KAYNAK_SURESI).then(function () {
          return waitWithin(hjobs, 1800);
        }).then(function () {
          var streams = [], dead = [], seenUrl = {};
          top.forEach(function (x, i) {
            var pl = res[i];
            if (!pl || !pl.links.length) { dbg.push('baglanti yok ' + x.item.id); return; }
            makeStreams(x.item, x.r, pl).forEach(function (s) {
              if (seenUrl[s.url]) return;
              seenUrl[s.url] = 1;
              (s._dead ? dead : streams).push(s);
            });
          });
          if (AYAR.TANI) streams = streams.concat(dead);                 // tanı modu: testi geçemeyenler de en sonda (kodlarıyla)
          streams.forEach(function (s) { delete s._dead; });
          dbg.push('bitti ' + (Date.now() - T0) + 'ms');
          if (!streams.length) return debugStream('baglanti cikmadi');
          return streams;
        });
      });
    });
  }).catch(function (e) { return holder.partial.length ? holder.partial : debugStream('hata ' + (e && e.message)); });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var holder = { partial: [], pu: {} }, done = false;
  return new Promise(function (resolve) {
    var tmr = setTimeout(function () {
      fin(holder.partial.length ? holder.partial : debugStream('zaman asimi'));
    }, AYAR.GENEL_SURE);
    function fin(v) {
      if (done) return;
      done = true; clearTimeout(tmr);
      resolve(v || []);
    }
    getStreamsInner(tmdbId, mediaType, holder).then(fin, function (e) {
      fin(holder.partial.length ? holder.partial : debugStream('hata ' + (e && e.message)));
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams, _t: { rankItem: rankItem, analyze: analyze, langInfo: langInfo, nameMatch: nameMatch, parseEngine: parseEngine, buildVkQueries: buildVkQueries, yandexQueries: yandexQueries } };
} else {
  global.getStreams = getStreams;
}
