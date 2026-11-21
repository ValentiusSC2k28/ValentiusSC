/**
 * hunt.js — the treasure hunt screen: clue, scanning, challenge, hints, race.
 * Every team member sees the same team progress. The rules live in the
 * database (setup.sql → hh_hunt_*).
 */

const Hunt = {
  data: null, scanner: null, tick: null,

  async load() {
    const d = await DB.hunt.view(App.token);
    App.offset = Date.parse(d.now) - Date.now();
    this.data = d;
    const pending = LS.get('hh:pendingScan');
    if (pending && d.started) { LS.del('hh:pendingScan'); await this.scan(pending); return; }
    this.draw();
  },
  async scan(code) {
    const res = await DB.hunt.scan(App.token, code);
    toast(res.message, res.ok ? 'good' : 'error', 5000);
    if (navigator.vibrate) navigator.vibrate(res.ok ? 60 : [80, 60, 80]);
    const d = await DB.hunt.view(App.token); this.data = d; this.draw();
  },
  draw() {
    const d = this.data, box = $('#hunt'); if (!d || !box) return;
    const s = Settings.get();
    const state = d.state || {};
    let main = '';
    const left = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - App.serverNow()) / 1000));
    const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

    if (state.status === 'ended' || (state.ends_at && left(state.ends_at) === 0 && state.status === 'live')) {
      main = `<section class="card center"><p class="big-wait">${esc(T('huntOver'))}</p>${d.finished ? `<p>${esc(T('huntFinished', { place: ordinal(d.place) }))}</p>` : ''}</section>`;
    } else if (!d.started) {
      main = state.status === 'live' && state.starts_at
        ? `<section class="card center"><p class="eyebrow">${esc(T('huntStartsIn'))}</p><p class="countdown" data-until="${esc(state.starts_at)}">${mmss(left(state.starts_at))}</p></section>`
        : `<section class="card center">${ICON('map', 'ic big')}<p class="big-wait">${esc(T('huntWaiting'))}</p></section>`;
    } else if (d.finished) {
      main = `<section class="card center win-card">${ICON('crown', 'ic big')}<h2 class="h2">${esc(T('huntFinished', { place: ordinal(d.place) }))}</h2></section>`;
    } else if (!d.station) {
      main = `<p class="notice">Your team has no route yet. Ask an admin.</p>`;
    } else {
      const st = d.station;
      const frozen = d.frozen_until && left(d.frozen_until) > 0;
      main = `<section class="card clue-card">
          <div class="card-head"><span class="tag">Station ${d.step + 1} of ${d.total}</span>${state.ends_at ? `<small class="muted">Ends in <span class="countdown-inline" data-until="${esc(state.ends_at)}">${mmss(left(state.ends_at))}</span></small>` : ''}</div>
          <p class="eyebrow">${esc(T('huntClue'))}</p><div class="clue rich">${rich(st.clue || '…')}</div>
          ${st.hint ? `<p class="hint-box"><strong>Hint:</strong> ${esc(st.hint)}</p>` : st.has_hint && d.stage === 'find' ? `<button class="btn btn-ghost small" data-act="hunt.hint">${esc(T('huntHint'))} (−${d.hint_cost})</button>` : ''}
        </section>`;
      if (frozen) {
        main += `<section class="card center frozen-card"><p>${esc(T('huntFrozen'))}</p><p class="countdown" data-until="${esc(d.frozen_until)}">${mmss(left(d.frozen_until))}</p></section>`;
      } else if (d.stage === 'find') {
        main += `<section class="card">
          ${s.hunt.cameraScan ? `<button class="btn btn-gold btn-block btn-big" data-act="hunt.camera">${ICON('qr')} ${esc(T('huntScan'))}</button>` : ''}
          <form class="inline-form" data-submit="hunt.code"><label class="sr" for="h-code">${esc(T('huntTypeCode'))}</label>
            <input class="input code-in" id="h-code" name="code" maxlength="24" placeholder="${esc(T('huntTypeCode'))}" autocomplete="off" autocapitalize="characters"/>
            <button class="btn btn-primary">Go</button></form>
          <p class="muted small">Your phone camera works too: point it at the code and open the link.</p></section>`;
      } else if (d.stage === 'challenge') {
        main += `<section class="card"><p class="eyebrow">You found ${esc(st.name || 'the station')}!</p><div class="rich">${rich(st.challenge || 'Answer to unlock the next clue.')}</div>
          <form class="inline-form" data-submit="hunt.answer"><label class="sr" for="h-ans">${esc(T('huntAnswer'))}</label>
            <input class="input" id="h-ans" name="answer" placeholder="${esc(T('huntAnswer'))}" autocomplete="off"/><button class="btn btn-gold">Check</button></form></section>`;
      } else if (d.stage === 'waiting') {
        main += `<section class="card"><p class="eyebrow">You found ${esc(st.name || 'the station')}!</p><div class="rich">${rich(st.challenge || '')}</div><p class="notice">${esc(T('huntWaitingAdmin'))}</p></section>`;
      }
      if (d.message) main += `<p class="muted small center">${esc(d.message)}</p>`;
    }
    const race = `<section class="card"><h2 class="h3">${esc(T('huntRace'))}</h2><div class="race">${(d.race || []).map((r) => { const t = App.team(r.team_id); if (!t) return ''; const pct = r.total ? (r.step / r.total) * 100 : 0; return `
      <div class="race-row ${r.team_id === d.team_id ? 'mine' : ''}" style="--c:${esc(t.color)}"><span class="grow">${esc(t.name)}${r.place ? ' · ' + ordinal(r.place) : ''}</span><span>${r.step}/${r.total}</span>
      <div class="race-track"><div class="race-fill" style="width:${pct}%"></div></div></div>`; }).join('')}</div></section>`;
    // Keep what someone is typing
    const typing = document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (typing) { const r = $('#hunt-race'); if (r) r.innerHTML = race; return; }
    box.innerHTML = `<h1 class="h1 page-title">${esc(T('huntTitle'))}</h1>${main}<div id="hunt-race">${race}</div>`;
    this.countdowns();
  },
  countdowns() {
    clearInterval(this.tick);
    this.tick = setInterval(() => {
      const els = $$('[data-until]'); if (!els.length) return clearInterval(this.tick);
      els.forEach((el) => { const n = Math.max(0, Math.ceil((Date.parse(el.dataset.until) - App.serverNow()) / 1000)); el.textContent = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; if (n === 0) Hunt.load().catch(() => {}); });
    }, 1000);
  },
  async camera() {
    if (!window.Html5Qrcode) {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the scanner. Use your phone camera or type the code.')); document.head.appendChild(s); });
    }
    modal(`<h2 class="h2">${esc(T('huntScan'))}</h2><div id="qr-reader" class="qr-reader"></div><div class="btn-row end"><button class="btn btn-ghost" data-act="hunt.cameraClose">Close</button></div>`);
    this.scanner = new Html5Qrcode('qr-reader');
    try {
      await this.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, async (text) => {
        await this.stopCamera(); closeModal();
        guard(null, () => this.scan(text));
      });
    } catch (e) { await this.stopCamera(); closeModal(); throw new Error('Camera not available. Allow camera access, or type the code.'); }
  },
  async stopCamera() { if (this.scanner) { try { await this.scanner.stop(); } catch (_) {} this.scanner = null; } },
};

