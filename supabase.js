/**
 * supabase.js — everything that talks to the database lives here.
 * The rest of the app only uses the DB object below.
 *
 * Paste your own project's URL and anon (public) key here.
 * Supabase dashboard → Project Settings → API.
 * The anon key is safe to publish while the rules from setup.sql are in place.
 */
const SUPABASE_URL      = 'https://scrsdesigdtypfgfkwwu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcnNkZXNpZ2R0eXBmZ2Zrd3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyODQ2OTksImV4cCI6MjExMDg2MDY5OX0.8uiwaN0T8h4EN6GThkex7K9BBSBtQoN7WSpaL4sSLVY';

const DB = (() => {
  let client = null;
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function' && !/YOUR-/.test(SUPABASE_URL + SUPABASE_ANON_KEY)) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
  } catch (err) { console.error('[DB] could not start:', err); }

  const need = () => { if (!client) throw new Error('Not connected. Check your internet, or the Supabase keys in supabase.js.'); return client; };
  const clean = (msg) => String(msg || 'Something went wrong.').replace(/^.*?ERROR:\s*/, '');
  const fail = (error) => { if (error) { const e = new Error(clean(error.message || error)); e.hint = error.hint; throw e; } };

  /** Calls a database function and returns its result. */
  async function rpc(name, args = {}) {
    const { data, error } = await need().rpc(name, args);
    fail(error);
    return data;
  }

  /** Simple table access used by the admin dashboard (the database only allows admins). */
  const table = (name) => ({
    async list(order = 'id', asc = true, filter = null) {
      let q = need().from(name).select('*').order(order, { ascending: asc });
      if (filter) q = filter(q);
      const { data, error } = await q; fail(error); return data || [];
    },
    async insert(row) { const { data, error } = await need().from(name).insert(row).select('*'); fail(error); return data && data[0]; },
    async update(match, patch) {
      let q = need().from(name).update(patch);
      Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { data, error } = await q.select('*'); fail(error); return data || [];
    },
    async remove(match) {
      let q = need().from(name).delete();
      Object.entries(match).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q; fail(error);
    },
  });

  // ═══ PLAYERS ══════════════════════════════════════════════════════════════
  const player = {
    join: (name, pin, team) => rpc('hh_join', { p_name: name, p_pin: pin, p_team: team }),
    signOut: (token) => rpc('hh_signout', { p_token: token }).catch(() => {}),
    poll: (token, sinceAnn) => rpc('hh_poll', { p_token: token || null, p_since_ann: sinceAnn || 0 }),
  };

  // ═══ PUBLIC READS ═════════════════════════════════════════════════════════
  const pub = {
    async settings() {
      const { data, error } = await need().from('hh_settings').select('value, updated_at').eq('key', 'app').maybeSingle();
      fail(error); return data || { value: {}, updated_at: null };
    },
    async teams() {
      const { data, error } = await need().from('hh_teams').select('*').eq('active', true).order('sort').order('id');
      fail(error); return data || [];
    },
    async games() {
      const { data, error } = await need().from('hh_games').select('*').eq('active', true).order('sort').order('id');
      fail(error); return data || [];
    },
  };

  // ═══ LAST MAN STANDING ════════════════════════════════════════════════════
  const lms = {
    list: (t) => rpc('hh_room_list', { p_token: t }),
    create: (t, name, isPublic, max, rules) => rpc('hh_room_create', { p_token: t, p_name: name, p_public: isPublic, p_max: max, p_rules: rules || {} }),
    join: (t, code) => rpc('hh_room_join', { p_token: t, p_code: code }),
    leave: (t, code) => rpc('hh_room_leave', { p_token: t, p_code: code }),
    start: (t, code) => rpc('hh_room_start', { p_token: t, p_code: code }),
    control: (t, code, action) => rpc('hh_room_control', { p_token: t, p_code: code, p_action: action }),
    attack: (t, code, target) => rpc('hh_room_attack', { p_token: t, p_code: code, p_target: target }),
    poll: (t, code, sinceEvent, sinceChat) => rpc('hh_room_poll', { p_token: t, p_code: code, p_since_event: sinceEvent || 0, p_since_chat: sinceChat || 0 }),
    chat: (t, code, body) => rpc('hh_chat_send', { p_token: t, p_code: code, p_body: body }),
  };

  // ═══ TREASURE HUNT ════════════════════════════════════════════════════════
  const hunt = {
    view: (t) => rpc('hh_hunt_view', { p_token: t }),
    scan: (t, code) => rpc('hh_hunt_scan', { p_token: t, p_code: code }),
    answer: (t, a) => rpc('hh_hunt_answer', { p_token: t, p_answer: a }),
    hint: (t) => rpc('hh_hunt_hint', { p_token: t }),
  };

  // ═══ ADMIN ════════════════════════════════════════════════════════════════
  const auth = {
    async session() {
      if (!client) return null;
      try { const { data } = await client.auth.getSession(); return data?.session || null; } catch (_) { return null; }
    },
    async signIn(email, password) {
      const { data, error } = await need().auth.signInWithPassword({ email, password }); fail(error); return data.session;
    },
    async signUp(email, password) {
      const { data, error } = await need().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname + '#/admin' } });
      fail(error); return data;
    },
    async resetPassword(email) {
      const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/admin' }); fail(error);
    },
    async updatePassword(password) { const { error } = await need().auth.updateUser({ password }); fail(error); },
    async signOut() { if (client) { try { await client.auth.signOut(); } catch (_) {} } },
    onChange(cb) { if (client) client.auth.onAuthStateChange((ev, s) => setTimeout(() => cb(ev, s), 0)); },
  };

  const admin = {
    claim: () => rpc('hh_claim_first_admin'),
    isAdmin: () => rpc('hh_is_admin').catch(() => false),
    overview: () => rpc('hh_admin_overview'),
    saveSettings: async (value) => {
      const { error } = await need().from('hh_settings').upsert({ key: 'app', value }, { onConflict: 'key' }); fail(error);
    },
    addAdmin: (email) => rpc('hh_admin_add', { p_email: email }),
    removeAdmin: (id) => rpc('hh_admin_remove', { p_user: id }),
    resetPin: (id, pin) => rpc('hh_admin_reset_pin', { p_player: id, p_pin: pin }),
    freeze: (on) => rpc('hh_admin_freeze', { p_on: on }),
    reveal: (secs) => rpc('hh_admin_reveal', { p_seconds: secs }),
    reset: (what) => rpc('hh_admin_reset', { p_what: what }),
    roomCreate: (name, isPublic, max, rules) => rpc('hh_room_create', { p_token: null, p_name: name, p_public: isPublic, p_max: max, p_rules: rules || {} }),
    roomStart: (code) => rpc('hh_room_start', { p_token: null, p_code: code }),
    roomControl: (code, action) => rpc('hh_room_control', { p_token: null, p_code: code, p_action: action }),
    roomView: (code) => rpc('hh_admin_room_view', { p_code: code }),
    huntRoutes: (mode) => rpc('hh_admin_hunt_routes', { p_mode: mode }),
    huntState: (status, delay, minutes) => rpc('hh_admin_hunt_state', { p_status: status, p_delay: delay, p_minutes: minutes }),
    huntAdvance: (team) => rpc('hh_admin_hunt_advance', { p_team: team }),
  };

  return { get ready() { return !!client; }, rpc, table, player, pub, lms, hunt, auth, admin };
})();
