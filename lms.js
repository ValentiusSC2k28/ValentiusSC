/**
 * lms.js — Last Man Standing: room list, room lobby, the game, chat, results.
 * All the rules run in the database (setup.sql → hh_room_*). This file only
 * shows things and sends taps.
 */

const LMS = {
  code: null, data: null, events: [], chat: [], lastEv: 0, lastChat: 0, selected: null,
  tab: 'feed', showRole: false, lastStatus: null, tick: null,

  reset() {
    Object.assign(this, { code: null, data: null, events: [], chat: [], lastEv: 0, lastChat: 0, selected: null, tab: 'feed', showRole: false, lastStatus: null });
    clearInterval(this.tick); this.tick = null;
  },
  rulesForm(r) {
    const s = Settings.get().lms;
    const d = { ...s.defaults, ...(r || {}) };
    return `<div class="field"><label class="field-label" for="r-name">Room name</label><input class="input" id="r-name" name="name" maxlength="40" value="Last Man Standing"/></div>
      <div class="grid2">
        <div class="field"><label class="field-label" for="r-max">Max players</label><input class="input" id="r-max" name="max" type="number" min="3" max="${s.maxPlayers}" value="${Math.min(30, s.maxPlayers)}"/></div>
        <div class="field"><label class="field-label" for="r-lives">Lives each</label><input class="input" id="r-lives" name="lives" type="number" min="1" max="20" value="${d.lives}"/></div>
        <div class="field"><label class="field-label" for="r-bad">Bad eggs <small class="muted">(0 = automatic)</small></label><input class="input" id="r-bad" name="bad_eggs" type="number" min="0" max="20" value="${d.bad_eggs}"/></div>
        <div class="field"><label class="field-label" for="r-cd">Seconds between attacks</label><input class="input" id="r-cd" name="cooldown" type="number" min="0" max="300" value="${d.cooldown}"/></div>
      </div>
      <label class="switch"><input type="checkbox" name="is_public" checked/> Show this room in the public list</label>
      <label class="switch"><input type="checkbox" name="chat" ${d.chat ? 'checked' : ''}/> Group chat on</label>
      <label class="switch"><input type="checkbox" name="show_attacker" ${d.show_attacker ? 'checked' : ''}/> Show who eliminated whom</label>`;
  },
  readRules(form) {
    const n = (k) => Number(form[k].value);
    return { lives: n('lives'), bad_eggs: n('bad_eggs'), cooldown: n('cooldown'), chat: form.chat.checked, show_attacker: form.show_attacker.checked };
  },

  // ─── Room list ───────────────────────────────────────────────────────────
  listHtml() {
    const s = Settings.get();
    return `<h1 class="h1 page-title">${esc(T('lmsTitle'))}</h1>
      <section class="card"><p>${esc(T('lmsIntro'))}</p>
        <form class="inline-form" data-submit="lms.joinCode"><label class="sr" for="lms-code">${esc(T('lmsJoinCode'))}</label>
          <input class="input code-in" id="lms-code" name="code" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters"/>
          <button class="btn btn-primary">${esc(T('lmsJoinCode'))}</button></form>
        ${s.lms.playersCanCreate ? `<button class="btn btn-gold btn-block" data-act="lms.createOpen">${esc(T('lmsCreate'))}</button>` : ''}
      </section>
      <section id="lms-rooms"><div class="skeleton"></div></section>`;
  },
  async loadRooms() {
    const box = $('#lms-rooms'); if (!box) return;
    const rooms = await DB.lms.list(App.token);
    box.innerHTML = rooms.length ? rooms.map((r) => `<a class="card room-card" href="#/lms/${esc(r.code)}">
        <div class="grow"><strong>${esc(r.name)}</strong><br><small class="muted">${r.host ? 'Moderator: ' + esc(r.host) + ' · ' : ''}Code ${esc(r.code)}</small></div>
        <span class="tag ${r.status === 'live' ? 'tag-live' : ''}">${r.status === 'live' ? 'Playing' : 'Lobby'}</span>
        <span class="count">${r.count}/${r.max}</span></a>`).join('')
      : `<p class="muted center">${esc(T('lmsNoRooms'))}</p>`;
  },

  // ─── Inside a room ───────────────────────────────────────────────────────
  roomHtml() {
    return `<div class="room">
      <div id="lms-head"></div>
      <div id="lms-main"><div class="skeleton"></div></div>
      <div class="seg" role="tablist">
        <button class="seg-btn ${this.tab === 'feed' ? 'on' : ''}" data-act="lms.tab" data-tab="feed">Feed</button>
        <button class="seg-btn ${this.tab === 'chat' ? 'on' : ''}" data-act="lms.tab" data-tab="chat">Chat <span id="chat-badge" class="badge" hidden></span></button>
      </div>
      <section class="card log-card"><ul class="log" id="lms-feed" ${this.tab === 'feed' ? '' : 'hidden'}></ul>
        <div id="lms-chat-box" ${this.tab === 'chat' ? '' : 'hidden'}><ul class="log chat" id="lms-chat"></ul>
          <form class="chat-form" data-submit="lms.chat"><label class="sr" for="chat-in">Message</label><input class="input" id="chat-in" name="body" maxlength="300" autocomplete="off" placeholder="${esc(T('lmsChatPlaceholder'))}"/>
          <button class="icon-btn send" aria-label="Send">${ICON('send')}</button></form></div></section>
      <div class="btn-row"><a class="btn btn-ghost" href="#/lms">All rooms</a><button class="btn btn-ghost" data-act="lms.leave">Leave room</button></div>
    </div>`;
  },
  async poll() {
    if (!this.code) return;
    const d = await DB.lms.poll(App.token, this.code, this.lastEv, this.lastChat);
    App.offset = Date.parse(d.now) - Date.now();
    this.data = d;
    if (d.events.length) { this.events.push(...d.events); this.lastEv = d.events[d.events.length - 1].id; this.appendFeed(d.events); }
    if (d.chat.length) { this.chat.push(...d.chat); this.lastChat = d.chat[d.chat.length - 1].id; this.appendChat(d.chat); }
    if (this.lastStatus === 'lobby' && d.room.status === 'live' && d.me.in) { this.showRole = true; this.roleSplash(d.me); }
    if (d.room.status === 'live' && this.lastStatus && this.lastStatus !== 'live') this.selected = null;
    this.lastStatus = d.room.status;
    this.draw();
  },
  roleSplash(me) {
    const bad = me.role === 'bad';
    modal(`<div class="role-splash ${bad ? 'bad' : 'good'}"><p class="eyebrow">Round started</p><h2 class="h1">${esc(bad ? T('lmsRoleBad') : T('lmsRolePlayer'))}</h2>
      <p>${esc(bad ? T('lmsRoleBadNote') : T('lmsRolePlayerNote'))}</p><p class="muted small">Keep your screen hidden from others.</p>
      <button class="btn btn-primary btn-block" data-act="modal.close">Got it</button></div>`);
  },
  draw() {
    const d = this.data; if (!d || !$('#lms-head')) return;
    const r = d.room, me = d.me, status = r.status;
    const alive = d.players.filter((p) => p.alive).length;
    $('#lms-head').innerHTML = `<div class="room-head card">
      <div class="grow"><p class="eyebrow">${esc(T('lmsTitle'))} · Round ${r.round || 1}</p><h1 class="h2">${esc(r.name)}</h1>
      <small class="muted">Code <strong class="code">${esc(r.code)}</strong> · ${d.players.length}/${r.max} players${r.host ? ' · Moderator: ' + esc(r.host) : ''}</small></div>
      <span class="tag ${status === 'live' ? 'tag-live' : ''}">${status === 'live' ? alive + ' standing' : status === 'ended' ? 'Finished' : status === 'closed' ? 'Closed' : 'Lobby'}</span></div>`;
    let html = '';
    if (!me.in) {
      html = status === 'lobby' ? `<button class="btn btn-gold btn-block btn-big" data-act="lms.join">Join this room</button>` : `<p class="notice">You are watching. ${status === 'live' ? 'Join the next round when it returns to the lobby.' : ''}</p>`;
    } else if (status === 'lobby') {
      html = `<section class="card center"><p class="big-wait">${esc(T('lmsWaiting'))}</p>
        ${me.is_host ? `<p class="muted small">You are the moderator (you play too). Start when everyone is in.</p><button class="btn btn-gold btn-block btn-big" data-act="lms.start">Start the game (${d.players.length} players)</button>` : ''}
        <p class="muted small">${esc(this.rulesLine(r.rules))}</p></section>`;
    } else if (status === 'live') {
      html = this.roleCard(me) + this.targets(d);
    } else if (status === 'ended') {
      html = `<section class="card center win-card">${ICON('crown', 'ic big')}<h2 class="h2">${r.winner ? esc(r.winner) + ' wins!' : 'No winner this round'}</h2>
        ${d.players.some((p) => p.role) ? `<p class="muted small">Bad eggs this round: ${d.players.filter((p) => p.role === 'bad').map((p) => esc(p.name)).join(', ') || 'none'}</p>` : ''}
        ${me.is_host ? `<div class="btn-row center"><button class="btn btn-gold" data-act="lms.again">Play again</button><button class="btn btn-ghost" data-act="lms.close">Close room</button></div>` : '<p class="muted small">Waiting for the moderator: play again or close.</p>'}</section>`;
    } else { html = `<p class="notice">This room is closed. <a href="#/lms">See other rooms</a></p>`; }
    $('#lms-main').innerHTML = html;
    if (status === 'live' && me.in && me.is_host) $('#lms-main').insertAdjacentHTML('beforeend', '<div class="btn-row"><button class="btn btn-ghost small" data-act="lms.end">End round (no winner)</button></div>');
    this.tickCooldown();
  },
  rulesLine(rules) {
    if (!rules) return '';
    return `${rules.lives} lives each · ${rules.bad_eggs > 0 ? rules.bad_eggs + ' bad egg(s)' : 'bad eggs: automatic'}${rules.cooldown > 0 ? ' · ' + rules.cooldown + 's between attacks' : ''}${rules.chat ? ' · chat on' : ''}`;
  },
  roleCard(me) {
    const bad = me.role === 'bad';
    if (!this.showRole) return `<button class="card role-card hidden-role" data-act="lms.role">Tap to see your role and lives</button>`;
    return `<button class="card role-card ${bad ? 'bad' : 'good'}" data-act="lms.role">
      <strong>${esc(bad ? T('lmsRoleBad') : T('lmsRolePlayer'))}</strong>
      ${bad ? '<span>Unlimited lives</span>' : me.alive ? `<span class="hearts" aria-label="${me.lives} lives">${Array.from({ length: me.lives }, () => ICON('heart', 'ic heart')).join('')}</span>` : `<span>${esc(T('lmsOut'))}</span>`}
      <small>Tap to hide</small></button>`;
  },
  targets(d) {
    const me = d.me, myId = App.me && App.me.id;
    if (!me.alive) return `<p class="notice">${esc(T('lmsOut'))} You can still watch the feed${d.room.rules.ghost_chat ? ' and chat' : ''}.</p>`;
    const list = d.players.filter((p) => p.id !== myId);
    const sel = list.find((p) => p.id === this.selected && p.alive);
    return `<section class="card"><h2 class="h3">Players</h2><ul class="targets">${list.map((p) => { const t = App.team(p.team_id); return `
      <li><button class="target ${p.alive ? '' : 'out'} ${sel && sel.id === p.id ? 'sel' : ''}" ${p.alive ? '' : 'disabled'} data-act="lms.pick" data-id="${esc(p.id)}">
        <span class="dot" style="background:${esc(t ? t.color : '#999')}"></span><span class="grow">${esc(p.name)}</span>${p.alive ? '' : '<small>out</small>'}</button></li>`; }).join('')}</ul></section>
      <div class="attack-bar"><button class="btn btn-coral btn-block btn-big" id="attack-btn" data-act="lms.attack" ${sel ? '' : 'disabled'}>${sel ? esc(T('lmsAttack')) + ' ' + esc(sel.name) : 'Pick someone to attack'}</button></div>`;
  },
  tickCooldown() {
    clearInterval(this.tick);
    const me = this.data && this.data.me;
    if (!me || !me.next_attack_at) return;
    const upd = () => {
      const btn = $('#attack-btn'); if (!btn) return clearInterval(this.tick);
      const left = Math.ceil((Date.parse(me.next_attack_at) - App.serverNow()) / 1000);
      const sel = this.data.players.find((p) => p.id === this.selected && p.alive);
      if (left > 0) { btn.disabled = true; btn.textContent = `Wait ${left}s`; }
      else { btn.disabled = !sel; btn.textContent = sel ? `${T('lmsAttack')} ${sel.name}` : 'Pick someone to attack'; clearInterval(this.tick); }
    };
    upd(); this.tick = setInterval(upd, 500);
  },
  appendFeed(items) {
    const ul = $('#lms-feed'); if (!ul) return;
    ul.insertAdjacentHTML('afterbegin', items.slice().reverse().map((e) => `<li class="ev ev-${esc(e.kind)}"><span>${esc(e.body)}</span><small class="muted">${esc(timeAgo(e.at))}</small></li>`).join(''));
    while (ul.children.length > 150) ul.lastElementChild.remove();
  },
  appendChat(items) {
    const ul = $('#lms-chat'); if (!ul) return;
    ul.insertAdjacentHTML('beforeend', items.map((m) => { const t = App.team(m.team_id); return `<li class="msg ${m.mine ? 'mine' : ''}"><span class="who" style="color:${esc(t ? t.color : 'inherit')}">${esc(m.name)}</span> ${esc(m.body)}</li>`; }).join(''));
    while (ul.children.length > 200) ul.firstElementChild.remove();
    ul.scrollTop = ul.scrollHeight;
    if (this.tab !== 'chat') { const b = $('#chat-badge'); if (b) { b.hidden = false; b.textContent = Number(b.textContent || 0) + items.filter((m) => !m.mine).length || ''; if (!b.textContent) b.hidden = true; } }
  },
};

