'use strict';
/* Abiline. Kõik andmed on selles seadmes: tekst localStorage'is, visioonitahvli pildid IndexedDB-s.
   Andmekiht on koondatud (S, save, img*), et hiljem saaks sünki selle taha panna. */

// ---------- andmed ----------
const KEY = 'abiline.v1';
const DEF = { v: 1, goals: { kcal: 2400, p: 160, f: 75, c: 280 }, foods: [], log: {}, weight: {}, plan: {}, events: [], targets: [], vision: [] };
const clone = o => JSON.parse(JSON.stringify(o));
function normalize(r) {
  const s = Object.assign(clone(DEF), r && typeof r === 'object' ? r : {});
  s.goals = Object.assign(clone(DEF.goals), s.goals || {});
  for (const k of ['foods', 'events', 'targets', 'vision']) if (!Array.isArray(s[k])) s[k] = [];
  for (const k of ['log', 'weight', 'plan']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  for (const t of s.targets) if (!Array.isArray(t.steps)) t.steps = [];
  return s;
}
function load() { try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return normalize(null); } }
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Salvestamine ei õnnestunud'); } }

// pildid
let dbp;
function idb() {
  return dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('abiline', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
async function imgTx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('img', mode);
    const rq = fn(tx.objectStore('img'));
    tx.oncomplete = () => res(rq && rq.result);
    tx.onerror = () => rej(tx.error);
  });
}
const imgPut = (id, blob) => imgTx('readwrite', s => s.put(blob, id));
const imgGet = id => imgTx('readonly', s => s.get(id));
const imgDel = id => imgTx('readwrite', s => s.delete(id));
const urls = {};
async function imgUrl(id) {
  if (urls[id]) return urls[id];
  const b = await imgGet(id);
  return b ? (urls[id] = URL.createObjectURL(b)) : null;
}
function loadImgs() {
  document.querySelectorAll('img[data-img]:not([src])').forEach(async el => {
    const u = await imgUrl(el.dataset.img).catch(() => null);
    if (u) el.src = u; else el.alt = 'Pilti ei leitud';
  });
}
async function shrink(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', 0.85));
}

// ---------- abifunktsioonid ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) && n >= 0 ? n : 0; };
const fmt = (n, d = 0) => { const k = 10 ** d; return ((Math.round(n * k) / k) || 0).toFixed(d).replace('.', ',').replace('-', '−'); };
const n1 = n => String(Math.round(n * 10) / 10).replace('.', ',');
const r0 = n => Math.round(n);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const WD = ['pühapäev', 'esmaspäev', 'teisipäev', 'kolmapäev', 'neljapäev', 'reede', 'laupäev'];
const WD1 = ['P', 'E', 'T', 'K', 'N', 'R', 'L'];
const MON = ['jaanuar', 'veebruar', 'märts', 'aprill', 'mai', 'juuni', 'juuli', 'august', 'september', 'oktoober', 'november', 'detsember'];
const MON3 = ['jaan', 'veebr', 'märts', 'apr', 'mai', 'juuni', 'juuli', 'aug', 'sept', 'okt', 'nov', 'dets'];
const cap = s => s[0].toUpperCase() + s.slice(1);
const longDate = s => { const d = pd(s); return `${cap(WD[d.getDay()])}, ${d.getDate()}. ${MON[d.getMonth()]}`; };
const shortDate = s => { const d = pd(s); return `${d.getDate()}. ${MON3[d.getMonth()]}`; };
function dayLabel(s) {
  const t = today();
  if (s === t) return 'Täna';
  if (s === addDays(t, -1)) return 'Eile';
  if (s === addDays(t, 1)) return 'Homme';
  return shortDate(s);
}

