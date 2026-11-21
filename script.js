/**
 * script.js — the core app: settings, sign-in, team colours, home, scoreboard,
 * schedule, info pages and the winner reveal.
 *
 * Every value in DEFAULT_SETTINGS is only a starting point. Admins change them
 * in the dashboard (Admin → Appearance, Text, Settings…) and the saved values
 * replace these on every phone within a few seconds.
 */

// ════════════════════════════════════════════════════════════════════════════
// DEFAULT SETTINGS — admins can override every one of these
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  app: {
    name: 'Hue & Harmony',
    tagline: 'All shades of us',
    presenter: 'Valentis MBBS 2k28 × Altius BDS 2k28 present',
    venue: 'Botanical Garden, University of Ibadan',
    dateText: 'Date to be announced',
    footer: 'Hue & Harmony · All shades of us',
  },
  appearance: {
    wordTop: 'HUE &',
    wordBottom: 'HARMONY',
    sky: '#2D2BD8',
    skyDeep: '#16137A',
    gold: '#FFC414',
    outline: '#4A2511',
    coral: '#E8364F',
    displayFont: 'Lilita One',
    bodyFont: 'Fredoka',
    fontCssUrl: '',
    logos: [],
    customCss: '',
    confetti: true,
    teamTheme: true,
  },
  text: {
    joinTitle: 'Join the game night',
    nameLabel: 'Your name',
    nameHint: 'The name your class knows you by. Add your surname if it is a common name.',
    pinLabel: 'PIN',
    pinHint: 'Choose a {n}-digit PIN. You need it to sign in again on another phone.',
    teamLabel: 'Your team',
    teamHint: 'Pick the team you were assigned. You cannot change it later.',
    joinButton: "Let's go",
    returningNote: 'Joined before? Type the same name and PIN. Your team is remembered.',
    navHome: 'Home',
    navScores: 'Scores',
    navGames: 'Last Man',
    navHunt: 'Hunt',
    navSchedule: 'Schedule',
    homeGreeting: 'Hi {name}!',
    homeTeamLine: 'You are on Team {team}.',
    homeNow: 'Happening now',
    homeNothing: 'Nothing live right now. Check the schedule.',
    homeYourPoints: 'Your points',
    homeTeamPoints: 'Team points',
    homeRank: 'Rank',
    scoresTitle: 'Scoreboard',
    scoresFrozen: 'Scores are hidden until the big reveal.',
    scoresFrozenSnapshot: 'Scores are frozen. These are the totals from before the freeze.',
    feedTitle: 'Latest points',
    peopleTitle: 'Top players (MVP race)',
    pointsUnit: 'pts',
    scheduleTitle: 'Schedule',
    scheduleEmpty: 'The schedule will appear here.',
    announcementsTitle: 'Announcements',
    statusLive: 'Live now',
    statusUpcoming: 'Up next',
    statusDone: 'Done',
    revealTitle: 'And the winner is…',
    revealPlace: '{place} place',
    revealWinner: 'Team {team} wins!',
    revealMvp: 'MVP: {name}',
    revealClose: 'Close',
    signOut: 'Sign out',
    signOutConfirm: 'Sign out on this phone? You can sign back in with your name and PIN.',
    adminLink: 'Admin',
    offline: 'Connection lost. Retrying…',
    lmsTitle: 'Last Man Standing',
    lmsIntro: 'Everyone has hidden lives. Attack to knock players out, but attacking a bad egg backfires. The last regular player standing wins.',
    lmsCreate: 'Create a room',
    lmsJoinCode: 'Join with a code',
    lmsNoRooms: 'No open rooms yet. Create one!',
    lmsRolePlayer: 'You are a PLAYER',
    lmsRolePlayerNote: 'Survive to the end. Avoid attacking bad eggs: it costs you a life.',
    lmsRoleBad: 'You are a BAD EGG',
    lmsRoleBadNote: 'You cannot be knocked out and you cannot win. Blend in and get others to attack you.',
    lmsLives: 'Your lives',
    lmsOut: 'You are out of this round.',
    lmsWaiting: 'Waiting for the moderator to start…',
    lmsAttack: 'Attack',
    lmsChatPlaceholder: 'Message the room',
    huntTitle: 'Treasure Hunt',
    huntWaiting: 'The hunt has not started yet. Stay close to your team!',
    huntStartsIn: 'The hunt starts in',
    huntClue: 'Your clue',
    huntScan: 'Scan a code',
    huntTypeCode: 'Type the code under the QR',
    huntHint: 'Get a hint',
    huntHintConfirm: 'A hint costs your team {n} points. Use one?',
    huntAnswer: 'Your answer',
    huntWaitingAdmin: 'Do the task, then show an admin to unlock your next clue.',
    huntFinished: 'Your team finished in place {place}!',
    huntRace: 'The race',
    huntFrozen: 'Frozen! You can scan again in',
    huntOver: 'The treasure hunt is over.',
  },
  // Home screen tiles. Order here = order on screen.
  tiles: [
    { id: 'lms', show: true, label: 'Last Man Standing', blurb: 'Join a room and survive' },
    { id: 'hunt', show: true, label: 'Treasure Hunt', blurb: 'Clues, codes and a race' },
    { id: 'scores', show: true, label: 'Scoreboard', blurb: 'Who is winning?' },
    { id: 'schedule', show: true, label: 'Schedule', blurb: 'What happens when' },
  ],
  // Info pages in the menu. Admins can add as many as they like.
  pages: [
    { id: 'rules', title: 'Rules', show: true, body: '**How points work**\nEvery game gives points to your team. Admins add points for the physical games.\n\n**Be kind**\nPlay fair, cheer loud, have fun.' },
  ],
  poll: { home: 8, room: 2, hunt: 4, admin: 5 },
  signin: { pinLength: 4, allowNew: true, maxTries: 5, lockMinutes: 5 },
  scoreboard: { feedCount: 8, showIndividuals: true, individualCount: 10, showSnapshotWhenFrozen: true },
  reveal: { defaultSeconds: 10, stepSeconds: 2.5, showMvp: true },
  lms: {
    enabled: true, playersCanCreate: true, playersCanSetRules: true, maxPlayers: 50, minPlayers: 3, chatGapSeconds: 2,
    defaults: { lives: 3, bad_eggs: 0, bad_ratio: 8, cooldown: 0, show_attacker: true, show_bad_count: true, chat: true,
                ghost_chat: false, late_join: false, win_points: 50, kill_points: 0, backfire_points: 0, reveal_roles_at_end: true },
  },
  hunt: { enabled: true, placePoints: [100, 70, 50, 30], hintCost: 10, decoyFreezeSeconds: 120, stationPoints: 0, cameraScan: true },
  admins: { max: 5 },
  adminUi: { quickPoints: [5, 10, 20, 50] },
};

