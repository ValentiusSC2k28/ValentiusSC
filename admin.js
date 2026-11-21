/**
 * admin.js — the admin dashboard (#/admin). Only signed-in admins get in.
 * The database decides who is an admin; hiding screens here is only tidiness.
 *
 * Sections: Overview · Scores · Activity · Games · Teams · Players ·
 * Last Man Standing · Treasure Hunt · Pages & tiles · Appearance · Text ·
 * Admins · Settings · Danger zone
 */

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS FORM HELPERS — F(label, path, kind, hint) draws one field bound to a
// settings path; SET.collect() reads them back; SET.save() stores them.
// ════════════════════════════════════════════════════════════════════════════
const SET = {
  draft: null,
  start() { this.draft = clone(Settings.get()); },
  get(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.draft); },
  put(path, value) { const ks = path.split('.'); const last = ks.pop(); const tgt = ks.reduce((o, k) => (o[k] = o[k] ?? {}), this.draft); tgt[last] = value; },
  collect(root) {
    $$('[data-path]', root).forEach((el) => {
      const kind = el.dataset.kind, p = el.dataset.path;
      let v;
      if (kind === 'bool') v = el.checked;
      else if (kind === 'number') v = el.value === '' ? 0 : Number(el.value);
      else if (kind === 'numlist') v = el.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x) && String(x) !== '');
      else if (kind === 'textlist') v = el.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
      else v = el.value;
      this.put(p, v);
    });
  },
  async save(root, msg = 'Saved. Phones update within a few seconds.') {
    if (root) this.collect(root);
    await DB.admin.saveSettings(this.draft);
    Settings.set(this.draft, null);
    toast(msg, 'good');
  },
};
function F(label, path, kind = 'text', hint = '') {
  const v = SET.get(path);
  const id = 'f-' + path.replace(/\W/g, '-');
  const h = hint ? `<small class="hint">${esc(hint)}</small>` : '';
  const attrs = `id="${id}" data-path="${esc(path)}" data-kind="${kind}"`;
  if (kind === 'bool') return `<label class="switch field"><input type="checkbox" ${attrs} ${v ? 'checked' : ''}/> ${esc(label)}${h}</label>`;
  if (kind === 'long') return `<div class="field wide"><label class="field-label" for="${id}">${esc(label)}</label><textarea class="input" rows="4" ${attrs}>${esc(v ?? '')}</textarea>${h}</div>`;
  if (kind === 'color') return `<div class="field"><label class="field-label" for="${id}">${esc(label)}</label><div class="color-in"><input type="color" value="${esc(v)}" oninput="this.nextElementSibling.value=this.value"/><input class="input" ${attrs} value="${esc(v ?? '')}" oninput="if(/^#[0-9a-f]{6}$/i.test(this.value))this.previousElementSibling.value=this.value"/></div>${h}</div>`;
  const val = kind === 'numlist' ? (v || []).join(', ') : kind === 'textlist' ? (v || []).join('\n') : v ?? '';
  if (kind === 'textlist') return `<div class="field wide"><label class="field-label" for="${id}">${esc(label)}</label><textarea class="input" rows="3" ${attrs}>${esc(val)}</textarea>${h}</div>`;
  return `<div class="field"><label class="field-label" for="${id}">${esc(label)}</label><input class="input" type="${kind === 'number' ? 'number' : 'text'}" ${kind === 'number' ? 'step="any"' : ''} ${attrs} value="${esc(val)}"/>${h}</div>`;
}
const box = (title, inner, extra = '') => `<section class="card admin-card" ${extra}><h2 class="h3">${esc(title)}</h2>${inner}</section>`;
const saveBtn = (act = 'adm.saveSettings', label = 'Save changes') => `<div class="btn-row"><button class="btn btn-primary" data-act="${act}">${esc(label)}</button></div>`;
const teamSelect = (name, selected, any = false) => `<select class="input" name="${name}">${any ? '<option value="">—</option>' : ''}${App.teams.map((t) => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
const human = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : '');

// ════════════════════════════════════════════════════════════════════════════
// THE ADMIN APP
// ════════════════════════════════════════════════════════════════════════════
const AdminApp = {
  session: null, isAdmin: false, section: 'overview', params: [], cache: {}, inited: false,

  async open(parts) {
    $('#join').hidden = true; $('#shell').hidden = true; $('#admin').hidden = false;
    Brand.team(null);
    if (!this.inited) {
      this.inited = true;
      DB.auth.onChange((ev, s) => {
        this.session = s;
        if (ev === 'PASSWORD_RECOVERY') { location.hash = '#/admin'; this.askNewPassword(); }
        if (ev === 'SIGNED_OUT') { this.isAdmin = false; if (location.hash.startsWith('#/admin')) this.open([]); }
      });
    }
    this.session = await DB.auth.session();
    if (!this.session) return this.loginScreen();
    if (!this.isAdmin) {
      await DB.admin.claim().catch(() => false);
      this.isAdmin = await DB.admin.isAdmin();
    }
    if (!this.isAdmin) return this.notAdmin();
    this.section = ADMIN[parts[0]] ? parts[0] : 'overview';
    this.params = parts.slice(1);
    this.shell();
  },
  close() { Poll.stop('admin'); Poll.stop('adminRoom'); const a = $('#admin'); if (a) a.hidden = true; },

  loginScreen() {
    Poll.stop('admin');
    $('#admin').innerHTML = `<div class="admin-login">${Brand.wordmark()}
      <form class="card" data-submit="adm.login" novalidate><h1 class="h2">Admin sign-in</h1>
        <label class="field-label" for="a-email">Email</label><input class="input" id="a-email" name="email" type="email" autocomplete="email"/>
        <label class="field-label" for="a-pass">Password</label><input class="input" id="a-pass" name="password" type="password" autocomplete="current-password"/>
        <button class="btn btn-primary btn-block">Sign in</button>
        <div class="btn-row between"><button type="button" class="link" data-act="adm.signup">Create an admin account</button><button type="button" class="link" data-act="adm.forgot">Forgot password?</button></div>
        <p class="muted small">New admins: create an account here, then ask an existing admin to add your email. The very first account becomes the first admin automatically.</p>
      </form><a class="link" href="#/home">← Back to the app</a></div>`;
  },
  notAdmin() {
    const email = this.session && this.session.user ? this.session.user.email : '';
    $('#admin').innerHTML = `<div class="admin-login"><section class="card"><h1 class="h2">Not an admin yet</h1>
      <p>You are signed in as <strong>${esc(email)}</strong>, but this account is not an admin. Ask an admin to add this email in Admin → Admins.</p>
      <div class="btn-row"><button class="btn btn-ghost" data-act="adm.logout">Sign out</button><a class="btn btn-primary" href="#/home">Back to the app</a></div></section></div>`;
  },
  async askNewPassword() {
    const p = await promptBox('Choose a new password (at least 6 characters)', { type: 'password' });
    if (p) guard(null, async () => { await DB.auth.updatePassword(p); toast('Password changed.', 'good'); this.open([]); });
  },

  shell() {
    Poll.stop('admin'); Poll.stop('adminRoom');
    const email = this.session.user.email;
    $('#admin').innerHTML = `<div class="admin-wrap">
      <header class="admin-top"><button class="icon-btn admin-menu-btn" data-act="adm.menu" aria-label="Sections">${ICON('menu')}</button>
        <strong class="admin-brand">${esc(Settings.get().app.name)} <span>Admin</span></strong>
        <span class="grow"></span><a class="btn btn-ghost small" href="#/home">Open the app</a>
        <button class="btn btn-ghost small" data-act="adm.logout" title="${esc(email)}">Sign out</button></header>
      <div class="admin-body"><nav class="admin-nav" id="admin-nav">${Object.entries(ADMIN).map(([k, s]) => `<a href="#/admin/${k}" class="${k === this.section ? 'on' : ''}">${esc(s.label)}</a>`).join('')}</nav>
        <main class="admin-main" id="admin-main"><div class="skeleton"></div></main></div></div>`;
    this.draw();
  },
  async draw() {
    const sec = ADMIN[this.section];
    SET.start();
    try {
      const html = await sec.render(this.params);
      $('#admin-main').innerHTML = `<h1 class="h1">${esc(sec.label)}</h1>${sec.intro ? `<p class="muted">${esc(sec.intro)}</p>` : ''}${html}`;
      if (sec.mounted) await sec.mounted(this.params);
    } catch (e) { console.error(e); $('#admin-main').innerHTML = `<p class="notice error">${esc(e.message)}</p>`; }
  },
  redraw() { this.draw(); },
};

// ════════════════════════════════════════════════════════════════════════════
// SECTIONS
// ════════════════════════════════════════════════════════════════════════════
const ADMIN = {
  // ─── OVERVIEW ────────────────────────────────────────────────────────────
  overview: {
    label: 'Live overview',
    render: () => `<div id="ov"><div class="skeleton"></div></div>`,
    mounted() {
      Poll.every('admin', () => Settings.get().poll.admin, async () => {
        const o = await DB.admin.overview(); const el = $('#ov'); if (!el) return Poll.stop('admin');
        const totals = Object.fromEntries(o.totals.map((t) => [t.team_id, t.total]));
        const hs = o.hunt_state || {}, sb = o.scoreboard || {};
        el.innerHTML = `<div class="stats">
            <div class="stat-card"><span>Online now</span><strong>${o.online}</strong><small>of ${o.players} players</small></div>
            <div class="stat-card"><span>Active rooms</span><strong>${o.rooms.filter((r) => r.status !== 'ended' && r.status !== 'closed').length}</strong></div>
            <div class="stat-card"><span>Treasure hunt</span><strong>${esc(hs.status || 'off')}</strong></div>
            <div class="stat-card"><span>Scoreboard</span><strong>${sb.frozen ? 'Frozen' : 'Live'}</strong></div></div>
          <div class="team-cards">${o.teams.map((t) => { const tm = App.team(t.team_id); if (!tm) return ''; return `<div class="team-card" style="--c:${esc(tm.color)};--ink:${inkFor(tm.color)}">
            <strong>${esc(tm.name)}</strong><span class="big-num">${totals[t.team_id] ?? 0}</span><small>${t.players} players · ${t.online} online</small></div>`; }).join('')}</div>
          <div class="grid2">
            ${box('Rooms', o.rooms.length ? `<ul class="list">${o.rooms.map((r) => `<li><a href="#/admin/lms/${esc(r.code)}"><strong>${esc(r.code)}</strong> ${esc(r.name)}</a><span class="tag ${r.status === 'live' ? 'tag-live' : ''}">${esc(r.status)}</span><small>${r.players} in${r.status === 'live' ? ', ' + r.alive + ' standing' : ''}</small></li>`).join('')}</ul>` : '<p class="muted">No rooms.</p>')}
            ${box('Treasure hunt', o.hunt.length ? `<ul class="list">${o.hunt.map((h) => { const tm = App.team(h.team_id); return `<li><span class="dot" style="background:${esc(tm ? tm.color : '#999')}"></span><strong>${esc(tm ? tm.name : h.team_id)}</strong><span>${h.step}/${h.total}</span><small>${esc(h.stage)}${h.place ? ' · ' + ordinal(h.place) : ''}</small></li>`; }).join('')}</ul>` : '<p class="muted">Not set up yet.</p>')}
          </div>
          ${box('Live log', `<ul class="log admin-log">${o.log.map((l) => `<li><small class="muted">${esc(fmtTime(l.at))}</small> ${esc(l.text)}</li>`).join('')}</ul>`)}`;
      });
    },
  },

  // ─── SCORES ──────────────────────────────────────────────────────────────
  scores: {
    label: 'Scores',
    intro: 'Add points for any game, undo mistakes, freeze the board and run the winner reveal.',
    async render() {
      const [games, points, state, players] = await Promise.all([
        DB.table('hh_games').list('sort'), DB.table('hh_points').list('id', false, (q) => q.limit(300)),
        DB.table('hh_state').list('key'), DB.table('hh_players').list('name'),
      ]);
      AdminApp.cache.games = games; AdminApp.cache.players = players;
      const sb = (state.find((s) => s.key === 'scoreboard') || {}).value || {};
      const totals = {}; points.forEach((p) => { totals[p.team_id] = (totals[p.team_id] || 0) + p.amount; });
      const quick = (Settings.get().adminUi || {}).quickPoints || [5, 10, 20, 50];
      const pname = Object.fromEntries(players.map((p) => [p.id, p.name]));
      return `${box('Quick points', `<div class="quick-grid">${App.teams.map((t) => `<div class="quick-team" style="--c:${esc(t.color)};--ink:${inkFor(t.color)}">
          <strong>${esc(t.name)}</strong>
          <div class="btn-row">${quick.map((n) => `<button class="btn small" data-act="adm.quick" data-team="${t.id}" data-n="${n}">+${n}</button>`).join('')}<button class="btn small btn-ghost" data-act="adm.quick" data-team="${t.id}" data-n="-${quick[0]}">−${quick[0]}</button></div></div>`).join('')}</div>
          <p class="muted small">Quick buttons add points with the reason "Quick points". Change the amounts in Settings.</p>`)}
        ${box('Enter a game result', games.length ? `<form data-submit="adm.result" id="result-form">
          <div class="field"><label class="field-label" for="res-game">Game</label><select class="input" id="res-game" name="game" data-change="adm.resultGame">${games.filter((g) => g.active).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></div>
          <div id="res-places"></div><button class="btn btn-primary">Save result</button></form>` : '<p class="muted">Add your physical games in the Games section first.</p>')}
        ${box('Custom or individual points', `<form data-submit="adm.custom" class="grid2">
          <div class="field"><label class="field-label">Team</label>${teamSelect('team')}</div>
          <div class="field"><label class="field-label" for="c-player">Player (optional, for MVP)</label><input class="input" id="c-player" name="player" list="dl-players" placeholder="Type a name"/><datalist id="dl-players">${players.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist></div>
          <div class="field"><label class="field-label" for="c-amt">Points (minus to take away)</label><input class="input" id="c-amt" name="amount" type="number" required/></div>
          <div class="field"><label class="field-label" for="c-game">Game</label><input class="input" id="c-game" name="game" list="dl-games"/><datalist id="dl-games">${games.map((g) => `<option value="${esc(g.name)}"></option>`).join('')}</datalist></div>
          <div class="field wide"><label class="field-label" for="c-reason">Reason</label><input class="input" id="c-reason" name="reason" placeholder="e.g. Best dressed"/></div>
          <div class="wide"><button class="btn btn-primary">Add points</button><p class="muted small">If you pick a player, their team gets the points too.</p></div></form>`)}
        ${box('Freeze and winner reveal', `<p>The board is <strong>${sb.frozen ? 'frozen' : 'live'}</strong>${sb.reveal_at ? ` · last reveal ${esc(fmtTime(sb.reveal_at))}` : ''}.</p>
          <div class="btn-row">${sb.frozen ? '<button class="btn" data-act="adm.freeze" data-on="0">Unfreeze (show live scores)</button>' : '<button class="btn" data-act="adm.freeze" data-on="1">Freeze the board</button>'}</div>
          <form class="inline-form" data-submit="adm.reveal"><label class="field-label" for="rv-secs">Countdown (seconds)</label><input class="input short" id="rv-secs" name="secs" type="number" min="3" value="${Settings.get().reveal.defaultSeconds}"/><button class="btn btn-gold">Start the winner reveal</button></form>
          <p class="muted small">Freezing keeps players from seeing new points. The reveal counts down on every phone at once, then shows the places and the winner. Unfreeze afterwards to show live scores again.</p>`)}
        ${box('Totals right now (admins only)', `<div class="team-cards">${App.teams.map((t) => `<div class="team-card" style="--c:${esc(t.color)};--ink:${inkFor(t.color)}"><strong>${esc(t.name)}</strong><span class="big-num">${totals[t.id] || 0}</span></div>`).join('')}</div>`)}
        ${box('History', `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Team</th><th>Player</th><th>Points</th><th>Game / reason</th><th>By</th><th></th></tr></thead><tbody>
          ${points.map((p) => { const t = App.team(p.team_id); return `<tr class="${p.undo_of ? 'muted' : ''}"><td>${esc(fmtTime(p.created_at))}</td><td>${esc(t ? t.name : p.team_id)}</td><td>${esc(pname[p.player_id] || '')}</td><td><strong>${p.amount > 0 ? '+' : ''}${p.amount}</strong></td><td>${esc([p.game, p.reason].filter(Boolean).join(' · '))}</td><td><small>${esc(p.created_by || p.source)}</small></td>
            <td>${p.undo_of ? '<small>undo</small>' : `<button class="btn small btn-ghost" data-act="adm.undo" data-id="${p.id}">Undo</button>`}</td></tr>`; }).join('')}</tbody></table></div>`)}`;
    },
    mounted() { CHANGES['adm.resultGame']($('#res-game')); },
  },

  // ─── ACTIVITY CENTRE ─────────────────────────────────────────────────────
  activity: {
    label: 'Activity centre',
    intro: 'The schedule players see. Mark what is live now, and hide anything you do not want shown yet.',
    async render() {
      const [acts, anns] = await Promise.all([DB.table('hh_activities').list('sort'), DB.table('hh_announcements').list('id', false)]);
      return `${box('Schedule', `${acts.map((a, i) => `<form class="row-form" data-submit="adm.actSave" data-id="${a.id}">
            <div class="grid3"><div class="field"><label class="field-label">Title</label><input class="input" name="title" value="${esc(a.title)}"/></div>
            <div class="field"><label class="field-label">Time</label><input class="input" name="time_label" value="${esc(a.time_label)}" placeholder="e.g. 4:30 PM"/></div>
            <div class="field"><label class="field-label">Status</label><select class="input" name="status">${['upcoming', 'live', 'done'].map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
            <div class="field"><label class="field-label">Details</label><textarea class="input" name="details" rows="2">${esc(a.details)}</textarea></div>
            <div class="btn-row"><label class="switch"><input type="checkbox" name="visible" ${a.visible ? 'checked' : ''}/> Visible to players</label><span class="grow"></span>
              <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_activities" data-id="${a.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_activities" data-id="${a.id}" data-dir="1" ${i === acts.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn small btn-ghost" data-act="adm.del" data-table="hh_activities" data-id="${a.id}">Delete</button><button class="btn small btn-primary">Save</button></div></form>`).join('')}
          <button class="btn btn-gold" data-act="adm.actAdd">+ Add an item</button>`)}
        ${box('Announcements', `<form data-submit="adm.annPost" class="inline-form"><label class="sr" for="ann">Announcement</label><input class="input" id="ann" name="body" maxlength="200" placeholder="e.g. Tug of war starts in 5 minutes at the lawn"/><button class="btn btn-primary">Post</button></form>
          <p class="muted small">New announcements pop up on every phone.</p>
          <ul class="list">${anns.map((a) => `<li><span class="grow ${a.visible ? '' : 'muted'}">${esc(a.body)}</span><small>${esc(fmtTime(a.created_at))}</small>
            <button class="btn small btn-ghost" data-act="adm.annToggle" data-id="${a.id}" data-v="${a.visible ? 0 : 1}">${a.visible ? 'Hide' : 'Show'}</button><button class="btn small btn-ghost" data-act="adm.del" data-table="hh_announcements" data-id="${a.id}">Delete</button></li>`).join('')}</ul>`)}`;
    },
  },

  // ─── GAMES ───────────────────────────────────────────────────────────────
  games: {
    label: 'Games',
    intro: 'Your physical games and the points each place earns. Used by "Enter a game result" in Scores.',
    async render() {
      const games = await DB.table('hh_games').list('sort');
      return box('Games', `${games.map((g, i) => `<form class="row-form" data-submit="adm.gameSave" data-id="${g.id}"><div class="grid3">
          <div class="field"><label class="field-label">Name</label><input class="input" name="name" value="${esc(g.name)}"/></div>
          <div class="field"><label class="field-label">Points for 1st, 2nd, 3rd…</label><input class="input" name="points" value="${esc((g.points || []).join(', '))}"/></div>
          <div class="field"><label class="field-label">Notes</label><input class="input" name="description" value="${esc(g.description)}"/></div></div>
          <div class="btn-row"><label class="switch"><input type="checkbox" name="active" ${g.active ? 'checked' : ''}/> In use</label><span class="grow"></span>
          <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_games" data-id="${g.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_games" data-id="${g.id}" data-dir="1" ${i === games.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="btn small btn-ghost" data-act="adm.del" data-table="hh_games" data-id="${g.id}">Delete</button><button class="btn small btn-primary">Save</button></div></form>`).join('')}
        <button class="btn btn-gold" data-act="adm.gameAdd">+ Add a game</button>`);
    },
  },

  // ─── TEAMS ───────────────────────────────────────────────────────────────
  teams: {
    label: 'Teams',
    intro: 'Names, colours and order. Each player\'s screen uses their team colour.',
    async render() {
      const teams = await DB.table('hh_teams').list('sort');
      return box('Teams', `${teams.map((t) => `<form class="row-form" data-submit="adm.teamSave" data-id="${t.id}"><div class="grid3">
          <div class="field"><label class="field-label">Name</label><input class="input" name="name" value="${esc(t.name)}"/></div>
          <div class="field"><label class="field-label">Colour</label><div class="color-in"><input type="color" name="color" value="${esc(t.color)}"/><span class="swatch" style="background:${esc(t.color)};color:${inkFor(t.color)}">Aa</span></div></div>
          <div class="field"><label class="field-label">Order</label><input class="input" name="sort" type="number" value="${t.sort}"/></div></div>
          <div class="field"><label class="field-label">Motto (optional)</label><input class="input" name="motto" value="${esc(t.motto)}"/></div>
          <div class="btn-row"><label class="switch"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}/> Active</label><span class="grow"></span>
          <button type="button" class="btn small btn-ghost" data-act="adm.teamDel" data-id="${t.id}">Delete</button><button class="btn small btn-primary">Save</button></div></form>`).join('')}
        <button class="btn btn-gold" data-act="adm.teamAdd">+ Add a team</button>`);
    },
  },

  // ─── PLAYERS ─────────────────────────────────────────────────────────────
  players: {
    label: 'Players',
    async render() {
      const [players, points] = await Promise.all([DB.table('hh_players').list('name'), DB.table('hh_points').list('id', true, (q) => q.not('player_id', 'is', null))]);
      const pts = {}; points.forEach((p) => { pts[p.player_id] = (pts[p.player_id] || 0) + p.amount; });
      const online = (p) => Date.now() - Date.parse(p.last_seen) < 90000;
      return box(`${players.length} players`, `<input class="input" placeholder="Search names" data-filter="#pl-table tbody tr"/>
        <div class="table-wrap"><table class="table" id="pl-table"><thead><tr><th>Name</th><th>Team</th><th>Points</th><th>Last seen</th><th></th></tr></thead><tbody>
        ${players.map((p) => `<tr data-text="${esc(p.name.toLowerCase())}"><td>${online(p) ? '<span class="online-dot" title="Online"></span>' : ''}${esc(p.name)}${p.locked_until && Date.parse(p.locked_until) > Date.now() ? ' <small class="tag">locked</small>' : ''}</td>
          <td><select class="input small" data-change="adm.playerTeam" data-id="${p.id}">${App.teams.map((t) => `<option value="${t.id}" ${t.id === p.team_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
          <td>${pts[p.id] || 0}</td><td><small>${esc(fmtTime(p.last_seen))}</small></td>
          <td class="nowrap"><button class="btn small btn-ghost" data-act="adm.award" data-id="${p.id}" data-team="${p.team_id}" data-name="${esc(p.name)}">Award</button>
          <button class="btn small btn-ghost" data-act="adm.pin" data-id="${p.id}" data-name="${esc(p.name)}">Reset PIN</button>
          <button class="btn small btn-ghost" data-act="adm.del" data-table="hh_players" data-id="${p.id}" data-confirm="Remove ${esc(p.name)}? Their points stay with their team.">Remove</button></td></tr>`).join('')}
        </tbody></table></div>`);
    },
  },

  // ─── LAST MAN STANDING ───────────────────────────────────────────────────
  lms: {
    label: 'Last Man Standing',
    async render(params) {
      if (params[0]) return `<p><a href="#/admin/lms">← All rooms</a></p><div id="room-mon"><div class="skeleton"></div></div>`;
      const rooms = await DB.table('hh_rooms').list('id', false, (q) => q.limit(60));
      const d = SET.get('lms.defaults');
      return `${box('Rooms', rooms.length ? `<ul class="list">${rooms.map((r) => `<li><a href="#/admin/lms/${esc(r.code)}"><strong>${esc(r.code)}</strong> ${esc(r.name)}</a><span class="tag ${r.status === 'live' ? 'tag-live' : ''}">${esc(r.status)}</span><small>${r.is_public ? 'public' : 'code only'} · ${esc(fmtTime(r.created_at))}</small></li>`).join('')}</ul>` : '<p class="muted">No rooms yet.</p>')}
        ${box('Create a room as admin', `<form data-submit="adm.roomCreate">${LMS.rulesForm()}<button class="btn btn-gold">Create room</button><p class="muted small">Admin rooms have no moderator player. Start them from the room page here.</p></form>`)}
        <div id="lms-set">${box('Game settings', `<div class="set-grid">
          ${F('Game is open', 'lms.enabled', 'bool')}${F('Players can create rooms', 'lms.playersCanCreate', 'bool')}${F('Players can choose the rules', 'lms.playersCanSetRules', 'bool')}
          ${F('Most players in a room', 'lms.maxPlayers', 'number')}${F('Fewest players to start', 'lms.minPlayers', 'number')}${F('Seconds between chat messages', 'lms.chatGapSeconds', 'number')}</div>
          <h3 class="h4">Default rules for new rooms</h3><div class="set-grid">
          ${F('Lives each', 'lms.defaults.lives', 'number')}${F('Bad eggs (0 = automatic)', 'lms.defaults.bad_eggs', 'number')}${F('Automatic: 1 bad egg per … players', 'lms.defaults.bad_ratio', 'number')}
          ${F('Seconds between attacks', 'lms.defaults.cooldown', 'number')}${F('Winner points', 'lms.defaults.win_points', 'number')}${F('Points per elimination', 'lms.defaults.kill_points', 'number')}
          ${F('Points to a bad egg\'s team when someone backfires on them', 'lms.defaults.backfire_points', 'number')}
          ${F('Show who eliminated whom', 'lms.defaults.show_attacker', 'bool')}${F('Announce how many bad eggs', 'lms.defaults.show_bad_count', 'bool')}${F('Chat on', 'lms.defaults.chat', 'bool')}
          ${F('Eliminated players can still chat', 'lms.defaults.ghost_chat', 'bool')}${F('Players can join after the start', 'lms.defaults.late_join', 'bool')}${F('Show the bad eggs at the end', 'lms.defaults.reveal_roles_at_end', 'bool')}</div>
          <p class="muted small">Current defaults: ${esc(LMS.rulesLine(d))}</p>${saveBtn()}`)}</div>`;
    },
    mounted(params) {
      if (!params[0]) return;
      const code = params[0];
      Poll.every('adminRoom', () => 3, async () => {
        const v = await DB.admin.roomView(code); const el = $('#room-mon'); if (!el) return Poll.stop('adminRoom');
        const r = v.room;
        el.innerHTML = `${box(`${r.code} · ${r.name}`, `<p>Status <span class="tag ${r.status === 'live' ? 'tag-live' : ''}">${esc(r.status)}</span> · Round ${r.round} · ${v.players.length}/${r.max_players} players · ${esc(LMS.rulesLine(r.rules))}</p>
            <div class="btn-row">${r.status === 'lobby' || r.status === 'ended' ? `<button class="btn btn-gold" data-act="adm.roomDo" data-code="${esc(r.code)}" data-do="start">Start ${r.status === 'ended' ? 'a new round' : 'the game'}</button>` : ''}
            ${r.status === 'live' ? `<button class="btn" data-act="adm.roomDo" data-code="${esc(r.code)}" data-do="end">End round</button>` : ''}
            ${r.status === 'ended' ? `<button class="btn" data-act="adm.roomDo" data-code="${esc(r.code)}" data-do="again">Back to lobby</button>` : ''}
            ${r.status !== 'closed' ? `<button class="btn btn-ghost" data-act="adm.roomDo" data-code="${esc(r.code)}" data-do="close">Close room</button>` : ''}</div>`)}
          ${box('Players (secret roles visible to admins only)', `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Team</th><th>Role</th><th>Lives</th><th>Status</th><th>Kills</th><th></th></tr></thead><tbody>
            ${v.players.map((p) => { const t = App.team(p.team_id); return `<tr><td>${esc(p.name)}</td><td>${esc(t ? t.name : '')}</td><td>${p.role === 'bad' ? '<span class="tag tag-bad">bad egg</span>' : 'player'}</td><td>${p.role === 'bad' ? '∞' : p.lives}</td><td>${p.alive ? 'in' : 'out'}</td><td>${p.kills}</td>
              <td><button class="btn small btn-ghost" data-act="adm.roomKick" data-room="${r.id}" data-id="${p.id}">Remove</button></td></tr>`; }).join('')}</tbody></table></div>`)}
          ${box('Room feed', `<ul class="log">${v.events.map((e) => `<li><small class="muted">${esc(fmtTime(e.at))}</small> ${esc(e.body)}</li>`).join('')}</ul>`)}`;
      });
    },
  },

  // ─── TREASURE HUNT ───────────────────────────────────────────────────────
  hunt: {
    label: 'Treasure hunt',
    intro: 'Set up stations, build each team\'s route, print the QR codes, then start the hunt and watch the race.',
    async render() {
      const [stations, progress, state] = await Promise.all([DB.table('hh_hunt_stations').list('sort'), DB.table('hh_hunt_progress').list('team_id'), DB.table('hh_state').list('key')]);
      AdminApp.cache.stations = stations;
      const hs = (state.find((s) => s.key === 'hunt') || {}).value || {};
      const sname = Object.fromEntries(stations.map((s) => [s.id, s.name]));
      return `${box('Run the hunt', `<p>Status: <strong>${esc(hs.status || 'off')}</strong>${hs.starts_at ? ` · starts ${esc(fmtTime(hs.starts_at))}` : ''}${hs.ends_at ? ` · ends ${esc(fmtTime(hs.ends_at))}` : ''}</p>
          <form class="inline-form" data-submit="adm.huntStart"><div class="field"><label class="field-label" for="h-delay">Start in (seconds)</label><input class="input short" id="h-delay" name="delay" type="number" min="0" value="10"/></div>
          <div class="field"><label class="field-label" for="h-min">Time limit (minutes, 0 = none)</label><input class="input short" id="h-min" name="minutes" type="number" min="0" value="45"/></div><button class="btn btn-gold">Start the hunt</button></form>
          <div class="btn-row"><button class="btn" data-act="adm.huntState" data-s="off">Pause (hide clues)</button><button class="btn" data-act="adm.huntState" data-s="ended">End the hunt</button></div>`)}
        ${box('Team progress and routes', `<div class="btn-row"><button class="btn" data-act="adm.routes" data-mode="rotate">Build routes: each team starts at a different station</button><button class="btn" data-act="adm.routes" data-mode="shuffle">Build routes: random order</button></div>
          <p class="muted small">Building routes resets every team's progress. Final stations always come last; decoys are never on a route.</p>
          <div class="table-wrap"><table class="table"><thead><tr><th>Team</th><th>Route</th><th>Done</th><th>Now</th><th>Hints</th><th></th></tr></thead><tbody>
          ${App.teams.map((t) => { const p = progress.find((x) => x.team_id === t.id) || { route: [], step: 0, stage: 'find', hints_used: 0 }; return `<tr><td><span class="dot" style="background:${esc(t.color)}"></span> ${esc(t.name)}</td>
            <td><small>${(p.route || []).map((id, i) => `<span class="${i < p.step ? 'muted' : i === p.step ? 'strong' : ''}">${esc(sname[id] || '#' + id)}</span>`).join(' → ') || '—'}</small><br><button class="link small" data-act="adm.routeEdit" data-team="${t.id}" data-route="${esc((p.route || []).join(','))}">Edit route</button></td>
            <td>${p.step}/${(p.route || []).length}${p.place ? ' · ' + ordinal(p.place) : ''}</td><td>${esc(p.stage)}${p.frozen_until && Date.parse(p.frozen_until) > Date.now() ? ' <span class="tag">frozen</span>' : ''}</td><td>${p.hints_used}</td>
            <td class="nowrap">${p.stage === 'waiting' ? `<button class="btn small btn-gold" data-act="adm.huntAdvance" data-team="${t.id}">Approve task</button>` : `<button class="btn small btn-ghost" data-act="adm.huntAdvance" data-team="${t.id}">Skip station</button>`}
            ${p.frozen_until ? `<button class="btn small btn-ghost" data-act="adm.unfreeze" data-team="${t.id}">Unfreeze</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`)}
        ${box('Stations', `<p class="muted small">Answers: separate accepted answers with | (e.g. <code>nephron | nephrons</code>). Check mode: <strong>text</strong> = the team types the answer; <strong>none</strong> = scanning is enough; <strong>admin</strong> = an admin approves a task.</p>
          ${stations.map((s, i) => `<form class="row-form" data-submit="adm.stationSave" data-id="${s.id}">
            <div class="card-head"><strong>#${s.id} ${esc(s.name)}</strong><span class="code">Code: ${esc(s.short_code)}</span></div>
            <div class="grid3"><div class="field"><label class="field-label">Name (seen after scanning)</label><input class="input" name="name" value="${esc(s.name)}"/></div>
            <div class="field"><label class="field-label">Where it is (admins only)</label><input class="input" name="place" value="${esc(s.place)}"/></div>
            <div class="field"><label class="field-label">Check mode</label><select class="input" name="check_mode">${['text', 'none', 'admin'].map((m) => `<option ${s.check_mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
            <div class="field"><label class="field-label">Clue that leads to this station</label><textarea class="input" name="clue" rows="2">${esc(s.clue)}</textarea></div>
            <div class="grid2"><div class="field"><label class="field-label">Challenge after scanning</label><textarea class="input" name="challenge" rows="2">${esc(s.challenge)}</textarea></div>
            <div class="field"><label class="field-label">Accepted answers</label><input class="input" name="answer" value="${esc(s.answer)}"/><label class="field-label">Hint</label><input class="input" name="hint" value="${esc(s.hint)}"/></div></div>
            <div class="btn-row"><label class="switch"><input type="checkbox" name="is_final" ${s.is_final ? 'checked' : ''}/> Final station</label><label class="switch"><input type="checkbox" name="is_decoy" ${s.is_decoy ? 'checked' : ''}/> Decoy</label><label class="switch"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}/> Active</label><span class="grow"></span>
            <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_hunt_stations" data-id="${s.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn small btn-ghost" data-act="adm.move" data-table="hh_hunt_stations" data-id="${s.id}" data-dir="1" ${i === stations.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn small btn-ghost" data-act="adm.del" data-table="hh_hunt_stations" data-id="${s.id}">Delete</button><button class="btn small btn-primary">Save</button></div></form>`).join('')}
          <div class="btn-row"><button class="btn btn-gold" data-act="adm.stationAdd">+ Add a station</button><button class="btn" data-act="adm.qrSheet">Print QR codes</button></div>`)}
        ${box('Hunt settings', `<div class="set-grid">${F('Hunt shown in the app', 'hunt.enabled', 'bool')}${F('In-app camera scanner', 'hunt.cameraScan', 'bool')}${F('Points by finishing place', 'hunt.placePoints', 'numlist', '1st, 2nd, 3rd, 4th')}
          ${F('Hint cost (points)', 'hunt.hintCost', 'number')}${F('Decoy freeze (seconds)', 'hunt.decoyFreezeSeconds', 'number')}${F('Points per station completed', 'hunt.stationPoints', 'number')}</div>${saveBtn()}`)}`;
    },
  },

  // ─── PAGES & TILES ───────────────────────────────────────────────────────
  pages: {
    label: 'Pages & home tiles',
    render() {
      const tiles = SET.get('tiles'), pages = SET.get('pages');
      return `${box('Home screen tiles', `<p class="muted small">Untick to hide a tile (and its tab). Order here is the order on the home screen.</p>
          ${tiles.map((t, i) => `<div class="row-form grid3" data-tile="${i}"><label class="switch"><input type="checkbox" data-path="tiles.${i}.show" data-kind="bool" ${t.show ? 'checked' : ''}/> ${esc(t.id)}</label>
            <div class="field"><label class="field-label">Label</label><input class="input" data-path="tiles.${i}.label" data-kind="text" value="${esc(t.label)}"/></div>
            <div class="field"><label class="field-label">Small line</label><input class="input" data-path="tiles.${i}.blurb" data-kind="text" value="${esc(t.blurb)}"/></div>
            <div class="btn-row"><button class="btn small btn-ghost" data-act="adm.tileMove" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn small btn-ghost" data-act="adm.tileMove" data-i="${i}" data-dir="1" ${i === tiles.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('')}${saveBtn()}`)}
        ${box('Info pages (shown in the menu)', `<p class="muted small">Formatting: **bold**, and start a line with "- " for a bullet.</p>
          ${pages.map((p, i) => `<div class="row-form"><div class="grid2"><div class="field"><label class="field-label">Title</label><input class="input" data-path="pages.${i}.title" data-kind="text" value="${esc(p.title)}"/></div>
            <label class="switch"><input type="checkbox" data-path="pages.${i}.show" data-kind="bool" ${p.show !== false ? 'checked' : ''}/> Show in the menu</label></div>
            <div class="field"><label class="field-label">Text</label><textarea class="input" rows="6" data-path="pages.${i}.body" data-kind="text">${esc(p.body)}</textarea></div>
            <div class="btn-row"><button class="btn small btn-ghost" data-act="adm.pageDel" data-i="${i}">Delete page</button></div></div>`).join('')}
          <div class="btn-row"><button class="btn btn-gold" data-act="adm.pageAdd">+ Add a page</button><button class="btn btn-primary" data-act="adm.saveSettings">Save changes</button></div>`)}`;
    },
  },

  // ─── APPEARANCE ──────────────────────────────────────────────────────────
  appearance: {
    label: 'Appearance',
    render() {
      return `${box('Event details', `<div class="set-grid">${F('Event name', 'app.name')}${F('Tagline (the ribbon)', 'app.tagline')}${F('Presented by line', 'app.presenter')}${F('Venue', 'app.venue')}${F('Date line', 'app.dateText')}${F('Footer', 'app.footer')}</div>`)}
        ${box('Wordmark and colours', `<div class="preview-sky">${Brand.wordmark()}</div><div class="set-grid">
          ${F('Wordmark top line', 'appearance.wordTop')}${F('Wordmark bottom line', 'appearance.wordBottom')}
          ${F('Sky (background)', 'appearance.sky', 'color')}${F('Deep sky', 'appearance.skyDeep', 'color')}${F('Gold', 'appearance.gold', 'color')}${F('Outline brown', 'appearance.outline', 'color')}${F('Coral (ribbon, alerts)', 'appearance.coral', 'color')}
          ${F('Colour each player\'s screen with their team colour', 'appearance.teamTheme', 'bool')}${F('Confetti at the reveal', 'appearance.confetti', 'bool')}</div>`)}
        ${box('Fonts and logos', `<div class="set-grid">${F('Display font (Google Fonts name)', 'appearance.displayFont', 'text', 'e.g. Lilita One, Luckiest Guy, Bowlby One')}${F('Body font (Google Fonts name)', 'appearance.bodyFont', 'text', 'e.g. Fredoka, Nunito')}
          ${F('Your own font stylesheet (optional)', 'appearance.fontCssUrl', 'text', 'e.g. assets/fonts.css, if you uploaded the flyer fonts. Replaces Google Fonts.')}
          ${F('Logo images (one link per line)', 'appearance.logos', 'textlist', 'e.g. assets/valentis.png and assets/altius.png after uploading them to GitHub.')}</div>`)}
        ${box('Custom CSS (advanced)', F('Extra CSS applied to every page', 'appearance.customCss', 'long', 'For anything the fields above cannot do.'))}
        ${saveBtn()}`;
    },
  },

  // ─── TEXT ────────────────────────────────────────────────────────────────
  text: {
    label: 'Text & wording',
    intro: 'Every piece of wording in the app. Words in {curly brackets} are filled in automatically; keep them.',
    render() {
      return box('All text', `<input class="input" placeholder="Search" data-filter=".text-grid .field"/><div class="set-grid text-grid">${Object.keys(DEFAULT_SETTINGS.text).map((k) => F(human(k), 'text.' + k, DEFAULT_SETTINGS.text[k].length > 70 ? 'long' : 'text')).join('')}</div>${saveBtn()}`);
    },
  },

  // ─── ADMINS ──────────────────────────────────────────────────────────────
  admins: {
    label: 'Admins',
    async render() {
      const list = await DB.table('hh_admins').list('added_at');
      const me = AdminApp.session.user.id;
      return `${box(`Admins (${list.length} of ${Settings.get().admins.max})`, `<ul class="list">${list.map((a) => `<li><span class="grow">${esc(a.email)}${a.user_id === me ? ' <small class="muted">(you)</small>' : ''}</span><small>${esc(fmtTime(a.added_at))}</small>${a.user_id !== me ? `<button class="btn small btn-ghost" data-act="adm.adminDel" data-id="${a.user_id}" data-email="${esc(a.email)}">Remove</button>` : ''}</li>`).join('')}</ul>
          <form class="inline-form" data-submit="adm.adminAdd"><label class="sr" for="ad-email">Email</label><input class="input" id="ad-email" name="email" type="email" placeholder="their@email.com"/><button class="btn btn-primary">Add admin</button></form>
          <p class="muted small">They must first open the site, tap Admin, and create an account with that email. The limit is set in Settings.</p>`)}
        ${box('Your account', `<button class="btn" data-act="adm.password">Change my password</button>`)}`;
    },
  },

  // ─── SETTINGS ────────────────────────────────────────────────────────────
  settings: {
    label: 'Settings',
    render() {
      return `${box('Sign-in', `<div class="set-grid">${F('PIN length (digits)', 'signin.pinLength', 'number')}${F('New players can join', 'signin.allowNew', 'bool')}${F('Wrong PINs before a lock', 'signin.maxTries', 'number')}${F('Lock length (minutes)', 'signin.lockMinutes', 'number')}</div>`)}
        ${box('Scoreboard and reveal', `<div class="set-grid">${F('Recent points shown', 'scoreboard.feedCount', 'number')}${F('Show the individual (MVP) leaderboard', 'scoreboard.showIndividuals', 'bool')}${F('People on that leaderboard', 'scoreboard.individualCount', 'number')}
          ${F('When frozen, show the last totals (off = hide them)', 'scoreboard.showSnapshotWhenFrozen', 'bool')}${F('Reveal countdown (seconds)', 'reveal.defaultSeconds', 'number')}${F('Seconds between places in the reveal', 'reveal.stepSeconds', 'number')}${F('Show MVP at the reveal', 'reveal.showMvp', 'bool')}
          ${F('Quick point buttons', 'adminUi.quickPoints', 'numlist', 'e.g. 5, 10, 20, 50')}</div>`)}
        ${box('How often phones check for updates (seconds)', `<div class="set-grid">${F('Home, scores, schedule', 'poll.home', 'number')}${F('Inside a game room', 'poll.room', 'number')}${F('Treasure hunt', 'poll.hunt', 'number')}${F('Admin overview', 'poll.admin', 'number')}</div>
          <p class="muted small">Lower is faster but uses more of the free database. The defaults are safe for 150 people.</p>`)}
        ${box('Admins', `<div class="set-grid">${F('Most admins allowed', 'admins.max', 'number')}</div>`)}
        ${saveBtn()}
        ${box('Advanced: all settings as JSON', `<p class="muted small">Every setting, including ones without a field above. Edit carefully; it is checked before saving.</p>
          <textarea class="input mono" id="json-set" rows="16">${esc(JSON.stringify(Settings.get(), null, 2))}</textarea>
          <div class="btn-row"><button class="btn btn-primary" data-act="adm.jsonSave">Save JSON</button><button class="btn btn-ghost" data-act="adm.jsonReset">Reset everything to defaults</button></div>`)}`;
    },
  },

  // ─── DANGER ZONE ─────────────────────────────────────────────────────────
  danger: {
    label: 'Danger zone',
    intro: 'For clearing test data before the event. These cannot be undone.',
    render() {
      const items = [['points', 'Delete all points', 'Every team and player goes back to 0.'], ['rooms', 'Delete all game rooms', 'Ends every Last Man Standing room.'],
        ['hunt', 'Reset hunt progress', 'Teams keep their routes but start again.'], ['announcements', 'Delete all announcements', ''], ['players', 'Delete all players', 'Everyone has to sign up again.']];
      return box('Reset', `<ul class="list">${items.map(([k, l, d]) => `<li><span class="grow"><strong>${esc(l)}</strong><br><small class="muted">${esc(d)}</small></span><button class="btn small btn-coral" data-act="adm.reset" data-what="${k}" data-label="${esc(l)}">${esc(l)}</button></li>`).join('')}</ul>`);
    },
  },
};

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ACTIONS
// ════════════════════════════════════════════════════════════════════════════
const formRow = (form, fields) => Object.fromEntries(fields.map((f) => {
  const el = form.elements[f]; if (!el) return [f, undefined];
  return [f, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value];
}));
const adminDone = (msg = 'Saved.') => { toast(msg, 'good'); AdminApp.redraw(); };
const refreshTeams = async () => { App.teams = await DB.pub.teams(); LS.set('hh:teams', App.teams); };

Object.assign(ACTIONS, {
  'adm.menu': () => $('#admin-nav').classList.toggle('open'),
  'adm.logout': async () => { await DB.auth.signOut(); AdminApp.isAdmin = false; AdminApp.session = null; AdminApp.loginScreen(); },
  'adm.signup': async () => {
    const f = $('form[data-submit="adm.login"]'); const email = f.email.value.trim(), password = f.password.value;
    if (!email || password.length < 6) return toast('Type an email and a password of at least 6 characters, then tap this again.', 'error', 5000);
    guard(null, async () => {
      const r = await DB.auth.signUp(email, password);
      if (r.session) { toast('Account created.', 'good'); AdminApp.open([]); } else toast('Check your email to confirm the account, then sign in.', 'good', 7000);
    });
  },
  'adm.forgot': async () => {
    const email = $('form[data-submit="adm.login"]').email.value.trim() || (await promptBox('Your email'));
    if (email) guard(null, async () => { await DB.auth.resetPassword(email); toast('If that email has an account, a reset link is on its way.', 'good', 6000); });
  },
  'adm.password': () => AdminApp.askNewPassword(),
  'adm.saveSettings': (el) => guard(el, async () => { await SET.save($('#admin-main')); AdminApp.redraw(); }),

  // Scores
  'adm.quick': (el) => guard(el, async () => {
    const n = Number(el.dataset.n), t = App.team(Number(el.dataset.team));
    await DB.table('hh_points').insert({ team_id: t.id, amount: n, reason: 'Quick points' });
    adminDone(`${n > 0 ? '+' : ''}${n} to ${t.name}`);
  }),
  'adm.undo': (el) => guard(el, async () => {
    const [p] = await DB.table('hh_points').list('id', true, (q) => q.eq('id', Number(el.dataset.id)));
    if (!p) return;
    if (!(await confirmBox(`Undo ${p.amount > 0 ? '+' : ''}${p.amount} for ${(App.team(p.team_id) || {}).name}?`, 'Undo'))) return;
    await DB.table('hh_points').insert({ team_id: p.team_id, player_id: p.player_id, amount: -p.amount, reason: 'Undo: ' + (p.reason || ''), game: p.game, undo_of: p.id });
    adminDone('Undone.');
  }),
  'adm.freeze': (el) => guard(el, async () => { await DB.admin.freeze(el.dataset.on === '1'); adminDone(el.dataset.on === '1' ? 'Board frozen.' : 'Board is live again.'); }),

  // Activity, games, generic
  'adm.actAdd': (el) => guard(el, async () => { await DB.table('hh_activities').insert({ title: 'New item', sort: Date.now() % 1e6, visible: false }); adminDone('Added (hidden until you tick Visible).'); }),
  'adm.annToggle': (el) => guard(el, async () => { await DB.table('hh_announcements').update({ id: Number(el.dataset.id) }, { visible: el.dataset.v === '1' }); adminDone(); }),
  'adm.gameAdd': (el) => guard(el, async () => { await DB.table('hh_games').insert({ name: 'New game', sort: Date.now() % 1e6 }); adminDone('Game added.'); }),
  'adm.del': async (el) => {
    if (!(await confirmBox(el.dataset.confirm || 'Delete this for good?', 'Delete'))) return;
    const id = el.dataset.table === 'hh_players' ? el.dataset.id : Number(el.dataset.id);
    guard(el, async () => { await DB.table(el.dataset.table).remove({ id }); adminDone('Deleted.'); });
  },
  'adm.move': (el) => guard(el, async () => {
    const tbl = el.dataset.table, rows = await DB.table(tbl).list('sort');
    rows.sort((a, b) => a.sort - b.sort || a.id - b.id);
    const i = rows.findIndex((r) => r.id === Number(el.dataset.id)), j = i + Number(el.dataset.dir);
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    await Promise.all(rows.map((r, k) => (r.sort !== k + 1 ? DB.table(tbl).update({ id: r.id }, { sort: k + 1 }) : null)));
    AdminApp.redraw();
  }),

  // Teams
  'adm.teamAdd': (el) => guard(el, async () => { await DB.table('hh_teams').insert({ name: 'New team', color: '#F59E0B', sort: App.teams.length + 1 }); await refreshTeams(); adminDone('Team added.'); }),
  'adm.teamDel': async (el) => {
    if (!(await confirmBox('Delete this team? Its points are deleted too, and its players lose their team. Untick "Active" instead to just hide it.', 'Delete team'))) return;
    guard(el, async () => { await DB.table('hh_teams').remove({ id: Number(el.dataset.id) }); await refreshTeams(); adminDone('Team deleted.'); });
  },

  // Players
  'adm.pin': async (el) => {
    const pin = await promptBox(`New PIN for ${el.dataset.name} (${Settings.get().signin.pinLength} digits)`, { type: 'text' });
    if (pin) guard(null, async () => { await DB.admin.resetPin(el.dataset.id, pin.trim()); toast(`PIN changed. Tell ${el.dataset.name} their new PIN.`, 'good', 5000); });
  },
  'adm.award': async (el) => {
    const v = await promptBox(`Points for ${el.dataset.name} (counts for their team too)`, { type: 'number' });
    if (!v) return;
    const reason = (await promptBox('Reason (optional)', { okLabel: 'Add' })) || 'Individual award';
    guard(null, async () => { await DB.table('hh_points').insert({ team_id: Number(el.dataset.team), player_id: el.dataset.id, amount: Number(v), reason }); adminDone('Points added.'); });
  },

  // LMS
  'adm.roomDo': (el) => guard(el, async () => {
    const code = el.dataset.code, what = el.dataset.do;
    if (what === 'start') await DB.admin.roomStart(code); else await DB.admin.roomControl(code, what);
    toast('Done.', 'good');
  }),
  'adm.roomKick': async (el) => {
    if (!(await confirmBox('Remove this player from the room?', 'Remove'))) return;
    guard(el, async () => { await DB.table('hh_room_players').remove({ room_id: Number(el.dataset.room), player_id: el.dataset.id }); toast('Removed.', 'good'); });
  },

  // Hunt
  'adm.huntState': (el) => guard(el, async () => { await DB.admin.huntState(el.dataset.s, 0, 0); adminDone('Hunt ' + el.dataset.s + '.'); }),
  'adm.routes': async (el) => {
    if (!(await confirmBox('Build new routes? Every team\'s hunt progress resets.', 'Build routes'))) return;
    guard(el, async () => { await DB.admin.huntRoutes(el.dataset.mode); adminDone('Routes built.'); });
  },
  'adm.routeEdit': async (el) => {
    const names = (AdminApp.cache.stations || []).map((s) => `#${s.id} ${s.name}`).join(', ');
    const v = await promptBox(`Station numbers in order, separated by commas. Stations: ${names}`, { value: el.dataset.route });
    if (v == null) return;
    const route = v.split(',').map((x) => Number(x.replace('#', '').trim())).filter((x) => x > 0);
    guard(null, async () => {
      const exists = await DB.table('hh_hunt_progress').list('team_id', true, (q) => q.eq('team_id', Number(el.dataset.team)));
      if (exists.length) await DB.table('hh_hunt_progress').update({ team_id: Number(el.dataset.team) }, { route, step: 0, stage: 'find', finished_at: null, place: null });
      else await DB.table('hh_hunt_progress').insert({ team_id: Number(el.dataset.team), route });
      adminDone('Route saved. That team starts from the beginning.');
    });
  },
  'adm.huntAdvance': (el) => guard(el, async () => { const m = await DB.admin.huntAdvance(Number(el.dataset.team)); adminDone(m); }),
  'adm.unfreeze': (el) => guard(el, async () => { await DB.table('hh_hunt_progress').update({ team_id: Number(el.dataset.team) }, { frozen_until: null }); adminDone('Unfrozen.'); }),
  'adm.stationAdd': (el) => guard(el, async () => { await DB.table('hh_hunt_stations').insert({ name: 'New station', sort: Date.now() % 1e6 }); adminDone('Station added.'); }),
  'adm.qrSheet': (el) => guard(el, async () => {
    if (!window.QRCode) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the QR maker.')); document.head.appendChild(s); });
    const stations = (await DB.table('hh_hunt_stations').list('sort')).filter((s) => s.active);
    const base = location.origin + location.pathname;
    const area = $('#print-area');
    area.innerHTML = `<div class="print-bar"><button class="btn btn-primary" onclick="window.print()">Print</button><button class="btn btn-ghost" onclick="document.body.classList.remove('printing')">Close</button><span>One code per station. Stick each at its place. The number in the corner is for admins.</span></div>
      <div class="qr-grid">${stations.map((s) => `<div class="qr-card"><div class="qr" id="qr-${s.id}"></div><strong>${esc(Settings.get().app.name)}</strong><span>Scan me or type <b>${esc(s.short_code)}</b></span><small>#${s.id}${s.is_decoy ? ' · D' : ''}</small></div>`).join('')}</div>`;
    stations.forEach((s) => new QRCode(document.getElementById('qr-' + s.id), { text: `${base}?s=${s.qr_token}`, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }));
    document.body.classList.add('printing');
  }),

  // Pages and tiles
  'adm.tileMove': (el) => { SET.collect($('#admin-main')); const t = SET.draft.tiles, i = Number(el.dataset.i), j = i + Number(el.dataset.dir); [t[i], t[j]] = [t[j], t[i]]; $('#admin-main').innerHTML = `<h1 class="h1">${esc(ADMIN.pages.label)}</h1>` + ADMIN.pages.render(); toast('Moved. Save to keep it.'); },
  'adm.pageAdd': () => { SET.collect($('#admin-main')); SET.draft.pages.push({ id: 'p' + Date.now().toString(36), title: 'New page', show: true, body: '' }); $('#admin-main').innerHTML = `<h1 class="h1">${esc(ADMIN.pages.label)}</h1>` + ADMIN.pages.render(); },
  'adm.pageDel': (el) => { SET.collect($('#admin-main')); SET.draft.pages.splice(Number(el.dataset.i), 1); $('#admin-main').innerHTML = `<h1 class="h1">${esc(ADMIN.pages.label)}</h1>` + ADMIN.pages.render(); toast('Removed. Save to keep it.'); },

  // Admins
  'adm.adminDel': async (el) => {
    if (!(await confirmBox(`Remove ${el.dataset.email} as an admin?`, 'Remove'))) return;
    guard(el, async () => { await DB.admin.removeAdmin(el.dataset.id); adminDone('Removed.'); });
  },

  // Settings JSON
  'adm.jsonSave': (el) => guard(el, async () => {
    let v; try { v = JSON.parse($('#json-set').value); } catch (e) { throw new Error('That is not valid JSON: ' + e.message); }
    SET.draft = v; await SET.save(null); AdminApp.redraw();
  }),
  'adm.jsonReset': async (el) => {
    if (!(await confirmBox('Reset every setting (text, colours, rules) to the original defaults?', 'Reset'))) return;
    guard(el, async () => { SET.draft = clone(DEFAULT_SETTINGS); await SET.save(null, 'Settings reset to defaults.'); AdminApp.redraw(); });
  },

  // Danger
  'adm.reset': async (el) => {
    const word = await promptBox(`Type RESET to confirm: ${el.dataset.label}`, { okLabel: 'Confirm' });
    if (word !== 'RESET') return word != null && toast('Not reset.', 'info');
    guard(el, async () => { await DB.admin.reset(el.dataset.what); adminDone('Done.'); });
  },
});

Object.assign(SUBMITS, {
  'adm.login': (form, btn) => guard(btn, async () => {
    await DB.auth.signIn(form.email.value.trim(), form.password.value);
    AdminApp.open((location.hash.replace(/^#\/?admin\/?/, '') || '').split('/').filter(Boolean));
  }),
  'adm.result': (form, btn) => guard(btn, async () => {
    const game = AdminApp.cache.games.find((g) => g.id === Number(form.game.value));
    const rows = $$('.place-row', form).map((r) => ({ team: Number($('select', r).value), amount: Number($('input', r).value), place: r.dataset.place })).filter((r) => r.team && r.amount);
    if (!rows.length) return toast('Pick at least one team.', 'error');
    for (const r of rows) await DB.table('hh_points').insert({ team_id: r.team, amount: r.amount, game: game.name, reason: ordinal(Number(r.place)) + ' place' });
    adminDone(`${game.name} result saved.`);
  }),
  'adm.custom': (form, btn) => guard(btn, async () => {
    const amount = Number(form.amount.value); if (!amount) return toast('Type the points.', 'error');
    let team = Number(form.team.value), player = null;
    const name = form.player.value.trim().toLowerCase();
    if (name) { const p = (AdminApp.cache.players || []).find((x) => x.name.toLowerCase() === name); if (!p) return toast('No player with that exact name.', 'error'); player = p.id; team = p.team_id; }
    await DB.table('hh_points').insert({ team_id: team, player_id: player, amount, game: form.game.value.trim(), reason: form.reason.value.trim() });
    adminDone('Points added.');
  }),
  'adm.reveal': (form, btn) => guard(btn, async () => {
    const secs = Number(form.secs.value) || 10;
    if (!(await confirmBox(`Start the winner reveal? Every phone counts down from ${secs} and then shows the winner.`, 'Start reveal'))) return;
    await DB.admin.reveal(secs); adminDone('Reveal started.');
  }),
  'adm.actSave': (form, btn) => guard(btn, async () => { await DB.table('hh_activities').update({ id: Number(form.dataset.id) }, formRow(form, ['title', 'time_label', 'status', 'details', 'visible'])); toast('Saved.', 'good'); }),
  'adm.annPost': (form, btn) => guard(btn, async () => { const b = form.body.value.trim(); if (!b) return; await DB.table('hh_announcements').insert({ body: b }); adminDone('Posted.'); }),
  'adm.gameSave': (form, btn) => guard(btn, async () => {
    const row = formRow(form, ['name', 'description', 'active']);
    row.points = form.points.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
    await DB.table('hh_games').update({ id: Number(form.dataset.id) }, row); toast('Saved.', 'good');
  }),
  'adm.teamSave': (form, btn) => guard(btn, async () => { await DB.table('hh_teams').update({ id: Number(form.dataset.id) }, formRow(form, ['name', 'color', 'motto', 'sort', 'active'])); await refreshTeams(); adminDone('Team saved.'); }),
  'adm.roomCreate': (form, btn) => guard(btn, async () => {
    const r = await DB.admin.roomCreate(form.name.value, form.is_public.checked, Number(form.max.value), LMS.readRules(form));
    location.hash = '#/admin/lms/' + r.code;
  }),
  'adm.huntStart': (form, btn) => guard(btn, async () => { await DB.admin.huntState('live', Number(form.delay.value), Number(form.minutes.value)); adminDone('Hunt started.'); }),
  'adm.stationSave': (form, btn) => guard(btn, async () => { await DB.table('hh_hunt_stations').update({ id: Number(form.dataset.id) }, formRow(form, ['name', 'place', 'check_mode', 'clue', 'challenge', 'answer', 'hint', 'is_final', 'is_decoy', 'active'])); toast('Saved.', 'good'); }),
  'adm.adminAdd': (form, btn) => guard(btn, async () => { await DB.admin.addAdmin(form.email.value.trim()); adminDone('Admin added.'); }),
});

Object.assign(CHANGES, {
  'adm.resultGame': (el) => {
    if (!el) return;
    const g = AdminApp.cache.games.find((x) => x.id === Number(el.value)); const pts = (g && g.points) || [];
    $('#res-places').innerHTML = pts.map((p, i) => `<div class="place-row grid2" data-place="${i + 1}"><div class="field"><label class="field-label">${ordinal(i + 1)} place</label>${teamSelect('t' + i, null, true)}</div>
      <div class="field"><label class="field-label">Points</label><input class="input" type="number" value="${p}"/></div></div>`).join('') || '<p class="muted">This game has no points set. Add them in Games.</p>';
  },
  'adm.playerTeam': (el) => guard(null, async () => { await DB.table('hh_players').update({ id: el.dataset.id }, { team_id: Number(el.value) }); toast('Team changed.', 'good'); }),
});

// Live search boxes: <input data-filter="selector"> hides rows that do not match
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-filter]'); if (!el) return;
  const q = el.value.trim().toLowerCase();
  $$(el.dataset.filter).forEach((row) => { row.hidden = q && !(row.dataset.text || row.textContent).toLowerCase().includes(q); });
});