VIEWS.lms = {
  keepOnSettings: true,
  render(params) {
    const code = (params[0] || '').toUpperCase();
    if (code !== LMS.code) LMS.reset();
    LMS.code = code || null;
    return code ? LMS.roomHtml() : LMS.listHtml();
  },
  mounted() {
    if (LMS.code) {
      // Rebuild the feed/chat we already have, then poll for new items
      LMS.appendFeed(LMS.events); LMS.appendChat(LMS.chat); LMS.draw();
      Poll.every('room', () => Settings.get().poll.room, () => LMS.poll().catch((e) => {
        if (/sign in again/i.test(e.message)) App.signOutLocal(); else if (/not found/i.test(e.message)) { toast('That room no longer exists.', 'error'); App.go('#/lms'); }
      }));
    } else {
      Poll.every('rooms', () => 5, () => LMS.loadRooms());
    }
  },
  unmount() { Poll.stop('room'); Poll.stop('rooms'); clearInterval(LMS.tick); },
};

Object.assign(ACTIONS, {
  'lms.createOpen': () => {
    const s = Settings.get().lms;
    modal(`<form data-submit="lms.create"><h2 class="h2">${esc(T('lmsCreate'))}</h2>
      ${s.playersCanSetRules ? LMS.rulesForm() : `<div class="field"><label class="field-label" for="r-name">Room name</label><input class="input" id="r-name" name="name" maxlength="40" value="Last Man Standing"/></div><label class="switch"><input type="checkbox" name="is_public" checked/> Show in the public list</label>`}
      <p class="muted small">You will be the moderator, and you play too.</p>
      <div class="btn-row end"><button type="button" class="btn btn-ghost" data-act="modal.close">Cancel</button><button class="btn btn-gold">Create</button></div></form>`);
  },
  'lms.tab': (el) => {
    LMS.tab = el.dataset.tab;
    $$('.seg-btn').forEach((b) => b.classList.toggle('on', b === el));
    $('#lms-feed').hidden = LMS.tab !== 'feed'; $('#lms-chat-box').hidden = LMS.tab !== 'chat';
    if (LMS.tab === 'chat') { const b = $('#chat-badge'); b.hidden = true; b.textContent = ''; const ul = $('#lms-chat'); ul.scrollTop = ul.scrollHeight; }
  },
  'lms.role': () => { LMS.showRole = !LMS.showRole; LMS.draw(); },
  'lms.pick': (el) => { LMS.selected = el.dataset.id; LMS.draw(); },
  'lms.join': (el) => guard(el, async () => { await DB.lms.join(App.token, LMS.code); await LMS.poll(); }),
  'lms.start': (el) => guard(el, async () => { await DB.lms.start(App.token, LMS.code); await LMS.poll(); }),
  'lms.again': (el) => guard(el, async () => { await DB.lms.control(App.token, LMS.code, 'again'); await LMS.poll(); }),
  'lms.end': async (el) => { if (await confirmBox('End this round with no winner?', 'End round')) guard(el, async () => { await DB.lms.control(App.token, LMS.code, 'end'); await LMS.poll(); }); },
  'lms.close': async (el) => { if (await confirmBox('Close this room for everyone?', 'Close room')) guard(el, async () => { await DB.lms.control(App.token, LMS.code, 'close'); App.go('#/lms'); }); },
  'lms.leave': async (el) => {
    const live = LMS.data && LMS.data.room.status === 'live' && LMS.data.me.alive && LMS.data.me.role === 'player';
    if (live && !(await confirmBox('Leaving now counts as being knocked out. Leave?', 'Leave'))) return;
    guard(el, async () => { await DB.lms.leave(App.token, LMS.code); App.go('#/lms'); });
  },
  'lms.attack': (el) => guard(el, async () => {
    const res = await DB.lms.attack(App.token, LMS.code, LMS.selected);
    toast(res.message, res.result === 'backfire' || res.result === 'out' ? 'error' : res.result === 'nothing' ? 'info' : 'good', 4000);
    if (navigator.vibrate) navigator.vibrate(res.result === 'backfire' || res.result === 'out' ? [80, 60, 80] : 40);
    LMS.selected = null;
    await LMS.poll();
  }),
});
Object.assign(SUBMITS, {
  'lms.joinCode': (form, btn) => guard(btn, async () => {
    const code = form.code.value.trim().toUpperCase(); if (code.length !== 4) return toast('Room codes have 4 letters.', 'error');
    await DB.lms.join(App.token, code); App.go('#/lms/' + code);
  }),
  'lms.create': (form, btn) => guard(btn, async () => {
    const s = Settings.get().lms;
    const rules = s.playersCanSetRules ? LMS.readRules(form) : {};
    const max = form.max ? Number(form.max.value) : s.maxPlayers;
    const res = await DB.lms.create(App.token, form.name.value, form.is_public.checked, max, rules);
    closeModal(); App.go('#/lms/' + res.code);
  }),
  'lms.chat': (form, btn) => guard(btn, async () => {
    const v = form.body.value.trim(); if (!v) return;
    await DB.lms.chat(App.token, LMS.code, v); form.body.value = ''; await LMS.poll();
  }),
});