// ════════════════════════════════════════════════════════════════════════════
// SMALL HELPERS
// ════════════════════════════════════════════════════════════════════════════
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  Object.keys(over).forEach((k) => { out[k] = isObj(base[k]) && isObj(over[k]) ? deepMerge(base[k], over[k]) : over[k]; });
  return out;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const fill = (s, vars = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Text from settings, with {placeholders} filled in. Use T('key') everywhere. */
const T = (key, vars) => fill(Settings.get().text[key] ?? DEFAULT_SETTINGS.text[key] ?? key, vars);

/** Light formatting for admin-written text: **bold**, new lines, "- " bullets. Always escaped first. */
function rich(s) {
  const lines = esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n');
  let html = '', inList = false;
  lines.forEach((l) => {
    if (/^\s*-\s+/.test(l)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${l.replace(/^\s*-\s+/, '')}</li>`; return; }
    if (inList) { html += '</ul>'; inList = false; }
    html += l.trim() ? `<p>${l}</p>` : '';
  });
  return html + (inList ? '</ul>' : '');
}

// Colours
function hexRgb(hex) {
  const h = String(hex || '#888').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
}
const rgbHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
function mix(hex, other, t) { const a = hexRgb(hex), b = hexRgb(other); return rgbHex(...a.map((v, i) => v + (b[i] - v) * t)); }
function luminance(hex) {
  return hexRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}
const inkFor = (hex) => (luminance(hex) > 0.45 ? '#1d1a14' : '#ffffff');

// Toasts and dialogs
function toast(msg, kind = 'info', ms = 3200) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
function modal(html, { onMount } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back" data-act="modal.close"></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  if (onMount) onMount($('.modal', root));
  const first = $('.modal input, .modal textarea, .modal button', root); if (first) first.focus();
}
function closeModal() { const root = $('#modal-root'); root.innerHTML = ''; root.hidden = true; }
function confirmBox(text, okLabel = 'Yes') {
  return new Promise((resolve) => {
    modal(`<p class="modal-text">${esc(text)}</p><div class="btn-row end"><button class="btn btn-ghost" data-act="modal.close">Cancel</button><button class="btn btn-primary" id="confirm-ok">${esc(okLabel)}</button></div>`);
    $('#confirm-ok').onclick = () => { closeModal(); resolve(true); };
    $('#modal-root .modal-back').onclick = () => { closeModal(); resolve(false); };
    $$('#modal-root [data-act="modal.close"]').forEach((b) => { b.onclick = () => { closeModal(); resolve(false); }; });
  });
}
function promptBox(text, { value = '', type = 'text', okLabel = 'Save', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    modal(`<form id="prompt-form"><label class="field-label" for="prompt-in">${esc(text)}</label>
      <input class="input" id="prompt-in" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"/>
      <div class="btn-row end"><button type="button" class="btn btn-ghost" id="prompt-cancel">Cancel</button><button class="btn btn-primary">${esc(okLabel)}</button></div></form>`);
    $('#prompt-form').onsubmit = (e) => { e.preventDefault(); const v = $('#prompt-in').value; closeModal(); resolve(v); };
    $('#prompt-cancel').onclick = () => { closeModal(); resolve(null); };
  });
}
/** Runs an async action with a busy button and turns errors into a toast. */
async function guard(btn, fn) {
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) {
    console.error(e);
    if (e && /sign in again/i.test(e.message)) { App.signOutLocal(); return; }
    toast(e.message || String(e), 'error', 4500);
  } finally { if (btn) btn.disabled = false; }
}
const timeAgo = (iso) => {
  const s = Math.max(0, (Date.now() + App.offset - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════════════════
const Settings = {
  _value: null, savedAt: null,
  get() { if (!this._value) this._value = deepMerge(DEFAULT_SETTINGS, LS.get('hh:settings', {}) || {}); return this._value; },
  saved() { return LS.get('hh:settings', {}) || {}; },
  set(saved, at) {
    LS.set('hh:settings', saved || {});
    this._value = deepMerge(DEFAULT_SETTINGS, saved || {});
    if (at !== undefined) { this.savedAt = at; LS.set('hh:settingsAt', at); }
    Brand.apply();
  },
  async refresh() {
    try { const row = await DB.pub.settings(); this.set(row.value || {}, row.updated_at); return true; } catch (e) { console.warn('[settings]', e); return false; }
  },
};

// ════════════════════════════════════════════════════════════════════════════
// BRAND + TEAM THEME
// ════════════════════════════════════════════════════════════════════════════
const Brand = {
  apply() {
    const a = Settings.get().appearance, r = document.documentElement.style;
    r.setProperty('--sky', a.sky); r.setProperty('--sky-deep', a.skyDeep); r.setProperty('--gold', a.gold);
    r.setProperty('--outline', a.outline); r.setProperty('--coral', a.coral);
    r.setProperty('--font-display', `'${a.displayFont}', 'Lilita One', system-ui, sans-serif`);
    r.setProperty('--font-body', `'${a.bodyFont}', 'Fredoka', system-ui, sans-serif`);
    const fontHref = a.fontCssUrl || `https://fonts.googleapis.com/css2?family=${encodeURIComponent(a.displayFont).replace(/%20/g, '+')}&family=${encodeURIComponent(a.bodyFont).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
    const link = $('#font-link'); if (link && link.getAttribute('href') !== fontHref) link.setAttribute('href', fontHref);
    $('#custom-css').textContent = a.customCss || '';
    document.title = Settings.get().app.name;
    $$('[data-brand]').forEach((el) => { const k = el.dataset.brand; el.textContent = Settings.get().app[k] ?? ''; });
  },
  wordmark(size = '') {
    const a = Settings.get().appearance;
    return `<div class="wordmark ${size}" aria-label="${esc(Settings.get().app.name)}"><span class="wm-top">${esc(a.wordTop)}</span><span class="wm-bottom">${esc(a.wordBottom)}</span></div>`;
  },
  team(team) {
    const b = document.body;
    if (!team || !Settings.get().appearance.teamTheme) { b.classList.remove('team-mode'); return; }
    const c = team.color;
    b.classList.add('team-mode');
    b.style.setProperty('--team', c);
    b.style.setProperty('--team-deep', mix(c, '#000000', 0.55));
    b.style.setProperty('--team-mid', mix(c, '#000000', 0.25));
    b.style.setProperty('--team-soft', mix(c, '#ffffff', 0.85));
    b.style.setProperty('--team-ink', inkFor(c));
    const meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', mix(c, '#000000', 0.55));
  },
};

// ════════════════════════════════════════════════════════════════════════════
// POLLING — phones ask for updates on a timer (no live connection needed)
// ════════════════════════════════════════════════════════════════════════════
const Poll = {
  timers: {},
  every(key, secondsFn, fn) {
    this.stop(key);
    const loop = async () => {
      try { await fn(); } catch (e) { console.warn('[poll]', key, e); }
      if (!this.timers[key]) return;
      const base = Math.max(1, Number(secondsFn()) || 5) * 1000;
      this.timers[key].t = setTimeout(loop, document.hidden ? base * 4 : base);
    };
    this.timers[key] = { t: null };
    loop();
  },
  stop(key) { if (this.timers[key]) { clearTimeout(this.timers[key].t); delete this.timers[key]; } },
  kick(key) { const t = this.timers[key]; if (t) { clearTimeout(t.t); delete this.timers[key]; } },
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) App.refresh(); });

// ════════════════════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════════════════════
const App = {
  token: LS.get('hh:token'),
  me: LS.get('hh:me'),
  teams: LS.get('hh:teams', []),
  data: null,
  offset: 0,
  view: null,
  online: true,

  team(id) { return this.teams.find((t) => t.id === id) || null; },
  myTeam() { return this.me ? this.team(this.me.team_id) : null; },
  serverNow() { return Date.now() + this.offset; },

  async start() {
    Brand.apply();
    // Remember a scanned hunt code until the player is signed in
    const params = new URLSearchParams(location.search);
    if (params.get('s')) { LS.set('hh:pendingScan', params.get('s')); history.replaceState(null, '', location.pathname + location.hash); }
    if (!DB.ready) {
      $('#splash').innerHTML = '<div class="splash-inner"><p class="splash-err">The site is not connected to its database yet.<br>Add your Supabase URL and key in <code>supabase.js</code>.</p></div>';
      return;
    }
    await Settings.refresh();
    try { this.teams = await DB.pub.teams(); LS.set('hh:teams', this.teams); } catch (_) {}
    window.addEventListener('hashchange', () => this.route());
    $('#splash').hidden = true;
    this.route();
  },

  /** Hash routes: #/home  #/scores  #/schedule  #/lms  #/lms/CODE  #/hunt  #/page/ID  #/admin… */
  route() {
    const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const name = parts[0];
    // Password-reset links from Supabase land here with tokens in the address
    if (/access_token|type=recovery|error_description/.test(location.hash)) { this.showShell(false); return AdminApp.open([]); }
    if (name === 'admin') { this.showShell(false); return AdminApp.open(parts.slice(1)); }
    AdminApp.close();
    if (!this.token) { this.showJoin(); return; }
    this.showShell(true);
    const view = VIEWS[name] ? name : 'home';
    if (this.view && this.view !== view && VIEWS[this.view].unmount) VIEWS[this.view].unmount();
    this.view = view;
    this.renderNav();
    const v = VIEWS[view];
    $('#view').innerHTML = v.render(parts.slice(1));
    if (v.mounted) v.mounted(parts.slice(1));
    window.scrollTo(0, 0);
    if (!Poll.timers.main) Poll.every('main', () => Settings.get().poll.home, () => this.refresh());
    const pending = LS.get('hh:pendingScan');
    if (pending && view !== 'hunt') location.hash = '#/hunt';
  },
  go(hash) { if (location.hash === hash) this.route(); else location.hash = hash; },

  showJoin() {
    Poll.stop('main');
    $('#shell').hidden = true; $('#admin').hidden = true; $('#join').hidden = false;
    Brand.team(null);
    const s = Settings.get(), a = s.appearance, n = s.signin.pinLength;
    $('#join').innerHTML = `<div class="join-card">
      ${a.logos && a.logos.length ? `<div class="logos">${a.logos.map((u) => `<img src="${esc(u)}" alt=""/>`).join('')}</div>` : ''}
      <p class="presenter">${esc(s.app.presenter)}</p>
      ${Brand.wordmark('wm-big')}
      <p class="ribbon">${esc(s.app.tagline)}</p>
      <form class="join-form card" data-submit="join" novalidate>
        <h1 class="h2">${esc(T('joinTitle'))}</h1>
        <label class="field-label" for="j-name">${esc(T('nameLabel'))}</label>
        <input class="input" id="j-name" name="name" autocomplete="name" maxlength="30" required/>
        <small class="hint">${esc(T('nameHint'))}</small>
        <label class="field-label" for="j-pin">${esc(T('pinLabel'))}</label>
        <input class="input pin" id="j-pin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="${n}" autocomplete="off" required/>
        <small class="hint">${esc(T('pinHint', { n }))}</small>
        <fieldset class="team-pick"><legend class="field-label">${esc(T('teamLabel'))}</legend>
          <div class="team-grid">${this.teams.map((t) => `<label class="team-opt" style="--c:${esc(t.color)};--ink:${inkFor(t.color)}"><input type="radio" name="team" value="${t.id}"/><span>${esc(t.name)}</span></label>`).join('')}</div>
          <small class="hint">${esc(T('teamHint'))}</small></fieldset>
        <button class="btn btn-gold btn-block btn-big" type="submit">${esc(T('joinButton'))}</button>
        <p class="hint center">${esc(T('returningNote'))}</p>
      </form>
      <p class="venue">${esc(s.app.dateText)} · ${esc(s.app.venue)}</p>
      <a class="admin-link" href="#/admin">${esc(T('adminLink'))}</a>
    </div>`;
  },
  showShell(on) {
    $('#join').hidden = true;
    $('#shell').hidden = !on;
    $('#admin').hidden = on;
    if (on) Brand.team(this.myTeam());
  },

  async join(form) {
    const name = form.name.value.trim(), pin = form.pin.value.trim(), team = form.team.value ? Number(form.team.value) : null;
    const n = Settings.get().signin.pinLength;
    if (name.length < 2) return toast('Type your name.', 'error');
    if (!/^\d+$/.test(pin) || pin.length !== n) return toast(`Your PIN should be ${n} digits.`, 'error');
    const res = await DB.player.join(name, pin, team);
    if (!res.ok) return toast(res.error, 'error', 5000);
    this.token = res.token; this.me = res.player;
    LS.set('hh:token', this.token); LS.set('hh:me', this.me);
    toast(`Welcome, ${this.me.name}!`, 'good');
    this.go(LS.get('hh:pendingScan') ? '#/hunt' : '#/home');
  },
  async signOut() {
    if (!(await confirmBox(T('signOutConfirm'), T('signOut')))) return;
    await DB.player.signOut(this.token);
    this.signOutLocal();
  },
  signOutLocal() {
    this.token = null; this.me = null; LS.del('hh:token'); LS.del('hh:me');
    Object.keys(Poll.timers).forEach((k) => Poll.stop(k));
    if (this.view && VIEWS[this.view].unmount) VIEWS[this.view].unmount();
    this.view = null;
    location.hash = '#/home'; this.showJoin();
  },

  /** The main poll: scores, schedule, announcements, my info, settings changes. */
  async refresh() {
    if (!this.token || !DB.ready) return;
    let d;
    try { d = await DB.player.poll(this.token, 0); this.setOnline(true); } catch (e) { this.setOnline(false); return; }
    this.offset = Date.parse(d.now) - Date.now();
    if (d.me && d.me.signed_out) { toast('Please sign in again.', 'error'); return this.signOutLocal(); }
    if (d.me) { this.me = { ...this.me, ...d.me }; LS.set('hh:me', this.me); }
    const teamsChanged = JSON.stringify(d.teams) !== JSON.stringify(this.teams);
    this.teams = d.teams; LS.set('hh:teams', d.teams);
    const settingsChanged = d.settings_at && d.settings_at !== (Settings.savedAt || LS.get('hh:settingsAt'));
    if (settingsChanged) await Settings.refresh();
    this.data = d;
    Brand.team(this.myTeam());
    this.renderNav();
    this.announce(d.announcements);
    Reveal.check(d.scoreboard);
    const v = VIEWS[this.view];
    if (settingsChanged || teamsChanged) { if (v && !v.keepOnSettings) this.route(); }
    else if (v && v.update) v.update(d);
  },
  setOnline(on) {
    if (on === this.online) return;
    this.online = on;
    const bar = $('#offline'); bar.hidden = on; bar.textContent = T('offline');
  },
  announce(list) {
    if (!list || !list.length) return;
    const seen = LS.get('hh:annSeen', 0);
    const fresh = list.filter((a) => a.id > seen).reverse();
    if (seen && fresh.length) fresh.forEach((a) => toast(a.body, 'gold', 7000));
    LS.set('hh:annSeen', Math.max(seen, ...list.map((a) => a.id)));
  },

  renderNav() {
    const s = Settings.get(), team = this.myTeam(), tiles = s.tiles.filter((t) => t.show);
    const has = (id) => tiles.some((t) => t.id === id);
    const tabs = [['home', T('navHome'), 'home'], ['scores', T('navScores'), 'trophy']];
    if (has('lms') && s.lms.enabled) tabs.push(['lms', T('navGames'), 'sword']);
    if (has('hunt') && s.hunt.enabled) tabs.push(['hunt', T('navHunt'), 'map']);
    if (has('schedule') && tabs.length < 5) tabs.push(['schedule', T('navSchedule'), 'clock']);
    $('#tabs').innerHTML = tabs.map(([id, label, icon]) => `<a href="#/${id}" class="tab ${this.view === id ? 'on' : ''}">${ICON(icon)}<span>${esc(label)}</span></a>`).join('');
    $('#team-chip').innerHTML = team ? `<span class="dot" style="background:${esc(team.color)}"></span>${esc(team.name)}` : '';
    $('#drawer-list').innerHTML = [
      ...tabs.map(([id, label]) => `<a href="#/${id}" data-act="nav.close">${esc(label)}</a>`),
      ...(has('schedule') && !tabs.some((t) => t[0] === 'schedule') ? [`<a href="#/schedule" data-act="nav.close">${esc(T('navSchedule'))}</a>`] : []),
      ...s.pages.filter((p) => p.show !== false).map((p) => `<a href="#/page/${esc(p.id)}" data-act="nav.close">${esc(p.title)}</a>`),
      `<a href="#/admin" data-act="nav.close">${esc(T('adminLink'))}</a>`,
      `<button class="link-btn" data-act="signout">${esc(T('signOut'))}${this.me ? ' (' + esc(this.me.name) + ')' : ''}</button>`,
    ].join('');
  },
};

// ════════════════════════════════════════════════════════════════════════════
// ICONS (inline, stroke style)
// ════════════════════════════════════════════════════════════════════════════
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  sword: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  map: '<path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2"/>',
  send: '<path d="M4 12l16-8-6 16-2-6z"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
};
const ICON = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ════════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════════
const Score = {
  ranked(totals) {
    const list = (totals || []).map((t) => ({ ...t, team: App.team(t.team_id) })).filter((t) => t.team);
    list.sort((a, b) => b.total - a.total || a.team.sort - b.team.sort);
    let rank = 0, prev = null;
    list.forEach((t, i) => { if (t.total !== prev) rank = i + 1; t.rank = rank; prev = t.total; });
    return list;
  },
  board(sb, compact = false) {
    if (!sb) return '<div class="skeleton"></div>';
    if (!sb.totals) return `<div class="card frozen-card">${ICON('trophy', 'ic big')}<p>${esc(T('scoresFrozen'))}</p></div>`;
    const list = this.ranked(sb.totals), max = Math.max(1, ...list.map((t) => Math.abs(t.total)));
    return `${sb.frozen ? `<p class="notice">${esc(T('scoresFrozenSnapshot'))}</p>` : ''}
      <div class="board ${compact ? 'compact' : ''}">${list.map((t) => `
        <div class="board-row ${App.me && App.me.team_id === t.team_id ? 'mine' : ''}" style="--c:${esc(t.team.color)};--ink:${inkFor(t.team.color)}">
          <span class="board-rank">${t.rank === 1 && t.total > 0 ? ICON('crown') : t.rank}</span>
          <div class="board-bar"><div class="board-fill" style="width:${34 + (Math.max(0, t.total) / max) * 66}%"></div>
            <span class="board-name">${esc(t.team.name)}</span></div>
          <span class="board-total">${t.total}</span>
        </div>`).join('')}</div>`;
  },
};