VIEWS.hunt = {
  keepOnSettings: true,
  render() { return '<div id="hunt"><div class="skeleton"></div></div>'; },
  mounted() { Poll.every('hunt', () => Settings.get().poll.hunt, () => Hunt.load()); },
  unmount() { Poll.stop('hunt'); clearInterval(Hunt.tick); Hunt.stopCamera(); },
};

Object.assign(ACTIONS, {
  'hunt.camera': (el) => guard(el, () => Hunt.camera()),
  'hunt.cameraClose': () => { Hunt.stopCamera(); closeModal(); },
  'hunt.hint': async (el) => {
    if (!(await confirmBox(T('huntHintConfirm', { n: Hunt.data.hint_cost }), 'Use a hint'))) return;
    guard(el, async () => { await DB.hunt.hint(App.token); await Hunt.load(); });
  },
});
Object.assign(SUBMITS, {
  'hunt.code': (form, btn) => guard(btn, async () => { const v = form.code.value.trim(); if (!v) return; form.code.value = ''; document.activeElement.blur(); await Hunt.scan(v); }),
  'hunt.answer': (form, btn) => guard(btn, async () => {
    const v = form.answer.value.trim(); if (!v) return;
    const res = await DB.hunt.answer(App.token, v);
    toast(res.message, res.ok ? 'good' : 'error', 4000);
    if (res.ok) { form.answer.value = ''; document.activeElement.blur(); }
    await Hunt.load();
  }),
});
