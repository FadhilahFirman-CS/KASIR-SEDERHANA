/* Offline demo storage. No Supabase, SQL, or external database is used. */
(function () {
  "use strict";
  var ROOT = "kasir.demo.v1";
  function read(k, d) { try { var v = JSON.parse(localStorage.getItem(ROOT + "." + k)); return v == null ? d : v; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(ROOT + "." + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function rows(t) { return read("table." + t, []); }
  function setRows(t, v) { write("table." + t, v); }
  function currentUser() { var raw = null; try { raw = sessionStorage.getItem("kasir.currentStore"); } catch (e) {} if (!raw) { try { raw = localStorage.getItem(ROOT + ".session"); } catch (e) {} } try { var s = raw ? JSON.parse(raw) : null; return s ? { id: s.authId || s.id, email: s.email || s.username } : null; } catch (e) { return null; } }
  function response(data, error) { return Promise.resolve({ data: data, error: error || null }); }
  function makeQuery(table, action, payload) {
    var filters = [], sort = null, asc = true, max = null;
    var q = { eq: function (k, v) { filters.push([k, v]); return q; }, order: function (k, o) { sort = k; asc = !o || o.ascending !== false; return q; }, limit: function (n) { max = n; return q; }, select: function () { return q; }, maybeSingle: function () { return q.then(function (r) { return response(r.data && r.data[0] || null, r.error); }); }, single: function () { return q.then(function (r) { return response(r.data && r.data[0] || null, r.data && r.data[0] ? null : { message: "Data tidak ditemukan" }); }); }, then: function (resolve, reject) { return Promise.resolve().then(function () { var all = rows(table), data; var match = function (x) { return filters.every(function (f) { return String(x[f[0]]) === String(f[1]); }); }; if (action === "select") { data = all.filter(match); if (sort) data.sort(function (a, b) { return (a[sort] > b[sort] ? 1 : -1) * (asc ? 1 : -1); }); if (max != null) data = data.slice(0, max); } else if (action === "insert") { data = (Array.isArray(payload) ? payload : [payload]).map(function (x) { var row = Object.assign({ id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2), created_at: new Date().toISOString() }, x); all.push(row); return row; }); setRows(table, all); } else if (action === "upsert") { var keys = ["store_id", "data_key", "auth_user_id", "local_id"].filter(function (k) { return payload[k] != null; }); var i = payload.id ? all.findIndex(function (x) { return x.id === payload.id; }) : all.findIndex(function (x) { return keys.length && keys.every(function (k) { return String(x[k]) === String(payload[k]); }); }); if (i < 0) all.push(Object.assign({ created_at: new Date().toISOString() }, payload)); else all[i] = Object.assign({}, all[i], payload); setRows(table, all); data = null; } else if (action === "delete") { setRows(table, all.filter(function (x) { return !match(x); })); data = null; } else { all.forEach(function (x) { if (match(x)) Object.assign(x, payload); }); setRows(table, all); data = null; } return { data: data, error: null }; }).then(resolve, reject); } };
    return q;
  }
  function from(table) { var q = makeQuery(table, "select"); q.insert = function (v) { return makeQuery(table, "insert", v); }; q.upsert = function (v) { return makeQuery(table, "upsert", v); }; q.delete = function () { return makeQuery(table, "delete"); }; q.update = function (v) { return makeQuery(table, "update", v); }; return q; }
  window.SUPABASE_CONFIG = { mode: "local-demo", storage: "localStorage" };
  window.demoSession = currentUser;
  window.supabaseClient = { from: from, auth: { getUser: function () { return response(currentUser()); }, signInWithPassword: function () { return response(currentUser()); }, signUp: function () { return response(currentUser()); } } };
})();