const VIEWS = {
  home: {
    render() {
      const s = Settings.get(), me = App.me || {}, team = App.myTeam();
      const tiles = s.tiles.filter((t) => t.show && (t.id !== 'lms' || s.lms.enabled) && (t.id !== 'hunt' || s.hunt.enabled));
      const tileIcon = { lms: 'sword', hunt: 'map', scores: 'trophy', schedule: 'clock' };
      return `<section class="hero">
          <p class="eyebrow">${esc(T('homeTeamLine', { team: team ? team.name : '' }))}</p>
          <h1 class="h1">${esc(T('homeGreeting', { name: me.name || '' }))}</h1>
          <div class="stat-row" id="home-stats"></div>
        </section>
        <section class="card now-card" id="home-now"></section>
        <section class="card"><div class="card-head"><h2 class="h3">${esc(T('scoresTitle'))}</h2><a href="#/scores" class="link">See all</a></div><div id="home-board"></div></section>
        <section class="tiles">${tiles.map((t) => `<a class="tile" href="#/${esc(t.id)}">${ICON(tileIcon[t.id] || 'home', 'ic tile-ic')}<strong>${esc(t.label)}</strong><span>${esc(t.blurb || '')}</span></a>`).join('')}</section>`;
    },
    mounted() { if (App.data) this.update(App.data); },
    update(d) {
      const sb = d.scoreboard, me = d.me || {};
      const mine = sb && sb.totals ? Score.ranked(sb.totals).find((t) => t.team_id === me.team_id) : null;
      const stats = $('#home-stats');
      if (stats) stats.innerHTML = `
        <div class="stat"><span>${esc(T('homeTeamPoints'))}</span><strong>${mine ? mine.total : '–'}</strong></div>
        <div class="stat"><span>${esc(T('homeRank'))}</span><strong>${mine ? ordinal(mine.rank) : '–'}</strong></div>
        <div class="stat"><span>${esc(T('homeYourPoints'))}</span><strong>${me.points ?? 0}</strong></div>`;
      const live = (d.activities || []).filter((a) => a.status === 'live');
      const next = (d.activities || []).find((a) => a.status === 'upcoming');
      const now = $('#home-now');
      if (now) now.innerHTML = `<span class="tag tag-live">${esc(T('homeNow'))}</span>
        ${live.length ? live.map((a) => `<h2 class="h2">${esc(a.title)}</h2>${a.details ? `<div class="rich">${rich(a.details)}</div>` : ''}`).join('') : `<p class="muted">${esc(T('homeNothing'))}</p>`}
        ${next ? `<p class="next">${esc(T('statusUpcoming'))}: <strong>${esc(next.title)}</strong>${next.time ? ' · ' + esc(next.time) : ''}</p>` : ''}
        ${(d.announcements || []).slice(0, 1).map((a) => `<p class="ann">${esc(a.body)}</p>`).join('')}`;
      const b = $('#home-board'); if (b) b.innerHTML = Score.board(sb, true);
    },
  },

  scores: {
    render() {
      return `<h1 class="h1 page-title">${esc(T('scoresTitle'))}</h1>
        <section class="card" id="sc-board"></section>
        <section class="card" id="sc-people" hidden></section>
        <section class="card" id="sc-feed" hidden></section>`;
    },
    mounted() { if (App.data) this.update(App.data); },
    update(d) {
      const sb = d.scoreboard;
      $('#sc-board').innerHTML = Score.board(sb);
      const people = $('#sc-people'), feed = $('#sc-feed');
      people.hidden = !(sb && sb.people && sb.people.length);
      if (!people.hidden) people.innerHTML = `<h2 class="h3">${esc(T('peopleTitle'))}</h2><ol class="people">${sb.people.map((p) => { const t = App.team(p.team_id); return `<li><span class="dot" style="background:${esc(t ? t.color : '#999')}"></span><span class="grow">${esc(p.name)}</span><strong>${p.total}</strong></li>`; }).join('')}</ol>`;
      feed.hidden = !(sb && sb.feed && sb.feed.length);
      if (!feed.hidden) feed.innerHTML = `<h2 class="h3">${esc(T('feedTitle'))}</h2><ul class="feed">${sb.feed.map((f) => { const t = App.team(f.team_id); return `<li><span class="pts ${f.amount < 0 ? 'neg' : ''}" style="--c:${esc(t ? t.color : '#999')}">${f.amount > 0 ? '+' : ''}${f.amount}</span><span class="grow"><strong>${esc(t ? t.name : '')}</strong>${f.name ? ' · ' + esc(f.name) : ''}<br><small class="muted">${esc([f.game, f.reason].filter(Boolean).join(' · '))}</small></span><small class="muted">${esc(timeAgo(f.at))}</small></li>`; }).join('')}</ul>`;
    },
  },

  schedule: {
    render() { return `<h1 class="h1 page-title">${esc(T('scheduleTitle'))}</h1><div id="sch"></div>`; },
    mounted() { if (App.data) this.update(App.data); },
    update(d) {
      const acts = d.activities || [], anns = d.announcements || [];
      const label = { live: T('statusLive'), upcoming: T('statusUpcoming'), done: T('statusDone') };
      $('#sch').innerHTML = `${anns.length ? `<section class="card"><h2 class="h3">${esc(T('announcementsTitle'))}</h2>${anns.map((a) => `<p class="ann">${esc(a.body)} <small class="muted">${esc(timeAgo(a.at))}</small></p>`).join('')}</section>` : ''}
        ${acts.length ? `<ol class="timeline">${acts.map((a) => `<li class="tl-${esc(a.status)}"><div class="tl-dot"></div><div class="card">
          <div class="card-head"><span class="tag tag-${esc(a.status)}">${esc(label[a.status] || a.status)}</span>${a.time ? `<small class="muted">${esc(a.time)}</small>` : ''}</div>
          <h2 class="h3">${esc(a.title)}</h2>${a.details ? `<div class="rich">${rich(a.details)}</div>` : ''}</div></li>`).join('')}</ol>` : `<p class="muted center">${esc(T('scheduleEmpty'))}</p>`}`;
    },
  },

  page: {
    render(params) {
      const p = Settings.get().pages.find((x) => x.id === params[0]);
      if (!p) return '<p class="muted center">Page not found.</p>';
      return `<h1 class="h1 page-title">${esc(p.title)}</h1><section class="card rich">${rich(p.body)}</section>`;
    },
  },
};