function dayTotals(date) {
  const t = { kcal: 0, p: 0, f: 0, c: 0, n: 0 };
  for (const e of S.log[date] || []) { const q = e.qty || 1; t.kcal += e.kcal * q; t.p += e.p * q; t.f += e.f * q; t.c += e.c * q; t.n++; }
  return t;
}
// Päeva hinne: kalorid ±10% sihist ja valk vähemalt 95% sihist.
function dayStatus(date) {
  const t = dayTotals(date), g = S.goals;
  if (!t.n) return 'none';
  const k = g.kcal > 0 && Math.abs(t.kcal - g.kcal) <= g.kcal * 0.1;
  const p = g.p > 0 && t.p >= g.p * 0.95;
  return k && p ? 'good' : (k || p) ? 'half' : 'miss';
}
const STATUS = { good: 'Sihid täis', half: 'Pooleldi', miss: 'Mööda', none: 'Sisestamata' };
function weightAt(date) {
  const ks = Object.keys(S.weight).filter(k => k <= date).sort();
  const k = ks[ks.length - 1];
  return k ? { date: k, kg: S.weight[k] } : null;
}
const byTime = (a, b) => { const x = a.time || '99:99', y = b.time || '99:99'; return x < y ? -1 : x > y ? 1 : 0; };
const planOf = date => (S.plan[date] || []).slice().sort(byTime);
function occurs(ev, date) {
  if (date < ev.date) return false;
  if (ev.date === date) return true;
  const a = pd(ev.date), b = pd(date);
  if (ev.repeat === 'weekly') return a.getDay() === b.getDay();
  if (ev.repeat === 'monthly') return a.getDate() === b.getDate();
  if (ev.repeat === 'yearly') return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
  return false;
}
const eventsOn = date => S.events.filter(e => occurs(e, date)).sort((x, y) => (x.time || '').localeCompare(y.time || ''));
function upcoming(n) {
  const out = []; let d = today();
  for (let i = 0; i < 365 && out.length < n; i++) {
    for (const e of eventsOn(d)) { if (out.length < n) out.push({ e, date: d }); }
    d = addDays(d, 1);
  }
  return out;
}
const REPEAT = { none: 'Ei kordu', weekly: 'Iga nädal', monthly: 'Iga kuu', yearly: 'Iga aasta' };
const KINDS = { month: 'Kuu', quarter: 'Kvartal', half: 'Pool aastat', year: 'Aasta' };
function periodInfo(kind, off) {
  const n = new Date(), y = n.getFullYear();
  let start, end, label, key;
  if (kind === 'month') {
    start = new Date(y, n.getMonth() + off, 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = `${MON[start.getMonth()]} ${start.getFullYear()}`; key = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
  } else if (kind === 'quarter') {
    start = new Date(y, (Math.floor(n.getMonth() / 3) + off) * 3, 1); end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    const q = Math.floor(start.getMonth() / 3) + 1;
    label = `${q}. kvartal ${start.getFullYear()}`; key = `${start.getFullYear()}-Q${q}`;
  } else if (kind === 'half') {
    start = new Date(y, (Math.floor(n.getMonth() / 6) + off) * 6, 1); end = new Date(start.getFullYear(), start.getMonth() + 6, 0);
    const h = Math.floor(start.getMonth() / 6) + 1;
    label = `${h}. poolaasta ${start.getFullYear()}`; key = `${start.getFullYear()}-H${h}`;
  } else {
    start = new Date(y + off, 0, 1); end = new Date(y + off, 11, 31);
    label = `Aasta ${y + off}`; key = `${y + off}`;
  }
  const t = pd(today());
  const left = Math.round((end - t) / 864e5);
  const when = t < start ? 'Pole veel alanud' : left < 0 ? 'Lõppenud' : left === 0 ? 'Viimane päev' : left === 1 ? '1 päev jäänud' : `${left} päeva jäänud`;
  return { label, key, when };
}
const AVG = { week: ['Nädal', 7], month: ['Kuu', 30], q3: ['3 kuud', 90], q6: ['6 kuud', 180], year: ['Aasta', 365] };
function averages(days) {
  const t = { kcal: 0, p: 0, f: 0, c: 0 }; let n = 0, d = today();
  for (let i = 0; i < days; i++) {
    const x = dayTotals(d);
    if (x.n) { n++; t.kcal += x.kcal; t.p += x.p; t.f += x.f; t.c += x.c; }
    d = addDays(d, -1);
  }
  if (n) for (const k in t) t[k] /= n;
  return { n, t };
}

// ---------- ikoonid ja väikesed tükid ----------
const sv = (p, w = 18, sw = 2.4) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const P_PLUS = '<path d="M12 5v14M5 12h14"/>';
const I = {
  left: sv('<path d="M15 5l-7 7 7 7"/>'), right: sv('<path d="M9 5l7 7-7 7"/>'), x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  xs: sv('<path d="M6 6l12 12M18 6L6 18"/>', 16, 2.4), down: sv('<path d="M6 9l6 6 6-6"/>', 16, 2.6),
  plus: sv(P_PLUS, 18, 2.8), plusS: sv(P_PLUS, 14, 3), plusL: sv(P_PLUS, 24, 2.6), check: sv('<path d="M5 12l5 5 9-10"/>', 14, 3.2),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 18, 2.2),
  home: sv('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>', 22, 2),
  cal: sv('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 22, 2),
  target: sv('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', 22, 2),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>', 22, 2),
};
function ring(size, r, sw, pct, track, color) {
  const c = size / 2, p = Math.max(0, Math.min(1, pct || 0)) * 100;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>${p > 0.5 ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" pathLength="100" stroke-dasharray="${p.toFixed(1)} 100" transform="rotate(-90 ${c} ${c})"/>` : ''}</svg>`;
}
const macro = (label, v, g, color) => `<div class="macro">${ring(36, 14, 5, g ? v / g : 0, '#2a5145', color)}<div><div class="s12 mint">${label}</div><div class="b">${n1(v)} <span class="mint" style="font-weight:500">/ ${n1(g)} g</span></div></div></div>`;
const sheetTop = (title, sub) => `<header class="top"><div class="grow"><h1 class="h1">${title}</h1>${sub ? `<div class="sub" style="margin-top:2px">${sub}</div>` : ''}</div><button class="ib" data-a="close" aria-label="Sulge">${I.x}</button></header>`;
const macroFields = (v = {}) => `<div class="four">${[['kcal', 'Kcal'], ['p', 'Valk g'], ['f', 'Rasv g'], ['c', 'Süsiv. g']].map(([k, l]) => `<div class="field"><label for="m-${k}">${l}</label><input class="in" id="m-${k}" name="${k}" inputmode="decimal" autocomplete="off" value="${v[k] ?? ''}"></div>`).join('')}</div>`;
const field = (id, label, attrs = '') => `<div class="field"><label for="${id}">${label}</label><input class="in" id="${id}" name="${id.replace(/^f-/, '')}" autocomplete="off" ${attrs}></div>`;
const dayNav = () => `<div class="row8"><button class="ib" data-a="day" data-n="-1" aria-label="Eelmine päev">${I.left}</button><button class="ib" data-a="day" data-n="1" aria-label="Järgmine päev">${I.right}</button></div>`;

// ---------- olek ----------
const TABS = ['kodu', 'kalender', 'eesmargid', 'visioon', 'rohkem'];
const route = () => { const h = location.hash.slice(1); return TABS.includes(h) ? h : 'kodu'; };
const ym = s => { const d = pd(s); return { y: d.getFullYear(), m: d.getMonth() }; };
const ui = { date: today(), sheet: null, calM: ym(today()), histM: null, histSel: null, gKind: 'month', gOff: 0, avg: 'month', q: '', pending: null };
let lastToday = today();

// ---------- vaated ----------
function vHome() {
  const d = ui.date, t = dayTotals(d), g = S.goals, left = g.kcal - t.kcal, entries = S.log[d] || [];
  const w = weightAt(d), plan = planOf(d), done = plan.filter(p => p.done).length, next = plan.find(p => !p.done);
  let wSub = 'Lisa kaal';
  if (w) {
    const prev = weightAt(addDays(w.date, -7));
    if (w.date !== d) wSub = `Viimati ${shortDate(w.date)}`;
    else if (prev) { const df = w.kg - prev.kg; wSub = `${df > 0 ? '+' : ''}${fmt(df, 1)} kg nädalaga`; }
    else wSub = 'Kirjas';
  }
  return `
  <header class="top">
    <button class="daybtn" data-a="hist" aria-label="Ava ajaloo kalender"><span class="h1">${dayLabel(d)} ${I.down}</span><span class="sub">${longDate(d)}</span></button>
    ${dayNav()}
  </header>
  <section class="card dark hero" aria-label="Päeva makrod">
    <div class="bigring">${ring(148, 64, 14, g.kcal ? t.kcal / g.kcal : 0, '#2a5145', '#f4f0e8')}
      <div class="bigring-t"><div class="num xl">${r0(Math.abs(left))}</div><div class="s12 mint">${left >= 0 ? 'kcal jäänud' : 'kcal üle'}</div><div class="s11 mint">${r0(t.kcal)} / ${r0(g.kcal)}</div></div>
    </div>
    <div class="macros">${macro('Valk', t.p, g.p, '#d9a066')}${macro('Rasv', t.f, g.f, '#f0d9a8')}${macro('Süsivesikud', t.c, g.c, '#8fc7a8')}<button class="link" data-a="goals" style="min-height:44px;margin:-8px 0 -12px;text-decoration:underline;font-weight:600">Muuda sihte</button></div>
  </section>
  <section class="col g8">
    <div class="between"><h2 class="h2">Söödud</h2><button class="link" data-a="food">${I.plusS}Lisa toit</button></div>
    ${entries.length ? `<div class="list">${entries.map(e => { const q = e.qty || 1; return `<button class="rowbtn" data-a="entry" data-id="${e.id}"><span class="grow"><span class="sb" style="display:block">${esc(e.name)}${q !== 1 ? ` <span class="mute" style="font-weight:500">× ${n1(q)}</span>` : ''}</span><span class="s12 mute">Valk ${n1(e.p * q)} g · Rasv ${n1(e.f * q)} g · Süsiv. ${n1(e.c * q)} g</span></span><span class="num m brown">${r0(e.kcal * q)}</span></button>`; }).join('')}</div>`
      : `<div class="empty">Sel päeval pole veel midagi kirjas. Lisa esimene toit nupust „Lisa toit“.</div>`}
  </section>
  <section class="grid2">
    <button class="card" data-a="weight"><span class="s12 mute">Kaal</span><span class="num l green">${w ? `${fmt(w.kg, 1)} kg` : '–'}</span><span class="s12 mute">${wSub}</span></button>
    <button class="card" data-a="plan"><span class="s12 mute">Päevaplaan</span><span class="num l green">${plan.length ? `${done} / ${plan.length}` : '–'}</span><span class="s12 mute cut" style="max-width:100%">${!plan.length ? 'Lisa plaan' : next ? `Järgmine: ${next.time ? next.time + ' ' : ''}${esc(next.text)}` : 'Kõik tehtud'}</span></button>
  </section>`;
}

function vCal() {
  const { y, m } = ui.calM, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), t = today();
  let cells = '<span></span>'.repeat(lead);
  for (let i = 1; i <= days; i++) {
    const d = `${y}-${pad(m + 1)}-${pad(i)}`, n = eventsOn(d).length;
    cells += `<button class="day${n ? ' has' : ''}${d === t ? ' today' : ''}" data-a="calDay" data-d="${d}" aria-label="${i}. ${MON[m]}${n ? `, ${n} sündmust` : ''}">${i}${n ? '<i></i>' : ''}</button>`;
  }
  const up = upcoming(8);
  return `
  <header class="top">
    <div><h1 class="h1">${MON[m]}</h1><div class="sub" style="margin-top:2px">${y}</div></div>
    <div class="row8"><button class="ib" data-a="calM" data-n="-1" aria-label="Eelmine kuu">${I.left}</button><button class="ib" data-a="calM" data-n="1" aria-label="Järgmine kuu">${I.right}</button></div>
  </header>
  <div class="wd"><span>E</span><span>T</span><span>K</span><span>N</span><span>R</span><span>L</span><span>P</span></div>
  <div class="month">${cells}</div>
  <section class="col g8">
    <div class="between"><h2 class="h2">Tulemas</h2><button class="link" data-a="eventNew">${I.plusS}Lisa sündmus</button></div>
    ${up.length ? `<div class="list">${up.map(({ e, date }) => { const d = pd(date); return `<button class="rowbtn" data-a="eventEdit" data-id="${e.id}" style="justify-content:flex-start;gap:14px"><span class="evdate"><span class="num l brown" style="display:block">${d.getDate()}</span><span class="s11 mute">${MON3[d.getMonth()]}</span></span><span class="grow"><span class="sb" style="display:block">${esc(e.title)}</span><span class="s12 mute">${e.time || 'Terve päev'}${e.repeat && e.repeat !== 'none' ? ` · ${REPEAT[e.repeat].toLowerCase()}` : ''}</span></span></button>`; }).join('')}</div>`
      : `<div class="empty">Ühtegi sündmust pole kirjas. Vajuta päevale või nupule „Lisa sündmus“.</div>`}
  </section>`;
}

const goalSwitch = on => `<div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))"><a href="#eesmargid" class="${on === 'e' ? 'on' : ''}" ${on === 'e' ? 'aria-current="page"' : ''} style="font-size:14px">Eesmärgid</a><a href="#visioon" class="${on === 'v' ? 'on' : ''}" ${on === 'v' ? 'aria-current="page"' : ''} style="font-size:14px">Visioon</a></div>`;
function goalCard(t, dark) {
  const n = t.steps.length, dn = t.steps.filter(s => s.done).length, pct = n ? dn / n : (t.done ? 1 : 0), P = Math.round(pct * 100);
  return `<section class="card${dark ? ' dark' : ''} col g12" style="padding:16px">
    <div class="between base"><button class="tickrow b" style="font-size:17px" data-a="targetEdit" data-id="${t.id}" aria-label="Muuda eesmärki ${esc(t.title)}"><span class="${pct === 1 ? 'strike' : ''}">${esc(t.title)}</span></button><span class="num${dark ? '' : ' brown'}" style="font-size:26px">${P}%</span></div>
    <div class="bar" role="img" aria-label="Edenemine ${P} protsenti"><i style="width:${P}%"></i></div>
    <div class="col">
      ${t.steps.map(s => `<div class="between"><button class="tickrow" data-a="stepTick" data-t="${t.id}" data-id="${s.id}" role="checkbox" aria-checked="${!!s.done}"><span class="tick${s.done ? ' on' : ''}">${I.check}</span><span class="${s.done ? 'strike' : ''}">${esc(s.text)}</span></button><button class="link" data-a="stepDel" data-t="${t.id}" data-id="${s.id}" aria-label="Kustuta samm">${I.xs}</button></div>`).join('')}
      ${!n ? `<button class="tickrow" data-a="targetTick" data-id="${t.id}" role="checkbox" aria-checked="${!!t.done}"><span class="tick${t.done ? ' on' : ''}">${I.check}</span><span>Tehtud</span></button>` : ''}
    </div>
    <form data-form="step" data-t="${t.id}" class="row8"><label class="vh" for="st-${t.id}">Uus samm</label><input class="in grow" id="st-${t.id}" name="text" placeholder="Lisa samm" autocomplete="off"><button class="ib ${dark ? 'cream' : 'brown'}" aria-label="Lisa samm">${I.plus}</button></form>
  </section>`;
}
function vGoals() {
  const p = periodInfo(ui.gKind, ui.gOff), list = S.targets.filter(t => t.kind === ui.gKind && t.key === p.key);
  const isDone = t => t.steps.length ? t.steps.every(s => s.done) : !!t.done;
  const dn = list.filter(isDone).length, focus = list.find(t => !isDone(t));
  return `
  <header class="top"><h1 class="h1">Eesmärgid</h1><button class="ib brown" data-a="targetNew" aria-label="Lisa eesmärk">${I.plus}</button></header>
  ${goalSwitch('e')}
  <div class="seg out" style="grid-template-columns:repeat(4,minmax(0,1fr))">${Object.entries(KINDS).map(([k, l]) => `<button class="${k === ui.gKind ? 'on' : ''}" data-a="gKind" data-k="${k}" aria-pressed="${k === ui.gKind}">${l}</button>`).join('')}</div>
  <div class="between">
    <div class="grow"><h2 class="h2">${p.label}</h2><div class="sub">${p.when}${list.length ? ` · ${dn} / ${list.length} tehtud` : ''}</div></div>
    <div class="row8"><button class="ib" data-a="gOff" data-n="-1" aria-label="Eelmine periood">${I.left}</button><button class="ib" data-a="gOff" data-n="1" aria-label="Järgmine periood">${I.right}</button></div>
  </div>
  ${list.length ? list.map(t => goalCard(t, t === focus)).join('') : `<div class="empty">Selle perioodi jaoks pole veel eesmärke. Lisa esimene ülevalt plussist.</div>`}`;
}
function vVision() {
  return `
  <header class="top"><h1 class="h1">Visioon</h1><button class="ib brown" data-a="visNew" aria-label="Lisa pilt">${I.plus}</button></header>
  ${goalSwitch('v')}
  ${S.vision.length ? '' : `<div class="empty">Siia saad koguda pilte asjadest, mille poole liigud. Iga pildi juurde saad kirjutada kommentaari.</div>`}
  <div class="vgrid">
    ${S.vision.map(v => `<button class="vitem" data-a="visView" data-id="${v.id}"><img data-img="${v.id}" alt=""><span class="cut" style="max-width:100%">${esc(v.title) || 'Pealkirjata'}</span></button>`).join('')}
    <button class="vadd" data-a="visNew">${sv(P_PLUS, 22, 2.6)}Lisa pilt</button>
  </div>`;
}

function weightChart(days) {
  const end = today(), start = addDays(end, -(days - 1));
  const pts = Object.keys(S.weight).filter(k => k >= start && k <= end).sort().map(k => ({ d: k, kg: S.weight[k] }));
  if (pts.length < 2) return { pts, html: `<div class="empty" style="background:#fff">Graafiku jaoks on vaja vähemalt kahte kaalumist selles vahemikus.${pts.length ? ` Praegu on kirjas ${fmt(pts[0].kg, 1)} kg (${shortDate(pts[0].d)}).` : ''}</div>` };
  const t0 = pd(pts[0].d).getTime(), t1 = pd(pts[pts.length - 1].d).getTime();
  let lo = Math.min(...pts.map(p => p.kg)), hi = Math.max(...pts.map(p => p.kg));
  if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
  const X = p => 38 + (pd(p.d).getTime() - t0) / (t1 - t0) * 272, Y = p => 12 + (hi - p.kg) / (hi - lo) * 98;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p).toFixed(1)} ${Y(p).toFixed(1)}`).join('');
  const a = pts[0], b = pts[pts.length - 1];
  const lab = (v, y) => `<text x="0" y="${y + 4}" font-size="11" fill="#5f6a63" font-family="Barlow, sans-serif">${fmt(v, 1)}</text>`;
  return { pts, html: `<svg class="chart" viewBox="0 0 320 124" role="img" aria-label="Kaalu graafik: ${fmt(a.kg, 1)} kg ${shortDate(a.d)}, ${fmt(b.kg, 1)} kg ${shortDate(b.d)}">
    <path d="M34 12H320M34 61H320M34 110H320" fill="none" stroke="#e2dbcd" stroke-width="1"/>${lab(hi, 12)}${lab((hi + lo) / 2, 61)}${lab(lo, 110)}
    <path d="${path}" fill="none" stroke="#17382e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${X(a).toFixed(1)}" cy="${Y(a).toFixed(1)}" r="4" fill="#f4f0e8" stroke="#17382e" stroke-width="2.5"/>
    <circle cx="${X(b).toFixed(1)}" cy="${Y(b).toFixed(1)}" r="6" fill="#7a4a2b" stroke="#f4f0e8" stroke-width="2.5"/>
  </svg><div class="between s11 mute" style="padding-left:34px"><span>${shortDate(a.d)}</span><span>${shortDate(b.d)}</span></div>` };
}
function vMore() {
  const days = AVG[ui.avg][1], { n, t } = averages(days), g = S.goals, ch = weightChart(days), pts = ch.pts;
  const bar = (label, v, goal, unit, color) => { const P = goal ? Math.min(100, Math.round(v / goal * 100)) : 0; return `<div class="col g4"><div class="between base" style="font-size:14px"><span>${label}</span><span><span class="b">${r0(v)}</span> <span class="mint">/ ${r0(goal)} ${unit}</span></span></div><div class="bar thin" role="img" aria-label="${goal ? Math.round(v / goal * 100) : 0} protsenti sihist"><i style="width:${P}%;background:${color}"></i></div></div>`; };
  let wHead = '';
  if (pts.length >= 2) { const df = pts[pts.length - 1].kg - pts[0].kg; wHead = `<span class="mute" style="font-size:14px">${fmt(pts[0].kg, 1)} → ${fmt(pts[pts.length - 1].kg, 1)} kg</span> <span class="num m brown">${df > 0 ? '+' : ''}${fmt(df, 1)} kg</span>`; }
  return `
  <header class="top"><h1 class="h1">Rohkem</h1></header>
  <section class="grid2" style="gap:10px"><button class="btn line" data-a="goals">Makrosihid</button><button class="btn line" data-a="foods">Minu toidud</button></section>
  <h2 class="h2">Keskmised</h2>
  <div class="seg" style="grid-template-columns:repeat(5,minmax(0,1fr))">${Object.entries(AVG).map(([k, [l]]) => `<button class="${k === ui.avg ? 'on' : ''}" data-a="avg" data-k="${k}" aria-pressed="${k === ui.avg}">${l}</button>`).join('')}</div>
  <section class="card dark col g12">
    <div class="between base"><h2 class="h2">Keskmiselt päevas</h2><span class="s12 mint">${n} / ${days} päeva sisestatud</span></div>
    ${n ? bar('Kalorid', t.kcal, g.kcal, 'kcal', '#f4f0e8') + bar('Valk', t.p, g.p, 'g', '#d9a066') + bar('Rasv', t.f, g.f, 'g', '#f0d9a8') + bar('Süsivesikud', t.c, g.c, 'g', '#8fc7a8')
      : `<div class="s12 mint" style="font-size:14px">Selles vahemikus pole ühtegi päeva sisestatud. Keskmine arvutatakse ainult nende päevade pealt, kuhu oled toitu lisanud.</div>`}
  </section>
  <section class="card col g8" style="padding:16px">
    <div class="between base"><h2 class="h2">Kaal</h2><span>${wHead}</span></div>
    ${ch.html}
  </section>
  <section class="col g8">
    <h2 class="h2">Andmed</h2>
    <div class="sub">Kõik on salvestatud ainult sellesse seadmesse. Varukoopia sisaldab kõike peale visioonitahvli piltide.</div>
    <div class="grid2" style="gap:10px"><button class="btn line" data-a="export">Lae varukoopia alla</button><label class="btn line" style="display:grid;place-items:center;cursor:pointer"><input type="file" accept="application/json,.json" class="vh" data-in="import">Taasta varukoopiast</label></div>
  </section>`;
}

// ---------- lehed menüü peal ----------
function foodRows(manage) {
  const q = ui.q.trim().toLowerCase();
  if (!S.foods.length) return `<div class="empty">Sul pole veel salvestatud toite. Lisa siia asjad, mida sööd tihti, nt kohupiim.</div>`;
  const fs = S.foods.filter(f => !q || f.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'et'));
  if (!fs.length) return `<div class="empty">Otsingule „${esc(ui.q)}“ ei vasta ükski toit.</div>`;
  return `<div class="list" style="padding-right:8px">${fs.map(f => `<div class="between" style="padding:6px 0"><button class="tickrow" style="display:block" data-a="foodEdit" data-id="${f.id}" aria-label="Muuda toitu ${esc(f.name)}"><span class="sb">${esc(f.name)}</span>${f.unit ? ` <span class="mute">${esc(f.unit)}</span>` : ''}<span class="s12 mute" style="display:block">${r0(f.kcal)} kcal · V ${n1(f.p)} · R ${n1(f.f)} · S ${n1(f.c)}</span></button>${manage ? `<button class="link" data-a="foodEdit" data-id="${f.id}">Muuda</button>` : `<button class="ib brown" data-a="foodAdd" data-id="${f.id}" aria-label="Lisa ${esc(f.name)} päeva">${I.plus}</button>`}</div>`).join('')}</div>`;
}
const foodSearch = () => `<div class="search">${I.search}<label class="vh" for="q">Otsi toitu</label><input id="q" type="search" placeholder="Otsi toitu" autocomplete="off" value="${esc(ui.q)}"></div>`;
const SHEETS = {
  food: () => `${sheetTop('Lisa toit', longDate(ui.date))}
    <form class="card dark col g12" data-form="quick">
      <div class="between base"><h2 class="h2">Kiirlisamine</h2><span class="s12 mint">ainult selle päeva alla</span></div>
      ${field('f-name', 'Nimi', 'placeholder="nt kana pasta"')}
      ${macroFields()}
      <label class="check"><input type="checkbox" name="save">Salvesta ka minu toitudesse</label>
      <button class="btn cream">Lisa päeva</button>
    </form>
    <section class="col g8">
      <div class="between"><h2 class="h2">Minu toidud</h2><button class="link" data-a="foodNew">Uus toit</button></div>
      ${S.foods.length > 5 ? foodSearch() : ''}
      <div id="foodlist">${foodRows(false)}</div>
    </section>`,
  foods: () => `${sheetTop('Minu toidud', 'Toidud, mida saad ühe vajutusega päeva lisada')}
    ${S.foods.length > 5 ? foodSearch() : ''}
    <div id="foodlist">${foodRows(true)}</div>
    <button class="btn" data-a="foodNew">Uus toit</button>`,
  foodForm: ({ id }) => {
    const f = S.foods.find(x => x.id === id) || {};
    return `${sheetTop(id ? 'Muuda toitu' : 'Uus toit', 'Makrod ühe portsjoni kohta')}
    <form class="col g12" data-form="food" data-id="${id || ''}">
      ${field('f-name', 'Nimi', `value="${esc(f.name || '')}" placeholder="nt kohupiim"`)}
      ${field('f-unit', 'Portsjon (valikuline)', `value="${esc(f.unit || '')}" placeholder="nt 1 tk või 150 g"`)}
      ${macroFields(f)}
      <button class="btn">Salvesta</button>
    </form>
    ${id ? `<button class="btn danger" data-a="foodDel" data-id="${id}" data-confirm>Kustuta toit</button>` : ''}`;
  },
  entry: ({ id }) => {
    const e = (S.log[ui.date] || []).find(x => x.id === id);
    if (!e) return sheetTop('Toit', '');
    return `${sheetTop('Muuda', longDate(ui.date))}
    <form class="col g12" data-form="entry" data-id="${id}">
      ${field('f-name', 'Nimi', `value="${esc(e.name)}"`)}
      ${macroFields(e)}
      <div class="sub">Makrod on ühe portsjoni kohta${e.unit ? ` (${esc(e.unit)})` : ''}.</div>
      ${field('f-qty', 'Kogus (mitu portsjonit)', `value="${n1(e.qty || 1)}" inputmode="decimal"`)}
      <button class="btn">Salvesta</button>
    </form>
    <button class="btn danger" data-a="entryDel" data-id="${id}" data-confirm>Kustuta päevast</button>`;
  },
  goals: () => `${sheetTop('Makrosihid', 'Päevane siht, mille vastu ringid täituvad')}
    <form class="col g12" data-form="goals">${macroFields(S.goals)}<button class="btn">Salvesta</button></form>`,
  weight: () => {
    const w = S.weight[ui.date];
    return `${sheetTop('Kaal', longDate(ui.date))}
    <form class="col g12" data-form="weight">${field('f-kg', 'Kaal (kg)', `value="${w ? fmt(w, 1) : ''}" inputmode="decimal" placeholder="nt 78,4"`)}<button class="btn">Salvesta</button></form>
    ${w ? `<button class="btn danger" data-a="weightDel" data-confirm>Kustuta selle päeva kaal</button>` : ''}`;
  },
  plan: () => {
    const d = ui.date, plan = planOf(d), done = plan.filter(p => p.done).length, evs = eventsOn(d);
    return `<header class="top"><div class="grow"><h1 class="h1">Päevaplaan</h1><div class="sub" style="margin-top:2px">${longDate(d)}${plan.length ? ` · ${done} / ${plan.length} tehtud` : ''}</div></div><button class="ib" data-a="close" aria-label="Sulge">${I.x}</button></header>
    <div class="between"><span class="h2">${dayLabel(d)}</span>${dayNav()}</div>
    <form class="card dark" data-form="plan" style="display:flex;gap:8px;align-items:flex-end;padding:12px;border-radius:20px">
      <div class="field grow"><label for="p-text">Mida teed?</label><input class="in" id="p-text" name="text" placeholder="nt jõusaal" autocomplete="off"></div>
      <div class="field" style="width:104px;flex:none"><label for="p-time">Kell</label><input class="in" id="p-time" name="time" type="time" style="padding:0 8px"></div>
      <button class="ib cream" style="width:46px;height:46px;border-radius:12px" aria-label="Lisa plaani">${I.plus}</button>
    </form>
    ${plan.length ? `<div class="list" style="padding-right:4px">${plan.map(p => `<div class="between" style="min-height:56px;gap:4px"><button class="tickrow" data-a="planTick" data-id="${p.id}" role="checkbox" aria-checked="${!!p.done}"><span class="tick${p.done ? ' on' : ''}">${I.check}</span><span class="${p.time ? 'num' : 's12 mute'}" style="width:46px;flex:none;${p.time ? `font-size:20px;color:${p.done ? 'var(--mute)' : 'var(--brown)'}` : ''}">${p.time || 'millalgi'}</span><span class="${p.done ? 'strike' : 'sb'}">${esc(p.text)}</span></button><button class="link" data-a="planDel" data-id="${p.id}" aria-label="Kustuta ${esc(p.text)}">${I.xs}</button></div>`).join('')}</div>`
      : `<div class="empty">Selle päeva plaan on tühi. Kirjuta üleval, mida teed. Kellaaeg on valikuline.</div>`}
    <section class="col g8"><h2 class="h2">Kalendrist</h2>
      ${evs.length ? `<div class="list">${evs.map(e => `<div style="padding:11px 0"><span class="sb" style="display:block">${esc(e.title)}</span><span class="s12 mute">${e.time || 'Terve päev'}</span></div>`).join('')}</div>` : `<div class="empty">Sel päeval pole kalendris midagi.</div>`}
    </section>`;
  },
  hist: () => {
    const { y, m } = ui.histM, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), t = today(), sel = ui.histSel;
    let cells = '<span></span>'.repeat(lead);
    for (let i = 1; i <= days; i++) {
      const d = `${y}-${pad(m + 1)}-${pad(i)}`, st = dayStatus(d);
      cells += `<button class="hd ${st}${d === t ? ' today' : ''}${d === sel ? ' sel' : ''}" data-a="histSel" data-d="${d}" aria-pressed="${d === sel}" aria-label="${i}. ${MON[m]}, ${STATUS[st]}">${i}</button>`;
    }
    const tt = dayTotals(sel), w = S.weight[sel], st = dayStatus(sel);
    return `<header class="top"><button class="ib" data-a="histM" data-n="-1" aria-label="Eelmine kuu">${I.left}</button><h1 class="h1" style="font-size:28px;letter-spacing:.04em">${MON[m]} ${y}</h1><button class="ib" data-a="histM" data-n="1" aria-label="Järgmine kuu">${I.right}</button></header>
    <div class="hwd"><span>E</span><span>T</span><span>K</span><span>N</span><span>R</span><span>L</span><span>P</span></div>
    <div class="hmonth">${cells}</div>
    <div class="legend"><span><i style="background:var(--green)"></i>Sihid täis</span><span><i style="background:var(--half)"></i>Pooleldi</span><span><i style="border:2px solid var(--brown)"></i>Mööda</span><span><i style="border:2px dashed var(--green)"></i>Täna</span></div>
    <section class="card dark col g12">
      <div class="between base"><h2 class="h2">${longDate(sel)}</h2><span class="s12 mint">${STATUS[st]}</span></div>
      ${tt.n ? `<div class="four"><div><div class="num l">${r0(tt.kcal)}</div><div class="s12 mint">kcal</div></div><div><div class="num l">${r0(tt.p)} g</div><div class="s12 mint">valk</div></div><div><div class="num l">${r0(tt.f)} g</div><div class="s12 mint">rasv</div></div><div><div class="num l">${r0(tt.c)} g</div><div class="s12 mint">süsiv.</div></div></div>` : `<div class="mint" style="font-size:14px">Sel päeval pole toitu sisestatud.</div>`}
      <div class="between" style="border-top:1px solid var(--green2);padding-top:12px"><span style="font-size:14px">Kaal <span class="b">${w ? fmt(w, 1) + ' kg' : '–'}</span></span><button class="link" style="color:var(--sand);text-decoration:underline" data-a="histOpen">Ava see päev</button></div>
    </section>
    <button class="btn line" data-a="close">Sulge</button>`;
  },
  event: ({ id, date }) => {
    const e = S.events.find(x => x.id === id) || { date: date || today(), repeat: 'none' };
    const same = !id && date ? eventsOn(date) : [];
    return `${sheetTop(id ? 'Muuda sündmust' : 'Uus sündmus', longDate(e.date))}
    ${same.length ? `<section class="col g8"><h2 class="h2">Sel päeval juba kirjas</h2><div class="list">${same.map(x => `<button class="rowbtn" data-a="eventEdit" data-id="${x.id}"><span class="grow"><span class="sb" style="display:block">${esc(x.title)}</span><span class="s12 mute">${x.time || 'Terve päev'}</span></span><span class="s12 brown b">Muuda</span></button>`).join('')}</div></section>` : ''}
    <form class="col g12" data-form="event" data-id="${id || ''}">
      ${field('f-title', 'Mis toimub?', `value="${esc(e.title || '')}" placeholder="nt ema sünnipäev"`)}
      <div class="grid2">${field('f-date', 'Kuupäev', `type="date" value="${e.date}" required`)}${field('f-time', 'Kell (valikuline)', `type="time" value="${e.time || ''}"`)}</div>
      <div class="field"><label for="f-repeat">Kordumine</label><select class="in" id="f-repeat" name="repeat">${Object.entries(REPEAT).map(([k, l]) => `<option value="${k}"${k === (e.repeat || 'none') ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <button class="btn">Salvesta</button>
    </form>
    ${id ? `<button class="btn danger" data-a="eventDel" data-id="${id}" data-confirm>Kustuta sündmus</button>` : ''}`;
  },
  target: ({ id }) => {
    const t = S.targets.find(x => x.id === id) || { kind: ui.gKind };
    return `${sheetTop(id ? 'Muuda eesmärki' : 'Uus eesmärk', id ? '' : periodInfo(ui.gKind, ui.gOff).label)}
    <form class="col g12" data-form="target" data-id="${id || ''}">
      ${field('f-title', 'Eesmärk', `value="${esc(t.title || '')}" placeholder="nt kaal alla 78 kg"`)}
      ${id ? '' : `<div class="field"><label for="f-kind">Periood</label><select class="in" id="f-kind" name="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}"${k === t.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></div><div class="sub">Samme saad lisada pärast salvestamist eesmärgi kaardil.</div>`}
      <button class="btn">Salvesta</button>
    </form>
    ${id ? `<button class="btn danger" data-a="targetDel" data-id="${id}" data-confirm>Kustuta eesmärk</button>` : ''}`;
  },
  visForm: ({ id }) => {
    const v = S.vision.find(x => x.id === id) || {};
    return `${sheetTop(id ? 'Muuda pilti' : 'Uus pilt', '')}
    <form class="col g12" data-form="vision" data-id="${id || ''}">
      <div class="field"><label for="f-file">${id ? 'Vaheta pilt (valikuline)' : 'Pilt'}</label><input class="in" id="f-file" name="file" type="file" accept="image/*" style="padding:9px 12px;height:auto"></div>
      ${field('f-title', 'Pealkiri', `value="${esc(v.title || '')}" placeholder="nt maja mere ääres"`)}
      <div class="field"><label for="f-comment">Kommentaar</label><textarea class="in" id="f-comment" name="comment" placeholder="Miks see sulle oluline on?">${esc(v.comment || '')}</textarea></div>
      <button class="btn">Salvesta</button>
    </form>`;
  },
  visView: ({ id }) => {
    const v = S.vision.find(x => x.id === id);
    if (!v) return sheetTop('Visioon', '');
    return `<header class="top"><button class="ib" data-a="close" aria-label="Tagasi">${I.left}</button><div class="row8"><button class="chip" data-a="visEdit" data-id="${id}">Muuda</button><button class="chip danger" data-a="visDel" data-id="${id}" data-confirm>Kustuta</button></div></header>
    <img class="vbig" data-img="${id}" alt="${esc(v.title)}">
    <div class="col g4"><h1 class="h1" style="font-size:30px;line-height:1.1">${esc(v.title) || 'Pealkirjata'}</h1><div class="s12 mute">Lisatud ${shortDate(v.added)}</div></div>
    ${v.comment ? `<section class="card col g4" style="padding:16px"><div class="s12 brown sb" style="letter-spacing:.1em">KOMMENTAAR</div><div style="font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(v.comment)}</div></section>` : `<div class="empty">Kommentaari pole. Lisa see nupust „Muuda“.</div>`}`;
  },
  importConfirm: () => {
    const p = ui.pending || {};
    return `${sheetTop('Taasta varukoopiast', '')}
    <div class="card col g4" style="padding:16px"><div class="b">See asendab kõik praegused andmed selles seadmes.</div><div class="sub">Failis on ${Object.keys(p.log || {}).length} päeva toitu, ${Object.keys(p.weight || {}).length} kaalumist, ${(p.events || []).length} sündmust ja ${(p.targets || []).length} eesmärki.</div></div>
    <button class="btn" data-a="importDo">Asenda andmed</button><button class="btn line" data-a="close">Loobu</button>`;
  },
};

// ---------- joonistamine ----------
function nav(r) {
  const it = (h, label, icon, on) => `<a href="#${h}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${icon}${label}</a>`;
  return it('kodu', 'Kodu', I.home, r === 'kodu') + it('kalender', 'Kalender', I.cal, r === 'kalender')
    + `<div class="fabw"><button class="fab" data-a="food" aria-label="Lisa toit">${I.plusL}</button></div>`
    + it('eesmargid', 'Eesmärgid', I.target, r === 'eesmargid' || r === 'visioon') + it('rohkem', 'Rohkem', I.menu, r === 'rohkem');
}
function renderSheet() {
  const el = $('#sheet');
  if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; document.body.classList.remove('lock'); return; }
  el.hidden = false; document.body.classList.add('lock');
  el.innerHTML = SHEETS[ui.sheet.name](ui.sheet);
}
function render() {
  const r = route();
  $('#view').innerHTML = ({ kodu: vHome, kalender: vCal, eesmargid: vGoals, visioon: vVision, rohkem: vMore })[r]();
  $('#nav').innerHTML = nav(r);
  renderSheet();
  loadImgs();
}
function open(name, p = {}) { ui.sheet = Object.assign({ name }, p); render(); $('#sheet').scrollTop = 0; }
function close() { ui.sheet = (ui.sheet && ui.sheet.back) || null; ui.q = ''; render(); }
let tt;
function toast(m) { const el = $('#toast'); el.textContent = m; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2200); }
const shiftM = (o, n) => { const d = new Date(o.y, o.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
const findTarget = id => S.targets.find(t => t.id === id);

// ---------- tegevused ----------
const A = {
  close,
  day: ({ n }) => { ui.date = addDays(ui.date, +n); render(); },
  food: () => open('food'),
  foods: () => open('foods'),
  goals: () => open('goals'),
  weight: () => open('weight'),
  plan: () => open('plan'),
  hist: () => { ui.histM = ym(ui.date); ui.histSel = ui.date; open('hist'); },
  histM: ({ n }) => { ui.histM = shiftM(ui.histM, +n); render(); },
  histSel: ({ d }) => { ui.histSel = d; render(); },
  histOpen: () => { ui.date = ui.histSel; ui.sheet = null; render(); },
  entry: ({ id }) => open('entry', { id }),
  entryDel: ({ id }) => { S.log[ui.date] = (S.log[ui.date] || []).filter(e => e.id !== id); if (!S.log[ui.date].length) delete S.log[ui.date]; save(); close(); toast('Kustutatud'); },
  foodNew: () => open('foodForm', { back: ui.sheet }),
  foodEdit: ({ id }) => open('foodForm', { id, back: ui.sheet }),
  foodDel: ({ id }) => { S.foods = S.foods.filter(f => f.id !== id); save(); close(); toast('Toit kustutatud'); },
  foodAdd: ({ id }) => {
    const f = S.foods.find(x => x.id === id); if (!f) return;
    (S.log[ui.date] = S.log[ui.date] || []).push({ id: uid(), name: f.name, unit: f.unit || '', qty: 1, kcal: f.kcal, p: f.p, f: f.f, c: f.c });
    save(); toast(`Lisatud: ${f.name}`);
  },
  weightDel: () => { delete S.weight[ui.date]; save(); close(); },
  planTick: ({ id }) => { const p = (S.plan[ui.date] || []).find(x => x.id === id); if (p) { p.done = !p.done; save(); render(); } },
  planDel: ({ id }) => { S.plan[ui.date] = (S.plan[ui.date] || []).filter(p => p.id !== id); if (!S.plan[ui.date].length) delete S.plan[ui.date]; save(); render(); },
  calM: ({ n }) => { ui.calM = shiftM(ui.calM, +n); render(); },
  calDay: ({ d }) => open('event', { date: d }),
  eventNew: () => open('event', { date: today() }),
  eventEdit: ({ id }) => open('event', { id }),
  eventDel: ({ id }) => { S.events = S.events.filter(e => e.id !== id); save(); ui.sheet = null; render(); toast('Sündmus kustutatud'); },
  gKind: ({ k }) => { ui.gKind = k; ui.gOff = 0; render(); },
  gOff: ({ n }) => { ui.gOff += +n; render(); },
  targetNew: () => open('target'),
  targetEdit: ({ id }) => open('target', { id }),
  targetDel: ({ id }) => { S.targets = S.targets.filter(t => t.id !== id); save(); close(); toast('Eesmärk kustutatud'); },
  targetTick: ({ id }) => { const t = findTarget(id); if (t) { t.done = !t.done; save(); render(); } },
  stepTick: ({ t, id }) => { const s = (findTarget(t) || { steps: [] }).steps.find(x => x.id === id); if (s) { s.done = !s.done; save(); render(); } },
  stepDel: ({ t, id }) => { const g = findTarget(t); if (g) { g.steps = g.steps.filter(s => s.id !== id); save(); render(); } },
  avg: ({ k }) => { ui.avg = k; render(); },
  visNew: () => open('visForm'),
  visView: ({ id }) => open('visView', { id }),
  visEdit: ({ id }) => open('visForm', { id, back: ui.sheet }),
  visDel: async ({ id }) => {
    S.vision = S.vision.filter(v => v.id !== id); save();
    await imgDel(id).catch(() => {});
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    ui.sheet = null; render(); toast('Pilt kustutatud');
  },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
    a.download = `abiline-${today()}.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Varukoopia alla laaditud');
  },
  importDo: () => { S = normalize(ui.pending); ui.pending = null; save(); ui.sheet = null; render(); toast('Andmed taastatud'); },
};

// ---------- vormid ----------
const macrosOf = fd => ({ kcal: num(fd.kcal), p: num(fd.p), f: num(fd.f), c: num(fd.c) });
const F = {
  quick: fd => {
    const name = fd.name.trim(); if (!name) return toast('Kirjuta toidu nimi');
    const m = macrosOf(fd);
    (S.log[ui.date] = S.log[ui.date] || []).push(Object.assign({ id: uid(), name, unit: '', qty: 1 }, m));
    if (fd.save) S.foods.push(Object.assign({ id: uid(), name, unit: '' }, m));
    save(); render(); toast(`Lisatud: ${name}`);
  },
  food: (fd, form) => {
    const name = fd.name.trim(); if (!name) return toast('Kirjuta toidu nimi');
    const data = Object.assign({ name, unit: fd.unit.trim() }, macrosOf(fd)), id = form.dataset.id;
    const f = S.foods.find(x => x.id === id);
    if (f) Object.assign(f, data); else S.foods.push(Object.assign({ id: uid() }, data));
    save(); close(); toast('Toit salvestatud');
  },
  entry: (fd, form) => {
    const e = (S.log[ui.date] || []).find(x => x.id === form.dataset.id); if (!e) return close();
    Object.assign(e, macrosOf(fd), { name: fd.name.trim() || e.name, qty: num(fd.qty) || 1 });
    save(); close();
  },
  goals: fd => { S.goals = macrosOf(fd); save(); close(); toast('Sihid salvestatud'); },
  weight: fd => { const kg = num(fd.kg); if (!kg) return toast('Kirjuta kaal kilodes'); S.weight[ui.date] = Math.round(kg * 10) / 10; save(); close(); },
  plan: fd => {
    const text = fd.text.trim(); if (!text) return toast('Kirjuta, mida teed');
    (S.plan[ui.date] = S.plan[ui.date] || []).push({ id: uid(), text, time: fd.time || '', done: false });
    save(); render(); const el = $('#p-text'); if (el) el.focus();
  },
  event: (fd, form) => {
    const title = fd.title.trim(); if (!title) return toast('Kirjuta, mis toimub');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fd.date)) return toast('Vali kuupäev');
    const data = { title, date: fd.date, time: fd.time || '', repeat: fd.repeat || 'none' };
    const e = S.events.find(x => x.id === form.dataset.id);
    if (e) Object.assign(e, data); else S.events.push(Object.assign({ id: uid() }, data));
    save(); ui.calM = ym(fd.date); ui.sheet = null; render(); toast('Sündmus salvestatud');
  },
  target: (fd, form) => {
    const title = fd.title.trim(); if (!title) return toast('Kirjuta eesmärk');
    const t = findTarget(form.dataset.id);
    if (t) t.title = title;
    else { const kind = KINDS[fd.kind] ? fd.kind : ui.gKind; if (kind !== ui.gKind) { ui.gKind = kind; ui.gOff = 0; } S.targets.push({ id: uid(), kind, key: periodInfo(kind, ui.gOff).key, title, steps: [], done: false }); }
    save(); close();
  },
  step: (fd, form) => {
    const text = fd.text.trim(), t = findTarget(form.dataset.t); if (!text || !t) return;
    t.steps.push({ id: uid(), text, done: false }); save(); render();
    const el = document.getElementById('st-' + t.id); if (el) el.focus();
  },
  vision: async (fd, form) => {
    const id = form.dataset.id, file = fd.file && fd.file.size ? fd.file : null;
    if (!id && !file) return toast('Vali pilt');
    const btn = form.querySelector('.btn'); btn.disabled = true; btn.textContent = 'Salvestan…';
    try {
      let v = S.vision.find(x => x.id === id);
      if (!v) { v = { id: uid(), added: today() }; }
      if (file) { await imgPut(v.id, await shrink(file)); if (urls[v.id]) { URL.revokeObjectURL(urls[v.id]); delete urls[v.id]; } }
      v.title = fd.title.trim(); v.comment = fd.comment.trim();
      if (!S.vision.includes(v)) S.vision.push(v);
      save(); close(); toast('Salvestatud');
    } catch (e) { btn.disabled = false; btn.textContent = 'Salvesta'; toast('Pildi salvestamine ei õnnestunud'); }
  },
};

// ---------- sündmused ----------
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
  if (a.dataset.confirm !== undefined && !a.classList.contains('armed')) {
    a.classList.add('armed'); a.dataset.t = a.textContent; a.textContent = 'Vajuta uuesti, et kustutada';
    setTimeout(() => { if (a.isConnected) { a.classList.remove('armed'); a.textContent = a.dataset.t; } }, 3500);
    return;
  }
  const fn = A[a.dataset.a]; if (fn) fn(a.dataset, a);
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const fd = {}; new FormData(f).forEach((v, k) => { fd[k] = v; });
  F[f.dataset.form](fd, f);
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; $('#foodlist').innerHTML = foodRows(ui.sheet && ui.sheet.name === 'foods'); }
});
document.addEventListener('change', async e => {
  if (e.target.dataset.in !== 'import') return;
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !data.goals || !data.log) throw new Error('vale fail');
    ui.pending = data; open('importConfirm');
  } catch (err) { e.target.value = ''; toast('See fail ei ole Abilise varukoopia'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) close(); });
window.addEventListener('hashchange', () => { ui.sheet = null; render(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const t = today();
  if (t !== lastToday) { if (ui.date === lastToday) ui.date = t; lastToday = t; if (!ui.sheet) render(); }
});

render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