// ════════════════════════════════════════════════════════════════════════════
// WINNER REVEAL — every phone counts down to the same moment
// ════════════════════════════════════════════════════════════════════════════
const Reveal = {
  running: false,
  check(sb) {
    if (!sb || !sb.reveal_at || sb.reveal_id == null || this.running) return;
    if (LS.get('hh:revealSeen') === sb.reveal_id) return;
    const at = Date.parse(sb.reveal_at);
    if (App.serverNow() > at + 5 * 60 * 1000) return; // too old
    this.run(at, sb.reveal_id);
  },
  async run(at, id) {
    this.running = true;
    const box = $('#reveal'); box.hidden = false; box.className = 'reveal';
    box.innerHTML = `<div class="reveal-inner">${Brand.wordmark()}<p class="reveal-title">${esc(T('revealTitle'))}</p><div class="reveal-count" id="rv-count"></div></div>`;
    while (App.serverNow() < at) {
      const left = Math.ceil((at - App.serverNow()) / 1000);
      const c = $('#rv-count'); if (c) c.textContent = left;
      await sleep(200);
    }
    let d = null;
    for (let i = 0; i < 5 && !d; i++) { try { d = await DB.player.poll(App.token, 0); } catch (_) { await sleep(800); } }
    const list = d && d.scoreboard && d.scoreboard.totals ? Score.ranked(d.scoreboard.totals) : [];
    if (d) { App.teams = d.teams; }
    const step = Settings.get().reveal.stepSeconds * 1000;
    const inner = $('.reveal-inner', box);
    inner.innerHTML = `<p class="reveal-title">${esc(T('revealTitle'))}</p><div class="reveal-list" id="rv-list"></div>`;
    for (const t of list.slice(1).reverse()) {
      $('#rv-list').insertAdjacentHTML('afterbegin', `<div class="rv-row pop" style="--c:${esc(t.team.color)};--ink:${inkFor(t.team.color)}"><span>${esc(T('revealPlace', { place: ordinal(t.rank) }))}</span><strong>${esc(t.team.name)}</strong><span>${t.total}</span></div>`);
      await sleep(step);
    }
    const win = list[0];
    if (win) {
      box.style.setProperty('--c', win.team.color); box.style.setProperty('--ink', inkFor(win.team.color));
      box.classList.add('won');
      const mvp = Settings.get().reveal.showMvp && d.scoreboard.people && d.scoreboard.people[0];
      inner.innerHTML = `${ICON('crown', 'ic huge')}<p class="reveal-win">${esc(T('revealWinner', { team: win.team.name }))}</p><p class="reveal-pts">${win.total} ${esc(T('pointsUnit'))}</p>
        ${mvp ? `<p class="reveal-mvp">${esc(T('revealMvp', { name: mvp.name }))}</p>` : ''}
        <div class="reveal-list small">${list.slice(1).map((t) => `<div class="rv-row" style="--c:${esc(t.team.color)};--ink:${inkFor(t.team.color)}"><span>${ordinal(t.rank)}</span><strong>${esc(t.team.name)}</strong><span>${t.total}</span></div>`).join('')}</div>
        <button class="btn btn-ghost-light" data-act="reveal.close">${esc(T('revealClose'))}</button>`;
      if (Settings.get().appearance.confetti) Confetti.burst([win.team.color, Settings.get().appearance.gold, '#ffffff']);
    }
    LS.set('hh:revealSeen', id);
    this.running = false;
  },
  close() { const box = $('#reveal'); box.hidden = true; box.innerHTML = ''; box.className = 'reveal'; Confetti.stop(); },
};

const Confetti = {
  raf: null,
  burst(colors) {
    const cv = $('#confetti'); const ctx = cv.getContext('2d');
    cv.hidden = false; cv.width = innerWidth; cv.height = innerHeight;
    const parts = Array.from({ length: 180 }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height, r: 4 + Math.random() * 6,
      c: colors[Math.floor(Math.random() * colors.length)], vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, a: Math.random() * 6, va: -0.2 + Math.random() * 0.4 }));
    const end = Date.now() + 6000;
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => { p.y += p.vy; p.x += p.vx; p.a += p.va; if (p.y > cv.height + 20 && Date.now() < end - 1500) { p.y = -20; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore(); });
      if (Date.now() < end) this.raf = requestAnimationFrame(tick); else this.stop();
    };
    cancelAnimationFrame(this.raf); tick();
  },
  stop() { cancelAnimationFrame(this.raf); const cv = $('#confetti'); if (cv) cv.hidden = true; },
};

// ════════════════════════════════════════════════════════════════════════════
// EVENTS — buttons use data-act, forms use data-submit, inputs data-change
// ════════════════════════════════════════════════════════════════════════════
const ACTIONS = {
  'modal.close': () => closeModal(),
  'nav.open': () => document.body.classList.add('drawer-open'),
  'nav.close': () => document.body.classList.remove('drawer-open'),
  'signout': () => { document.body.classList.remove('drawer-open'); App.signOut(); },
  'reveal.close': () => Reveal.close(),
};
const SUBMITS = { join: (form, btn) => guard(btn, () => App.join(form)) };
const CHANGES = {};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-submit]'); if (!form) return;
  e.preventDefault();
  const fn = SUBMITS[form.dataset.submit]; if (fn) fn(form, form.querySelector('[type="submit"], button:not([type])'));
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, e); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); document.body.classList.remove('drawer-open'); } });

window.addEventListener('DOMContentLoaded', () => App.start());
