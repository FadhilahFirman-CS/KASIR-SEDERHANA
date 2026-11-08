(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat("id-ID");
  function rp(n) { return "Rp " + fmt.format(Math.round(n || 0)); }
  function num(s) { var d = String(s || "").replace(/\D/g, ""); return d ? parseInt(d, 10) : 0; }
  var currentStore = null;
  var memoryStore = Object.create(null);
  var SESSION_STORE_KEY = "kasir.currentStore";
  function saveCurrentStoreSession(account) {
    try { sessionStorage.setItem(SESSION_STORE_KEY, JSON.stringify(account)); } catch (e) {}
  }
  function loadCurrentStoreSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function storeAwareKey(k) {
    return String(k).replace(/^kasir\./, "");
  }
  function load(k, d) { var key = storeAwareKey(k); return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : d; }
  function syncMenus(items) {
    if (!currentStore || !currentStore.authId || !window.supabaseClient) return;
    window.supabaseClient.from("menus").delete().eq("store_id", currentStore.authId).then(function (result) {
      if (result.error) throw result.error;
      return items.length ? window.supabaseClient.from("menus").insert(items.map(function (item) { return { store_id: currentStore.authId, name: item.name, price: item.price, category: item.cat || "Makanan" }; })) : null;
    }).catch(function (error) { console.error("Gagal menyimpan menu", error); });
  }
  function syncInventoryData(items) {
    if (!currentStore || !currentStore.authId || !window.supabaseClient) return;
    window.supabaseClient.from("inventory").delete().eq("store_id", currentStore.authId).then(function (result) {
      if (result.error) throw result.error;
      return items.length ? window.supabaseClient.from("inventory").insert(items.map(function (item) { return { store_id: currentStore.authId, name: item.name, unit: item.unit || "unit", stock: Number(item.stock) || 0 }; })) : null;
    }).then(function (result) {
      if (result && result.error) throw result.error;
    }).catch(function (error) {
      console.error("Gagal menyimpan stok", error);
      toast("Stok tersimpan lokal, tetapi gagal ke Supabase: " + (error.message || "periksa database"));
    });
  }
  function save(k, v) {
    var key = storeAwareKey(k); memoryStore[key] = v;
    if (key === "menu") syncMenus(Array.isArray(v) ? v : []);
    if (key === "pantry") syncInventoryData(Array.isArray(v) ? v : []);
    if (key !== "menu" && key !== "pantry" && key !== "history") syncStoreData(k, v);
    return true;
  }
  function syncStoreData(k, v) {
    if (!currentStore || !window.supabaseClient) return;
    window.supabaseClient.from("store_data").upsert({ store_id: String(currentStore.id), data_key: String(k).replace(/^kasir\./, ""), data: v, updated_at: new Date().toISOString() }, { onConflict: "store_id,data_key" })
      .then(function () {}, function () { console.error("Supabase store_data sync failed"); });
  }
  function hydrateStoreData(done) {
    if (!currentStore || !window.supabaseClient) { if (done) done(); return; }
    window.supabaseClient.from("store_data").select("data_key,data").eq("store_id", currentStore.id).then(function (result) {
      if (!result.error && Array.isArray(result.data)) result.data.forEach(function (row) {
        memoryStore[storeAwareKey("kasir." + row.data_key)] = row.data;
      });
      if (done) done();
    }).then(function () {}, function () { if (done) done(); });
  }
  function esc(s) { return String(s).replace(/[&<>\"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function getAccounts() {
    try {
      return [];
    } catch (e) {
      return [];
    }
  }
  function clearDemoData() {
    try {
      var accounts = getAccounts().filter(function (acc) {
        var name = String(acc && acc.name || "").toLowerCase();
        var user = String(acc && acc.username || "").toLowerCase();
        return !(name === "warung maju" || name === "warung sejahtera" || user === "warung1" || user === "warung2");
      });

      var menuData = load("kasir.menu", []);
      if (Array.isArray(menuData) && menuData.length) {
        var seededMenuNames = ["nasi goreng", "indomie goreng", "roti bakar", "kopi susu", "americano", "teh manis", "es teh", "air mineral", "gorengan", "pisang goreng", "kentang goreng"];
        var cleanMenu = menuData.filter(function (item) {
          return !seededMenuNames.includes(String(item && item.name || "").trim().toLowerCase());
        });
        if (cleanMenu.length !== menuData.length) {
          memoryStore.menu = cleanMenu;
        }
      }

      var historyData = load("kasir.history", []);
      if (Array.isArray(historyData) && historyData.length) {
        memoryStore.history = [];
      }
    } catch (e) {}
  }
  function normalizeStoreUsername(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "warung";
  }
  function ensureDefaultAccounts() {
    var accounts = getAccounts();
    var defaultAccounts = [
      { name: "Warung Maju", username: "warung-maju", password: "12345" },
      { name: "Paras Chips", username: "paras-chips", password: "12345" }
    ];
    var map = {};
    accounts.forEach(function (acc) {
      map[String(acc && acc.username || "").toLowerCase()] = true;
    });
    defaultAccounts.forEach(function (item) {
      var key = String(item.username).toLowerCase();
      if (!map[key]) {
        accounts.push({
          id: "store-demo-" + key + "-" + Date.now(),
          name: item.name,
          username: item.username,
          password: item.password
        });
        map[key] = true;
      }
    });
  }
  function findAccount(username, password) {
    var accounts = getAccounts();
    return accounts.find(function (acc) {
      return String(acc.username).toLowerCase() === String(username).trim().toLowerCase() && String(acc.password) === String(password).trim();
    }) || null;
  }
  // Data aplikasi disimpan di Supabase; memoryStore hanya cache selama halaman aktif.

  function createStoreAccount(storeName, username, password) {
    var safeName = String(storeName || "").trim();
    var safeUser = normalizeStoreUsername(username || safeName);
    var safePass = String(password || "").trim();
    if (!safeName) throw new Error("Nama toko tidak boleh kosong.");
    if (!safeUser) throw new Error("Username tidak valid.");
    if (safePass.length < 4) throw new Error("Password minimal 4 karakter.");
    var accounts = getAccounts();
    if (accounts.some(function (acc) { return String(acc.username).toLowerCase() === safeUser.toLowerCase(); })) {
      throw new Error("Username sudah dipakai oleh toko lain. Gunakan nama toko lain atau username lain.");
    }
    var account = { id: "store-" + safeUser + "-" + Date.now(), name: safeName, username: safeUser };
    accounts.push(account);
    return account;
  }
  ensureDefaultAccounts();
  function loginToStore(account) {
    currentStore = account;
    saveCurrentStoreSession(account);
    $("shopTitle").textContent = account.name;
    $("authScreen").hidden = true;
    $("appShell").hidden = false;
    if (account.authId && window.supabaseClient) {
      window.supabaseClient.from("stores").upsert({ id: account.authId, name: account.name || "Kasir Warung", username: account.username || account.authId }, { onConflict: "id" })
        .then(function (result) { if (result.error) throw result.error; refreshStoreData(); })
        .catch(function (error) { $("loginErr").textContent = "Toko gagal disiapkan di Supabase: " + error.message; });
    }
    refreshStoreData();
    resetSale();
    renderMenu(); renderManage(); renderPantryList(); renderCart(); renderHistory(); renderQrisStatus();
  }
  function logoutStore() {
    currentStore = null;
    try { sessionStorage.removeItem(SESSION_STORE_KEY); } catch (e) {}
    $("appShell").hidden = true;
    $("authScreen").hidden = false;
    $("loginErr").textContent = "";
    $("loginUser").value = "";
    $("loginPass").value = "";
    $("registerMsg").textContent = "";
    $("loginUser").focus();
  }

  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function tween(el, to) {
    var from = el._v == null ? to : el._v;
    if (el._raf) cancelAnimationFrame(el._raf);
    el._v = to;
    if (from === to || reduce) { el.textContent = rp(to); return; }
    var t0 = performance.now(), dur = 320;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = rp(from + (to - from) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }
  var toastT;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  var flash = -1;

  var SHOP = "Kasir Warung";
  var CATS = ["Makanan", "Minuman", "Camilan"];
  var CAT_HUE = { Makanan: 28, Minuman: 205, Camilan: 330 };
  var currentStoreMeta = null;
  var defaultMenu = [
    { name: "Nasi Goreng", price: 18000, cat: "Makanan" },
    { name: "Indomie Goreng", price: 12000, cat: "Makanan" },
    { name: "Kopi Susu", price: 10000, cat: "Minuman" },
    { name: "Es Teh", price: 5000, cat: "Minuman" },
    { name: "Gorengan", price: 2000, cat: "Camilan" }
  ];
  var menu = load("kasir.menu", defaultMenu);
  var pantry = load("kasir.pantry", []);
  if (!Array.isArray(menu)) menu = defaultMenu;
  if (!Array.isArray(pantry)) pantry = [];
  var catOf = { "kopi susu": "Minuman", "americano": "Minuman", "teh manis": "Minuman", "es teh": "Minuman", "air mineral": "Minuman", "gorengan": "Camilan", "pisang goreng": "Camilan", "kentang goreng": "Camilan" };
  menu.forEach(function (m) { if (CATS.indexOf(m.cat) < 0) m.cat = catOf[String(m.name).toLowerCase()] || "Makanan"; });
  var history = load("kasir.history", []);
  var cart = [];
  var lastReceiptText = "";

  function persistMenu() {
    if (!currentStore) return false;
    return save("kasir.menu", menu);
  }

  function refreshStoreData() {
    if (!currentStore) return;
    var remoteId = currentStore.authId || currentStore.id;
    Promise.all([
      window.supabaseClient.from("menus").select("name,price,category").eq("store_id", remoteId).order("created_at", { ascending: true }),
      window.supabaseClient.from("inventory").select("name,unit,stock").eq("store_id", remoteId).order("created_at", { ascending: true }),
      window.supabaseClient.from("qris_settings").select("payload").eq("store_id", remoteId).maybeSingle(),
      window.supabaseClient.from("transactions").select("invoice_no,customer_name,subtotal,discount,total,paid,change_amount,payment_method,created_at,transaction_items(name,price,quantity)").eq("store_id", remoteId).order("created_at", { ascending: false }).limit(5000)
    ]).then(function (results) {
      results.forEach(function (result) { if (result.error) throw result.error; });
      memoryStore.menu = (results[0].data || []).map(function (m) { return { name: m.name, price: m.price, cat: m.category }; });
      memoryStore.pantry = (results[1].data || []).map(function (p) { return { name: p.name, unit: p.unit, stock: Number(p.stock) || 0 }; });
      memoryStore.qris = results[2].data ? results[2].data.payload : "";
      memoryStore.history = (results[3].data || []).map(function (t) { return { no: t.invoice_no, customer: t.customer_name || "", time: t.created_at, subtotal: t.subtotal, discount: t.discount, total: t.total, paid: t.paid, change: t.change_amount, method: t.payment_method, items: (t.transaction_items || []).map(function (i) { return { name: i.name, price: i.price, qty: i.quantity }; }) }; });
      refreshStoreDataLocal();
      renderMenu(); renderManage(); renderPantryList(); renderCart(); renderHistory(); renderQrisStatus();
    }).catch(function (error) { console.error("Gagal memuat data Supabase", error); $("loginErr").textContent = "Gagal memuat data toko: " + error.message; });
  }
  function refreshStoreDataLocal() {
    var savedMenu = load("kasir.menu", null);
    menu = Array.isArray(savedMenu) ? savedMenu : [];
    menu.forEach(function (m) { if (CATS.indexOf(m.cat) < 0) m.cat = catOf[String(m.name).toLowerCase()] || "Makanan"; });
    history = load("kasir.history", []);
    qrisPayload = load("kasir.qris", "");
    if (!qrisPayload) {
      qrisPayload = "";
    }
    if (typeof qrisPayload !== "string") qrisPayload = "";
    $("shopTitle").textContent = currentStore.name;
  }

  function dayKey(d) { var x = new Date(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); }

  /* ---------- menu cepat ---------- */
  function getProductMatches(query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    var items = menu.filter(function (item) {
      var name = String(item && item.name || "").toLowerCase();
      return name.indexOf(q) >= 0;
    });
    return items.slice(0, 8).sort(function (a, b) {
      var aIndex = String(a.name).toLowerCase().indexOf(q);
      var bIndex = String(b.name).toLowerCase().indexOf(q);
      return aIndex - bIndex || String(a.name).localeCompare(String(b.name));
    });
  }
  function renderProductSuggestions() {
    var q = $("inName").value.trim();
    var box = $("productSuggestions");
    var matches = getProductMatches(q);
    if (!matches.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.innerHTML = matches.map(function (item) {
      return '<button type="button" class="suggestion-item" data-suggest-name="' + esc(item.name) + '" data-suggest-price="' + item.price + '"><span>' + esc(item.name) + '</span><small>' + rp(item.price) + '</small></button>';
    }).join("");
    box.hidden = false;
  }

  function applySuggestedProduct(name, price) {
    $("inName").value = name;
    $("inPrice").value = String(price || "");
    $("productSuggestions").hidden = true;
    $("productSuggestions").innerHTML = "";
    $("inQty").focus();
  }

  function renderMenu() {
    if (!menu.length) { $("menuGrid").innerHTML = '<div class="empty">Menu cepat kosong. Tambahkan menu di kolom "Tambah menu baru".</div>'; return; }
    $("menuGrid").innerHTML = CATS.map(function (cat) {
      var cards = "", n = 0;
      menu.forEach(function (m, i) {
        if (m.cat !== cat) return;
        n++;
        cards += '<div class="menu-wrap"><button type="button" class="menu-item" data-add="' + i + '"><i class="av" style="--h:' + CAT_HUE[cat] + '">' + esc(m.name.charAt(0).toUpperCase()) + '</i><span>' + esc(m.name) + '</span><em>' + rp(m.price) + '</em></button></div>';
      });
      return '<div class="menu-sec"><h3 class="menu-cat"><span class="dot" style="--h:' + CAT_HUE[cat] + '"></span>' + cat + '<span class="n">' + n + '</span></h3>' +
        (n ? '<div class="menu-grid">' + cards + '</div>' : '<p class="hint" style="margin:0">Belum ada menu di kategori ini.</p>') + '</div>';
    }).join("");
  }

  /* ---------- nota berjalan ---------- */
  function addItem(name, price, qty) {
    var item = menu.find(function (m) { return m.name.toLowerCase() === name.toLowerCase(); });
    if (item && typeof item.stock === "number" && isFinite(item.stock)) {
      var existingQty = cart.reduce(function (sum, c) {
        if (c.name.toLowerCase() === name.toLowerCase() && c.price === price) return sum + c.qty;
        return sum;
      }, 0);
      if (item.stock <= 0) throw new Error("Stok " + item.name + " habis.");
      if (existingQty + qty > item.stock) throw new Error("Stok " + item.name + " tersisa " + item.stock + ".");
    }
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].name.toLowerCase() === name.toLowerCase() && cart[i].price === price) { cart[i].qty += qty; flash = i; return; }
    }
    cart.push({ name: name, price: price, qty: qty });
    flash = cart.length - 1;
  }
  function subtotal() { return cart.reduce(function (s, c) { return s + c.price * c.qty; }, 0); }
  function discount() { return Math.min(num($("inDisc").value), subtotal()); }
  function total() { return Math.max(0, subtotal() - discount()); }
  function method() { return document.querySelector('input[name="method"]:checked').value; }

  function renderCart() {
    var ul = $("cartList");
    if (!cart.length) {
      ul.innerHTML = '';
    } else {
      ul.innerHTML = cart.map(function (c, i) {
        return '<li class="cart-row"><div><div class="cart-name">' + esc(c.name) + '</div><div class="cart-meta">' + c.qty + ' × ' + rp(c.price) + '</div></div>' +
          '<div class="cart-sub">' + rp(c.price * c.qty) + '</div>' +
          '<div class="stepper"><button type="button" data-dec="' + i + '" aria-label="Kurangi ' + esc(c.name) + '">−</button><output>' + c.qty + '</output><button type="button" data-inc="' + i + '" aria-label="Tambah ' + esc(c.name) + '">+</button></div>' +
          '<div style="justify-self:end"><button type="button" class="small ghost danger" data-rm="' + i + '">Hapus</button></div></li>';
      }).join("");
    }
    if (flash >= 0) { var li = ul.children[flash]; if (li) li.classList.add("pop"); flash = -1; }
    renderTotals();
  }

  function renderTotals() {
    var sub = subtotal(), tot = total();
    tween($("tSub"), sub);
    tween($("tTotal"), tot);
    var cash = method() === "Tunai";
    $("cashBox").hidden = !cash;
    var isQ = method() === "QRIS";
    $("qrisBox").hidden = !isQ;
    $("payBtn").textContent = isQ ? "QRIS sudah dibayar" : "Bayar";
    if (isQ) renderQR(tot);
    var paid = num($("inPaid").value);
    var cb = $("changeBox");
    if (cash) {
      var diff = paid - tot;
      if (!cart.length) { cb.className = "change"; $("changeLabel").textContent = "Kembalian"; $("changeVal").textContent = rp(0); }
      else if (diff >= 0) { cb.className = "change"; $("changeLabel").textContent = "Kembalian"; $("changeVal").textContent = rp(diff); }
      else { cb.className = "change short"; $("changeLabel").textContent = "Kurang"; $("changeVal").textContent = rp(-diff); }
      var q = [tot, 5000, 10000, 20000, 50000, 100000].filter(function (v, i, a) { return v > 0 && a.indexOf(v) === i; });
      $("quickCash").innerHTML = q.map(function (v, i) {
        return '<button type="button" class="small" data-cash="' + v + '">' + (i === 0 ? "Uang pas" : fmt.format(v)) + '</button>';
      }).join("");
    }
    var ok = cart.length > 0 && tot > 0 && (!cash || paid >= tot);
    $("payBtn").disabled = !ok;
  }

  /* ---------- QRIS dinamis ---------- */
  var qrisPayload = load("kasir.qris", "");
  if (typeof qrisPayload !== "string") qrisPayload = "";

  function setAuthView(view) {
    var loginForm = $("loginForm");
    var registerForm = $("registerForm");
    var tabs = document.querySelectorAll(".auth-tab");
    var isLogin = view === "login";

    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    loginForm.classList.toggle("active", isLogin);
    registerForm.classList.toggle("active", !isLogin);

    tabs.forEach(function (tab) {
      var active = tab.dataset.authView === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (isLogin) {
      $("loginUser").focus();
    } else {
      $("registerName").focus();
    }
  }

  document.querySelectorAll(".auth-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      setAuthView(tab.dataset.authView);
    });
  });

  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var user = $("loginUser").value.trim();
    var pass = $("loginPass").value.trim();
    var acc = findAccount(user, pass);
    if (window.supabaseClient) {
      var profileResult = await window.supabaseClient.from("store_profiles").select("*").eq("username", user.toLowerCase()).maybeSingle();
      if (profileResult.error) { $("loginErr").textContent = "Profil toko gagal dibaca dari Supabase: " + profileResult.error.message; return; }
      if (profileResult.data) {
        var authResult = await window.supabaseClient.auth.signInWithPassword({ email: profileResult.data.email, password: pass });
        if (authResult.error) { $("loginErr").textContent = authResult.error.message || "Username atau password salah."; return; }
        acc = { id: profileResult.data.local_id, name: profileResult.data.name, username: profileResult.data.username, authId: profileResult.data.auth_user_id };
      }
    }
    if (!acc) {
      $("loginErr").textContent = "Username atau password salah.";
      return;
    }
    $("loginErr").textContent = "";
    loginToStore(acc);
  });
  $("registerName").addEventListener("input", function () {
    $("registerUser").value = normalizeStoreUsername(this.value);
  });
  $("registerForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = $("registerName").value.trim();
    var user = $("registerUser").value.trim();
    var email = $("registerEmail").value.trim().toLowerCase();
    var pass = $("registerPass").value.trim();
    try {
      if (!email) throw new Error("Email wajib digunakan untuk autentikasi database.");
      if (!window.supabaseClient) throw new Error("Koneksi database belum tersedia.");
      var authResult = await window.supabaseClient.auth.signUp({ email: email, password: pass });
      if (authResult.error) throw new Error(authResult.error.message);
      var newAccount = createStoreAccount(name, user, pass);
      if (!authResult.data.user) throw new Error("Supabase tidak mengembalikan user. Periksa pengaturan Email Auth.");
      newAccount.authId = authResult.data.user.id;
      var profileSave = await window.supabaseClient.from("store_profiles").upsert({ local_id: newAccount.id, auth_user_id: authResult.data.user.id, name: name, username: user.toLowerCase(), email: email }, { onConflict: "local_id" });
      if (profileSave.error) throw new Error("Profil Supabase gagal disimpan: " + profileSave.error.message);
      if (!authResult.data.session) {
        $("registerMsg").textContent = "Akun berhasil dibuat. Buka email konfirmasi dari Supabase, lalu login dengan username dan password Anda.";
        $("loginUser").value = newAccount.username;
        $("loginPass").value = "";
        $("registerName").value = "";
        $("registerUser").value = "";
        $("registerEmail").value = "";
        $("registerPass").value = "";
        setAuthView("login");
        return;
      }
      $("registerMsg").textContent = "Akun berhasil dibuat dan siap digunakan.";
      $("loginUser").value = newAccount.username;
      $("loginPass").value = "";
      $("loginErr").textContent = "";
      $("registerName").value = "";
      $("registerUser").value = "";
      $("registerEmail").value = "";
      $("registerPass").value = "";
      setAuthView("login");
      loginToStore(newAccount);
    } catch (err) {
      $("registerMsg").textContent = err.message || "Gagal membuat akun.";
    }
  });
  $("logoutBtn").addEventListener("click", logoutStore);

  setAuthView("login");

  // Pulihkan tampilan toko saat kembali dari halaman "Lainnya". Sesi Supabase
  // tetap menjadi sumber kebenaran dan akan memvalidasi data ini di bawah.
  var savedStore = loadCurrentStoreSession();
  if (savedStore && savedStore.authId) {
    currentStore = savedStore;
    $("shopTitle").textContent = savedStore.name || "Kasir Warung";
    $("authScreen").hidden = true;
    $("appShell").hidden = false;
  }

  if (window.supabaseClient) window.supabaseClient.auth.getUser().then(async function (result) {
    var user = result.data && result.data.user;
    if (!user) {
      currentStore = null;
      try { sessionStorage.removeItem(SESSION_STORE_KEY); } catch (e) {}
      $("authScreen").hidden = false;
      $("appShell").hidden = true;
      return;
    }
    var profile = await window.supabaseClient.from("store_profiles").select("local_id,name,username,email").eq("auth_user_id", user.id).maybeSingle();
    if (profile.data) {
      currentStore = { id: profile.data.local_id, name: profile.data.name, username: profile.data.username, authId: user.id };
      saveCurrentStoreSession(currentStore);
      $("shopTitle").textContent = currentStore.name; $("authScreen").hidden = true; $("appShell").hidden = false; refreshStoreData();
    }
  }).catch(function () {
    if (!currentStore) { $("authScreen").hidden = false; $("appShell").hidden = true; }
  });

  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; }
    }
    return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  }
  function parseTLV(s) {
    var i = 0, out = [];
    while (i < s.length) {
      if (i + 4 > s.length) return null;
      var tag = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
      if (isNaN(len) || !/^\d{2}$/.test(tag) || i + 4 + len > s.length) return null;
      out.push([tag, s.substr(i + 4, len)]); i += 4 + len;
    }
    return out;
  }
  function checkPayload(raw) {
    var s = String(raw || "").replace(/[\r\n\t]+/g, "").trim();
    if (!s) return { ok: false, msg: "Kode QRIS masih kosong." };
    if (/^https?:\/\//i.test(s)) return { ok: false, msg: "Yang tertempel adalah tautan, bukan teks QRIS. Pakai pembaca QR yang menampilkan isi teks mentah, lalu salin teks yang diawali 000201." };
    var st = s.indexOf("000201");
    if (st < 0) return { ok: false, msg: "Teks tidak mengandung 000201. Salin isi QRIS dari awal sampai akhir." };
    s = s.slice(st);
    var re = /6304[0-9A-Fa-f]{4}/g, mt, crcBad = false, best = null;
    while ((mt = re.exec(s)) !== null) {
      var cand = s.slice(0, mt.index + 8), it = parseTLV(cand);
      if (!it || it[0][0] !== "00" || it[it.length - 1][0] !== "63") continue;
      if (crc16(cand.slice(0, -4)) !== it[it.length - 1][1].toUpperCase()) { crcBad = true; continue; }
      best = { cand: cand, items: it }; break;
    }
    if (!best) return { ok: false, msg: crcBad ? "Kode terbaca tapi CRC tidak cocok. Salin ulang teks QRIS sampai akhir, jangan ada karakter yang terpotong." : "Format kode tidak dikenali. Pastikan teks utuh sampai akhir (berakhir dengan 6304 dan 4 karakter)." };
    var nm = best.items.filter(function (t) { return t[0] === "59"; })[0];
    return { ok: true, clean: best.cand, name: nm ? nm[1] : "" };
  }
  function toDynamic(raw, amount) {
    var chk = checkPayload(raw); if (!chk.ok) return null;
    var items = parseTLV(chk.clean).filter(function (t) { return t[0] !== "54" && t[0] !== "63"; });
    items = items.map(function (t) { return t[0] === "01" ? ["01", "12"] : t; });
    var at = items.length;
    for (var i = 0; i < items.length; i++) { if (parseInt(items[i][0], 10) > 54) { at = i; break; } }
    var amt = String(Math.round(amount));
    items.splice(at, 0, ["54", amt]);
    var str = items.map(function (t) { return t[0] + ("0" + t[1].length).slice(-2) + t[1]; }).join("") + "6304";
    return str + crc16(str);
  }
  function qrSvg(text) {
    var qr = qrcode(0, "M"); qr.addData(text); qr.make();
    var n = qr.getModuleCount(), q = 4, d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) { if (qr.isDark(r, c)) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z"; }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + " " + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="Kode QR pembayaran"><path d="' + d + '" fill="#000000"/></svg>';
  }
  function renderQR(tot) {
    var box = $("qrisQr"), note = $("qrisNote");
    $("qrisAmt").textContent = rp(tot);
    note.className = "qris-note";
    if (!cart.length || tot <= 0) {
      box.innerHTML = '<div class="empty">Tambahkan barang ke nota, lalu QR dengan nominal total muncul di sini.</div>';
      note.textContent = ""; return;
    }
    var text = qrisPayload ? toDynamic(qrisPayload, tot) : null;
    var demo = !qrisPayload;
    var staticQris = !!qrisPayload && !text;
    if (demo) text = "CONTOH QRIS - BELUM DISETEL - " + rp(tot);
    if (staticQris) text = qrisPayload;
    try {
      box.innerHTML = '<div class="qr-frame">' + qrSvg(text) + '</div>';
    } catch (e) {
      box.innerHTML = '<div class="empty">QR gagal dibuat. Muat ulang halaman lalu coba lagi.</div>'; note.textContent = ""; return;
    }
    if (demo) { note.className = "qris-note warn"; note.textContent = "QR contoh, belum bisa dipakai membayar. Isi kode QRIS toko di Pengaturan QRIS."; }
    else if (staticQris) { note.className = "qris-note warn"; note.textContent = "QRIS toko berhasil dimuat. Nominal mungkin perlu dimasukkan manual oleh pembeli."; }
    else { var nm = checkPayload(qrisPayload).name; note.textContent = (nm ? nm + ". " : "") + "Pembeli memindai dengan e-wallet atau mobile banking. Nominal sudah terisi."; }
  }
  function renderQrisStatus() {
    var st = $("qrisStatus");
    if (!qrisPayload) { st.textContent = "Belum disetel. Unggah gambar QRIS toko Anda, atau tempel teks kodenya (panjang, diawali 000201). Nomor seperti ID102... adalah NMID, bukan kode QRIS. Setelah tersimpan, QR di kasir otomatis berisi nominal sesuai total belanja."; return; }
    var c = checkPayload(qrisPayload);
    if (c.ok) {
      st.textContent = "Tersimpan" + (c.name ? " untuk " + c.name : "") + ". QRIS berhasil tersambung ke kasir.";
      toast("QRIS berhasil tersambung ke kasir");
    } else {
      st.textContent = c.msg;
    }
  }
  $("qrisInput").value = qrisPayload;
  $("qrisSave").addEventListener("click", function () {
    var c = checkPayload($("qrisInput").value);
    if (!c.ok) { $("qrisStatus").textContent = c.msg; return; }
    qrisPayload = c.clean; save("kasir.qris", qrisPayload); $("qrisInput").value = qrisPayload; renderQrisStatus(); renderTotals(); toast("QRIS tersimpan");
  });
  $("qrisClear").addEventListener("click", function () {
    qrisPayload = ""; save("kasir.qris", ""); $("qrisInput").value = ""; renderQrisStatus(); renderTotals();
  });

  $("qrisFile").addEventListener("change", function () {
    var inp = this, f = inp.files && inp.files[0]; if (!f) return;
    var st = $("qrisStatus");
    if (typeof jsQR !== "function") { st.textContent = "Pembaca gambar gagal dimuat. Muat ulang halaman, atau tempel teks QRIS secara manual."; inp.value = ""; return; }
    var rd = new FileReader();
    rd.onerror = function () { st.textContent = "File gambar tidak bisa dibuka."; };
    rd.onload = function () {
      var img = new Image();
      img.onerror = function () { st.textContent = "File itu bukan gambar yang bisa dibaca."; };
      img.onload = function () {
        var text = null, sizes = [1400, 900, 600];
        for (var k = 0; k < sizes.length && !text; k++) {
          var sc = Math.min(1, sizes[k] / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
          var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          var cx = cv.getContext("2d"); cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
          var r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
          if (r && r.data) text = r.data;
        }
        inp.value = "";
        if (!text) { st.textContent = "QR tidak terbaca. Pakai gambar yang jelas, tidak buram, dan seluruh kotak QR terlihat."; return; }
        var c = checkPayload(text);
        $("qrisInput").value = text;
        if (!c.ok) { st.textContent = "QR terbaca, tetapi isinya belum cocok dengan kode QRIS. " + c.msg; return; }
        qrisPayload = c.clean; save("kasir.qris", qrisPayload); $("qrisInput").value = c.clean;
        renderQrisStatus(); renderTotals(); toast("QRIS terbaca dan tersimpan");
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });

  /* ---------- struk ---------- */
  function pad(l, r, w) { l = String(l); r = String(r); var sp = Math.max(1, w - l.length - r.length); return l + " ".repeat(sp) + r; }
  function nextNo(d) {
    var k = dayKey(d), n = history.filter(function (h) { return dayKey(h.time) === k; }).length + 1;
    var dt = new Date(d), yy = String(dt.getFullYear()).slice(2), mm = ("0" + (dt.getMonth() + 1)).slice(-2), dd = ("0" + dt.getDate()).slice(-2);
    return "INV-" + yy + mm + dd + "-" + ("00" + n).slice(-3);
  }
  function buildReceiptText(t) {
    var W = 32, line = "-".repeat(W), out = [];
    out.push(t.shop, line);
    out.push(pad("No", t.no, W));
    if (t.customer) out.push(pad("Pelanggan", t.customer.slice(0, W - 10), W));
    out.push(pad("Tanggal", new Date(t.time).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }), W));
    out.push(pad("Jam", new Date(t.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":"), W));
    out.push(line);
    t.items.forEach(function (c) {
      out.push(c.name.length > W ? c.name.slice(0, W) : c.name);
      out.push(pad("  " + c.qty + " x " + fmt.format(c.price), fmt.format(c.qty * c.price), W));
    });
    out.push(line);
    out.push(pad("Subtotal", fmt.format(t.subtotal), W));
    if (t.discount > 0) out.push(pad("Diskon", "-" + fmt.format(t.discount), W));
    out.push(pad("TOTAL", rp(t.total), W));
    out.push(pad("Bayar (" + t.method + ")", fmt.format(t.paid), W));
    if (t.method === "Tunai") out.push(pad("Kembali", fmt.format(t.change), W));
    out.push(line, "   Terima kasih, sampai jumpa!");
    return out.join("\n");
  }
  function showReceipt(t) {
    lastReceiptText = buildReceiptText(t);
    var lines = lastReceiptText.split("\n");
    var body = lines.slice(1).join("\n");
    $("receipt").innerHTML = '<div class="stamp">LUNAS</div><div class="rc-head">' + esc(t.shop) + '</div><div class="rc-sub">Struk pembayaran</div><pre>' + esc(body) + '</pre>';
    $("cartPanel").hidden = true;
    $("receiptPanel").hidden = false;
    $("copyStatus").textContent = "";
    try { $("receiptPanel").scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
  }

  function formatStockSummary(items) {
    if (!Array.isArray(items) || !items.length) return "Belum ada data stok.";
    return items.map(function (item) {
      var name = String(item && item.name || "-"), stock = Number(item && item.stock);
      return name + ": " + (isFinite(stock) ? stock : 0) + " unit";
    }).join(" · ");
  }
  function renderClosingStockSummary() {
    var box = $("closeStockSummary");
    if (!box) return;
    var items = pantry.filter(function (item) { return typeof item.stock === "number" && isFinite(item.stock); });
    if (!items.length) { box.innerHTML = '<div class="empty">Belum ada data stok dapur / gudang.</div>'; return; }
    box.innerHTML = items.map(function (item) {
      var unit = String(item.unit || "unit").trim() || "unit";
      return '<div class="close-stock-item"><strong>' + esc(item.name) + '</strong><span>' + (Number(item.stock) || 0) + ' ' + esc(unit) + '</span></div>';
    }).join("");
  }

  function renderPantryList() {
    var list = $("pantryList");
    if (!list) return;
    if (!pantry.length) {
      list.innerHTML = '<div class="empty">Belum ada stok dapur / gudang. Tambahkan bahan baku di sini.</div>';
      return;
    }
    list.innerHTML = pantry.map(function (item, idx) {
      var unit = String(item.unit || "unit").trim() || "unit";
      return '<div class="pantry-row"><div><b>' + esc(item.name) + '</b><small>' + esc(unit) + '</small></div><div class="pantry-stock">' + (Number(item.stock) || 0) + '</div>' +
        '<button type="button" class="small" data-pantry-add="' + idx + '">+1</button>' +
        '<button type="button" class="small ghost danger" data-pantry-del="' + idx + '">Hapus</button></div>';
    }).join("");
  }

  function savePantry() {
    save("kasir.pantry", pantry);
    renderPantryList();
    renderClosingStockSummary();
  }

  /* ---------- riwayat ---------- */
  function renderHistory() {
    updateReport();
    var k = dayKey(Date.now());
    var today = history.filter(function (h) { return dayKey(h.time) === k; });
    $("sumCount").textContent = today.length;
    tween($("sumTotal"), today.reduce(function (s, h) { return s + h.total; }, 0));
    var ul = $("histList");
    if (!history.length) { ul.innerHTML = '<li style="display:block"><div class="empty">Belum ada transaksi. Struk yang sudah dibayar muncul di sini.</div></li>'; $("clearHist").hidden = true; return; }
    $("clearHist").hidden = false;
    ul.innerHTML = history.slice(0, 30).map(function (h, i) {
      var time = new Date(h.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
      var names = h.items.map(function (c) { return c.qty + "× " + c.name; }).join(", ");
      return '<li><span class="no">' + esc(h.no.slice(-3)) + ' · ' + time + '</span><span class="items" title="' + esc(names) + '">' + esc(names) + '<span class="badge">' + esc(h.method) + '</span></span><span class="amt">' + rp(h.total) + '</span></li>' +
        '<li style="grid-template-columns:1fr;padding:0 0 9px"><button type="button" class="small ghost" data-view="' + i + '" style="justify-self:end">Lihat struk</button></li>';
    }).join("");
    var closing = load("kasir.closing", []), last = Array.isArray(closing) && closing.length ? closing[closing.length - 1] : null;
    if (last) {
      $("closeStatus").textContent = "Terakhir ditutup: " + new Date(last.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) + " · Pemasukan " + rp(last.income) + " · Pengeluaran " + rp(last.expense) + " · Kas akhir " + rp(last.finalCash);
      if (Array.isArray(last.stockSnapshot) && last.stockSnapshot.length) {
        $("closeStockSummary").innerHTML = last.stockSnapshot.map(function (item) {
          return '<div class="close-stock-item"><strong>' + esc(item.name) + '</strong><span>' + (Number(item.stock) || 0) + ' unit</span></div>';
        }).join("");
      } else {
        renderClosingStockSummary();
      }
    } else {
      $("closeStatus").textContent = "Belum ada data tutup hari.";
      renderClosingStockSummary();
    }
  }
  function saveClosingRecord() {
    var historyToday = history.filter(function (h) { return dayKey(h.time) === dayKey(Date.now()); });
    var income = Math.max(0, num($("closeIncome").value));
    var expense = Math.max(0, num($("closeExpense").value));
    var note = $("closeNote").value.trim();
    var sales = historyToday.reduce(function (s, h) { return s + h.total; }, 0);
    var stockSnapshot = pantry.filter(function (item) { return typeof item.stock === "number" && isFinite(item.stock); }).map(function (item) {
      return { name: item.name, unit: item.unit || "unit", stock: item.stock };
    });
    var rec = {
      date: Date.now(),
      day: dayKey(Date.now()),
      sales: sales,
      income: income,
      expense: expense,
      note: note || "-",
      finalCash: sales + income - expense,
      stockSnapshot: stockSnapshot
    };
    var all = load("kasir.closing", []);
    all.push(rec);
    save("kasir.closing", all);
    $("closeIncome").value = ""; $("closeExpense").value = ""; $("closeNote").value = "";
    $("closeStatus").textContent = "Tutup hari tersimpan · Penjualan hari ini: " + rp(sales) + " · Kas akhir: " + rp(rec.finalCash) + " · Sisa stok gudang tersimpan.";
    $("closeStockSummary").innerHTML = stockSnapshot.map(function (item) {
      var unit = String(item.unit || "unit").trim() || "unit";
      return '<div class="close-stock-item"><strong>' + esc(item.name) + '</strong><span>' + (Number(item.stock) || 0) + ' ' + esc(unit) + '</span></div>';
    }).join("");
    toast("Penutupan hari disimpan");
  }

  /* ---------- aksi ---------- */
  function resetSale() {
    cart = []; $("inDisc").value = ""; $("inPaid").value = "";
    $("customerName").value = "";
    document.querySelector('input[name="method"][value="Tunai"]').checked = true;
    renderCart();
  }
  function syncTransaction(t) {
    if (!currentStore || !window.supabaseClient) return;
    var client = window.supabaseClient;
    client.auth.getUser().then(function (sessionResult) {
      var user = sessionResult.data && sessionResult.data.user;
      if (!user) throw new Error("Sesi Supabase tidak aktif");
      return client.from("stores").upsert({ id: user.id, name: currentStore.name || currentStore.username || "Kasir Warung", username: currentStore.username || user.email }, { onConflict: "id" })
        .then(function (storeResult) {
          if (storeResult.error) throw storeResult.error;
          var transactionData = {
            store_id: user.id, invoice_no: t.no, customer_name: t.customer || null, subtotal: t.subtotal, discount: t.discount,
            total: t.total, paid: t.paid, change_amount: t.change, payment_method: t.method
          };
          return client.from("transactions").insert(transactionData).select("id").single().then(function (insertResult) {
            // Kompatibilitas untuk database lama yang belum memiliki customer_name.
            if (!insertResult.error || !/customer_name|column/i.test(insertResult.error.message || "")) return insertResult;
            delete transactionData.customer_name;
            return client.from("transactions").insert(transactionData).select("id").single();
          });
        });
    }).then(function (txResult) {
      if (txResult.error) throw txResult.error;
      return client.from("transaction_items").insert(t.items.map(function (item) {
        return { transaction_id: txResult.data.id, name: item.name, price: item.price, quantity: item.qty, total: item.price * item.qty };
      }));
    }).then(function (itemResult) {
      if (itemResult.error) throw itemResult.error;
    }).catch(function (error) {
      console.error("Gagal menyimpan transaksi ke Supabase", error);
      toast("Gagal menyimpan transaksi ke Supabase: " + (error.message || "periksa koneksi/database"));
    });
  }
  function pay() {
    var tot = total(); if (!cart.length || tot <= 0) return;
    for (var i = 0; i < cart.length; i++) {
      var item = menu.find(function (m) { return m.name.toLowerCase() === cart[i].name.toLowerCase(); });
      if (item && typeof item.stock === "number" && item.stock < cart[i].qty) {
        toast("Stok " + item.name + " tersisa " + item.stock + ".");
        return;
      }
    }
    var cash = method() === "Tunai", paid = cash ? num($("inPaid").value) : tot;
    if (cash && paid < tot) return;
    var now = Date.now();
    var t = { no: nextNo(now), time: now, shop: SHOP, customer: $("customerName").value.trim(), items: cart.map(function (c) { return { name: c.name, price: c.price, qty: c.qty }; }),
      subtotal: subtotal(), discount: discount(), total: tot, method: method(), paid: paid, change: Math.max(0, paid - tot) };
    menu.forEach(function (m) {
      var match = cart.find(function (c) { return c.name.toLowerCase() === m.name.toLowerCase(); });
      if (match && typeof m.stock === "number" && isFinite(m.stock)) m.stock -= match.qty;
    });
    save("kasir.menu", menu);
    history.unshift(t);
    if (history.length > 5000) history.length = 5000;
    save("kasir.history", history);
    syncTransaction(t);
    showReceipt(t);
    resetSale();
    toast("Pembayaran berhasil · " + rp(tot));
    renderMenu(); renderHistory();
  }

  $("inName").addEventListener("input", function () {
    var value = $("inName").value.trim();
    if (!value) {
      $("productSuggestions").hidden = true;
      $("productSuggestions").innerHTML = "";
      return;
    }
    var exact = menu.find(function (item) { return String(item.name).toLowerCase() === value.toLowerCase(); });
    if (exact) {
      $("inPrice").value = String(exact.price || "");
    } else {
      var matches = getProductMatches(value);
      if (matches.length) $("inPrice").value = String(matches[0].price || "");
    }
    renderProductSuggestions();
  });

  $("inName").addEventListener("keydown", function (e) {
    var box = $("productSuggestions");
    if (e.key === "Enter" && !box.hidden && box.firstElementChild) {
      e.preventDefault();
      var first = box.firstElementChild;
      applySuggestedProduct(first.getAttribute("data-suggest-name"), Number(first.getAttribute("data-suggest-price") || 0));
    }
  });

  $("productSuggestions").addEventListener("click", function (e) {
    var btn = e.target.closest(".suggestion-item");
    if (!btn) return;
    applySuggestedProduct(btn.getAttribute("data-suggest-name"), Number(btn.getAttribute("data-suggest-price") || 0));
  });

  $("itemForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("inName").value.trim(), price = num($("inPrice").value), qty = Math.max(1, Math.min(999, parseInt($("inQty").value, 10) || 1));
    if (!name) { $("itemErr").textContent = "Isi nama barang dulu."; $("inName").focus(); return; }
    if (price <= 0) { $("itemErr").textContent = "Isi harga satuan dengan angka lebih dari 0."; $("inPrice").focus(); return; }
    try {
      addItem(name, price, qty);
      $("itemErr").textContent = "";
      $("inName").value = ""; $("inPrice").value = ""; $("inQty").value = 1;
      $("productSuggestions").hidden = true; $("productSuggestions").innerHTML = "";
      toast(name + " ditambahkan");
      $("cartPanel").hidden = false; $("receiptPanel").hidden = true;
      renderCart(); $("inName").focus();
    } catch (err) {
      $("itemErr").textContent = err.message || "Stok barang tidak tersedia.";
      $("inName").focus();
    }
  });
  $("pantryForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("pName").value.trim();
    var unit = $("pUnit").value.trim() || "unit";
    var stock = parseInt($("pStock").value, 10) || 0;
    if (!name) { $("pantryErr").textContent = "Isi nama bahan dapur / gudang."; $("pName").focus(); return; }
    var idx = pantry.findIndex(function (item) { return item.name.toLowerCase() === name.toLowerCase(); });
    if (idx >= 0) {
      pantry[idx].unit = unit;
      pantry[idx].stock = Math.max(0, Number(pantry[idx].stock || 0) + stock);
      pantry[idx].updatedAt = Date.now();
    } else {
      pantry.push({ name: name, unit: unit, stock: Math.max(0, stock), updatedAt: Date.now() });
    }
    $("pantryErr").textContent = "";
    $("pName").value = ""; $("pUnit").value = ""; $("pStock").value = 0;
    savePantry();
    toast(name + " disimpan ke stok gudang");
  });
  $("pantryList").addEventListener("click", function (e) {
    var addBtn = e.target.closest("[data-pantry-add]");
    var delBtn = e.target.closest("[data-pantry-del]");
    if (addBtn) {
      var idx = +addBtn.dataset.pantryAdd;
      if (pantry[idx]) {
        pantry[idx].stock = Math.max(0, Number(pantry[idx].stock || 0) + 1);
        pantry[idx].updatedAt = Date.now();
        savePantry();
      }
      return;
    }
    if (delBtn) {
      var delIdx = +delBtn.dataset.pantryDel;
      pantry.splice(delIdx, 1);
      savePantry();
    }
  });
  $("menuForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("mName").value.trim(), price = num($("mPrice").value), cat = $("mCat").value;
    if (!name) { $("menuErr").textContent = "Isi nama menu dulu."; $("mName").focus(); return; }
    if (price <= 0) { $("menuErr").textContent = "Isi harga dengan angka lebih dari 0."; $("mPrice").focus(); return; }
    if (menu.some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })) { $("menuErr").textContent = "Menu dengan nama itu sudah ada."; return; }
    $("menuErr").textContent = "";
    menu.push({ name: name, price: price, cat: cat });
    if (!persistMenu()) {
      menu.pop();
      $("menuErr").textContent = "Menu gagal disimpan. Penyimpanan browser penuh atau sedang diblokir.";
      return;
    }
    renderMenu(); renderManage(); toast(name + " disimpan di " + cat);
    $("mName").value = ""; $("mPrice").value = ""; $("mName").focus();
  });
  $("mPrice").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; });
  $("inPrice").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; });
  $("closeIncome").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; });
  $("closeExpense").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; });
  $("inDisc").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; renderTotals(); });
  $("inPaid").addEventListener("input", function () { var n = num(this.value); this.value = n ? fmt.format(n) : ""; renderTotals(); });
  document.querySelectorAll('input[name="method"]').forEach(function (r) { r.addEventListener("change", renderTotals); });

  $("menuGrid").addEventListener("click", function (e) {
    var a = e.target.closest("[data-add]");
    if (a) {
      var m = menu[+a.dataset.add];
      try {
        addItem(m.name, m.price, 1);
        $("cartPanel").hidden = false; $("receiptPanel").hidden = true; renderCart(); toast(m.name + " ditambahkan");
      } catch (err) {
        toast(err.message || "Stok barang tidak tersedia.");
      }
    }
  });
  $("openPantryBtn").addEventListener("click", function () {
    window.location.href = "gudang.html";
  });
  $("openReportPageBtn").addEventListener("click", function () {
    window.location.href = "laporan.html";
  });
  $("openQrisBtn").addEventListener("click", function () {
    window.location.assign(new URL("qris.html", document.baseURI).href);
  });
  $("cartList").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.inc != null) cart[+b.dataset.inc].qty = Math.min(999, cart[+b.dataset.inc].qty + 1);
    else if (b.dataset.dec != null) { var c = cart[+b.dataset.dec]; c.qty -= 1; if (c.qty <= 0) cart.splice(+b.dataset.dec, 1); }
    else if (b.dataset.rm != null) cart.splice(+b.dataset.rm, 1);
    renderCart();
  });
  $("quickCash").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cash]"); if (!b) return;
    $("inPaid").value = fmt.format(+b.dataset.cash); renderTotals();
  });
  $("payBtn").addEventListener("click", pay);
  $("closeDayBtn").addEventListener("click", saveClosingRecord);
  $("resetBtn").addEventListener("click", resetSale);
  $("newBtn").addEventListener("click", function () { $("receiptPanel").hidden = true; $("cartPanel").hidden = false; $("inName").focus(); });
  $("printBtn").addEventListener("click", function () {
    if (!lastReceiptText) return;
    window.print();
  });
  $("copyBtn").addEventListener("click", function () {
    var st = $("copyStatus");
    function fallback() {
      var r = document.createRange(); r.selectNodeContents($("receipt")); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      st.textContent = "Struk terpilih. Tekan Ctrl+C untuk menyalin.";
    }
    try { navigator.clipboard.writeText(lastReceiptText).then(function () { st.textContent = "Struk tersalin."; }, fallback); } catch (e) { fallback(); }
  });
  $("histList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-view]"); if (!b) return;
    showReceipt(history[+b.dataset.view]);
  });
  var armed = false, armTimer;
  $("clearHist").addEventListener("click", function () {
    var b = this;
    if (!armed) { armed = true; b.textContent = "Ketuk lagi untuk menghapus"; armTimer = setTimeout(function () { armed = false; b.textContent = "Hapus riwayat"; }, 4000); return; }
    clearTimeout(armTimer); armed = false; b.textContent = "Hapus riwayat"; history = []; save("kasir.history", history); renderHistory();
  });

  /* ---------- kelola menu ---------- */
  var editIdx = -1, filterCat = "Semua", delArm = -1, delT, resetArmed = false, resetT;
  function renderManage() { var q = $("mSearch").value.trim().toLowerCase(), h = "";
    menu.forEach(function (m, i) {
      if (filterCat !== "Semua" && m.cat !== filterCat) return;
      if (q && m.name.toLowerCase().indexOf(q) < 0) return;
      if (i === editIdx) {
        h += '<li class="mrow editing"><div class="medit">' +
          '<div class="f-name"><label for="eName">Nama</label><input type="text" id="eName" maxlength="40" value="' + esc(m.name) + '"></div>' +
          '<div><label for="ePrice">Harga (Rp)</label><input type="text" class="mono" id="ePrice" inputmode="numeric" value="' + fmt.format(m.price) + '"></div>' +
          '<div><label for="eCat">Kategori</label><select id="eCat">' + CATS.map(function (c) { return "<option" + (c === m.cat ? " selected" : "") + ">" + c + "</option>"; }).join("") + '</select></div></div>' +
          '<p class="err" id="eErr" role="alert"></p>' +
          '<div class="row-actions" style="margin-top:6px"><button type="button" class="small primary" data-save="' + i + '">Simpan</button><button type="button" class="small" data-cancel="1">Batal</button></div></li>';
      } else {
        h += '<li class="mrow"><span class="dot" style="--h:' + CAT_HUE[m.cat] + '"></span><div class="minfo"><b>' + esc(m.name) + '</b><small>' + m.cat + '</small></div>' +
          '<span class="mprice">' + rp(m.price) + '</span>' +
          '<div class="mbtns"><button type="button" class="small" data-edit="' + i + '">Edit</button><button type="button" class="small ghost danger" data-rm="' + i + '">Hapus</button></div></li>';
      }
    });
    $("manageList").innerHTML = h || '<li style="display:block;padding:12px"><div class="empty">Tidak ada menu yang cocok.</div></li>';
  }
  function disarm() {
    if (delArm >= 0) { var b = $("manageList").querySelector('[data-rm="' + delArm + '"]'); if (b) b.textContent = "Hapus"; }
    delArm = -1; clearTimeout(delT);
  }
  $("manageList").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.edit != null) {
      disarm(); editIdx = +b.dataset.edit; renderManage();
      var f = $("eName"); if (f) { f.focus(); f.select(); }
    } else if (b.dataset.cancel != null) {
      editIdx = -1; renderManage();
    } else if (b.dataset.save != null) {
      var i = +b.dataset.save, name = $("eName").value.trim(), price = num($("ePrice").value), cat = $("eCat").value;
      if (!name) { $("eErr").textContent = "Isi nama menu dulu."; return; }
      if (price <= 0) { $("eErr").textContent = "Isi harga dengan angka lebih dari 0."; return; }
      if (menu.some(function (m, j) { return j !== i && m.name.toLowerCase() === name.toLowerCase(); })) { $("eErr").textContent = "Menu dengan nama itu sudah ada."; return; }
      menu[i] = { name: name, price: price, cat: cat }; save("kasir.menu", menu);
      editIdx = -1; renderMenu(); renderManage(); toast(name + " diperbarui");
    } else if (b.dataset.rm != null) {
      var k = +b.dataset.rm;
      if (delArm === k) {
        var nm = menu[k].name; disarm(); menu.splice(k, 1); save("kasir.menu", menu);
        if (editIdx === k) editIdx = -1; else if (editIdx > k) editIdx--;
        renderMenu(); renderManage(); toast(nm + " dihapus");
      } else {
        disarm(); delArm = k; b.textContent = "Yakin hapus?"; delT = setTimeout(disarm, 3000);
      }
    }
  });
  $("manageList").addEventListener("input", function (e) {
    if (e.target.id === "ePrice") { var n = num(e.target.value); e.target.value = n ? fmt.format(n) : ""; }
  });
  $("manageList").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.closest(".editing")) return;
    e.preventDefault(); var sv = $("manageList").querySelector("[data-save]"); if (sv) sv.click();
  });
  $("mSearch").addEventListener("input", function () { editIdx = -1; disarm(); renderManage(); });
  $("mFilter").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return;
    filterCat = b.dataset.f; editIdx = -1; disarm();
    $("mFilter").querySelectorAll("[data-f]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    renderManage();
  });
  $("resetMenu").addEventListener("click", function () {
    var b = this;
    if (!resetArmed) { resetArmed = true; b.textContent = "Ketuk lagi untuk mengembalikan"; resetT = setTimeout(function () { resetArmed = false; b.textContent = "Kembalikan menu contoh"; }, 4000); return; }
    clearTimeout(resetT); resetArmed = false; b.textContent = "Kembalikan menu contoh";
    menu = JSON.parse(JSON.stringify(defaultMenu)); save("kasir.menu", menu); editIdx = -1; renderMenu(); renderManage(); toast("Menu contoh dikembalikan");
  });

  /* ---------- laporan & ekspor ---------- */
  var repKind = "Harian", dl = null, dlState = "loading";
  function browserDownloadApi() {
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof document === "undefined") return null;
    return {
      save: function (spec) {
        return new Promise(function (resolve, reject) {
          try {
            var bytes = spec.data instanceof Blob ? spec.data : new Blob([spec.data], { type: spec.type || "application/octet-stream" });
            var url = URL.createObjectURL(bytes);
            var a = document.createElement("a");
            a.href = url;
            a.download = spec.filename || "download";
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              resolve();
            }, 150);
          } catch (e) { reject(e); }
        });
      }
    };
  }
  var LABEL_HEAD = { Harian: ["Tanggal", "Hari"], Mingguan: ["Minggu", "Mulai", "Sampai"], Bulanan: ["Bulan", "Nama bulan"] };
  var METRIC_HEAD = ["Jumlah transaksi", "Barang terjual", "Subtotal (Rp)", "Diskon (Rp)", "Total pendapatan (Rp)", "Tunai (Rp)", "QRIS (Rp)", "Transfer (Rp)", "Rata-rata per transaksi (Rp)"];
  function p2(n) { return ("0" + n).slice(-2); }
  function ymd(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function hm(d) { return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function dshort(d) { return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }); }
  function periodMeta(kind, d) {
    if (kind === "Harian") {
      return { key: ymd(d), cols: [ymd(d), d.toLocaleDateString("id-ID", { weekday: "long" })],
        disp: d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) };
    }
    if (kind === "Mingguan") {
      var year = d.getFullYear();
      var month = d.getMonth();
      var day = d.getDate();
      var week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
      var firstDay = 1 + ((week - 1) * 7);
      var lastDay = week === 4 ? new Date(year, month + 1, 0).getDate() : firstDay + 6;
      var start = new Date(year, month, firstDay);
      var end = new Date(year, month, lastDay);
      var key = year + "-" + p2(month + 1) + "-W" + p2(week);
      return {
        key: key,
        cols: ["Minggu " + week + " " + start.toLocaleDateString("id-ID", { month: "short", year: "numeric" }), ymd(start), ymd(end)],
        disp: "Minggu " + week + " " + start.toLocaleDateString("id-ID", { month: "short", year: "numeric" }) + " (" + start.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) + " - " + end.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) + ")"
      };
    }
    var nm = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }), mk = d.getFullYear() + "-" + p2(d.getMonth() + 1);
    return { key: mk, cols: [mk, nm], disp: nm };
  }
  function qtyOf(t) { return t.items.reduce(function (s, c) { return s + c.qty; }, 0); }
  function aggregate(kind) {
    var map = {};
    history.forEach(function (t) {
      var m = periodMeta(kind, new Date(t.time));
      var g = map[m.key] || (map[m.key] = { meta: m, n: 0, qty: 0, sub: 0, disc: 0, tot: 0, Tunai: 0, QRIS: 0, Transfer: 0 });
      g.n++; g.qty += qtyOf(t); g.sub += t.subtotal; g.disc += t.discount; g.tot += t.total;
      g[t.method] = (g[t.method] || 0) + t.total;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }
  function sumRows(rows) {
    var z = { n: 0, qty: 0, sub: 0, disc: 0, tot: 0, Tunai: 0, QRIS: 0, Transfer: 0 };
    rows.forEach(function (g) { for (var k in z) z[k] += g[k]; });
    return z;
  }
  function metricCells(g) { return [g.n, g.qty, g.sub, g.disc, g.tot, g.Tunai, g.QRIS, g.Transfer, g.n ? Math.round(g.tot / g.n) : 0]; }
  function sortedTx() { return history.slice().sort(function (a, b) { return a.time - b.time; }); }
  function buildReport(name) {
    var out;
    if (LABEL_HEAD[name]) {
      var rows = aggregate(name), lh = LABEL_HEAD[name], pad = ["TOTAL"];
      out = [lh.concat(METRIC_HEAD)];
      rows.forEach(function (g) { out.push(g.meta.cols.concat(metricCells(g))); });
      while (pad.length < lh.length) pad.push("");
      out.push(pad.concat(metricCells(sumRows(rows))));
      return out;
    }
    if (name === "Transaksi") {
      out = [["No. nota", "Tanggal", "Jam", "Jumlah barang", "Subtotal (Rp)", "Diskon (Rp)", "Total (Rp)", "Metode", "Dibayar (Rp)", "Kembalian (Rp)"]];
      sortedTx().forEach(function (t) { var d = new Date(t.time); out.push([t.no, ymd(d), hm(d), qtyOf(t), t.subtotal, t.discount, t.total, t.method, t.paid, t.change]); });
      return out;
    }
    if (name === "Penutupan") {
      out = [["Tanggal", "Penjualan hari ini (Rp)", "Pemasukan tambahan (Rp)", "Pengeluaran (Rp)", "Kas akhir (Rp)", "Sisa stok hari ini", "Catatan"]];
      var closings = load("kasir.closing", []).slice().sort(function (a, b) { return a.date - b.date; });
      closings.forEach(function (c) {
        var stockText = Array.isArray(c.stockSnapshot) && c.stockSnapshot.length ? c.stockSnapshot.map(function (item) { return item.name + ": " + (Number(item.stock) || 0) + " unit"; }).join(" | ") : "-";
        out.push([new Date(c.date).toLocaleDateString("id-ID"), c.sales, c.income, c.expense, c.finalCash, stockText, c.note || "-"]);
      });
      return out;
    }
    if (name === "Detail Barang") {
      out = [["No. nota", "Tanggal", "Jam", "Barang", "Harga satuan (Rp)", "Jumlah", "Subtotal barang (Rp)", "Metode"]];
      sortedTx().forEach(function (t) {
        var d = new Date(t.time);
        t.items.forEach(function (c) { out.push([t.no, ymd(d), hm(d), c.name, c.price, c.qty, c.price * c.qty, t.method]); });
      });
      return out;
    }
    var by = {};
    history.forEach(function (t) {
      t.items.forEach(function (c) {
        var k = c.name.toLowerCase(), g = by[k] || (by[k] = { name: c.name, qty: 0, rev: 0 });
        g.qty += c.qty; g.rev += c.qty * c.price;
      });
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.qty - a.qty || b.rev - a.rev; });
    out = [["Barang", "Jumlah terjual", "Pendapatan sebelum diskon (Rp)"]];
    list.forEach(function (g) { out.push([g.name, g.qty, g.rev]); });
    return out;
  }
  function toCSV(aoa, sep, bom) {
    return (bom ? "﻿" : "") + aoa.map(function (r) {
      return r.map(function (c) {
        var v = c == null ? "" : String(c);
        if (typeof c === "string" && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
        return (v.indexOf(sep) >= 0 || /["\r\n]/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(sep);
    }).join("\r\n");
  }
  function colWidths(aoa) {
    var w = [];
    aoa.forEach(function (r) { r.forEach(function (c, i) { var l = String(c == null ? "" : c).length; if (!w[i] || l > w[i]) w[i] = l; }); });
    var presets = [18, 14, 16, 16, 16, 16, 14, 14, 14, 15, 15, 15, 15, 15, 18, 18, 18, 18, 18, 18, 16];
    return w.map(function (x, i) { return { wch: Math.min(30, Math.max(presets[i] || 12, x + 2)) }; });
  }
  function applySpreadsheetStyle(ws, aoa) {
    if (!ws || !aoa || !aoa.length) return ws;
    var range = XLSX.utils.decode_range(ws["!ref"] || "A1:" + XLSX.utils.encode_cell({ r: aoa.length - 1, c: Math.max(0, aoa[0].length - 1) }));
    var headerFill = { patternType: "solid", fgColor: { rgb: "A7E08B" }, bgColor: { rgb: "A7E08B" } };
    var totalFill = { patternType: "solid", fgColor: { rgb: "E76F6F" }, bgColor: { rgb: "E76F6F" } };
    var altFill = { patternType: "solid", fgColor: { rgb: "F5F7F5" }, bgColor: { rgb: "F5F7F5" } };
    var border = { top: { style: "thin", color: { rgb: "C7D3C9" } }, bottom: { style: "thin", color: { rgb: "C7D3C9" } }, left: { style: "thin", color: { rgb: "C7D3C9" } }, right: { style: "thin", color: { rgb: "C7D3C9" } } };
    for (var row = range.s.r; row <= range.e.r; row++) {
      for (var col = range.s.c; col <= range.e.c; col++) {
        var cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) continue;
        var style = {
          font: { name: "Calibri", sz: 10, color: { rgb: "000000" } },
          fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" }, bgColor: { rgb: "FFFFFF" } },
          border: border,
          alignment: { vertical: "center", horizontal: "left", wrapText: false }
        };
        if (row === 0) {
          style.fill = headerFill;
          style.font.bold = true;
          style.font.color = { rgb: "1E2F24" };
          style.alignment.horizontal = "center";
        } else if (row === range.e.r) {
          style.fill = totalFill;
          style.font.bold = true;
          style.font.color = { rgb: "FFFFFF" };
        } else if ((row + col) % 2 === 0) {
          style.fill = altFill;
        }
        if (typeof cell.v === "number") {
          style.numFmt = "#,##0";
          style.alignment.horizontal = "right";
        }
        cell.s = style;
      }
    }
    ws["!cols"] = colWidths(aoa);
    ws["!rows"] = aoa.map(function () { return { hpx: 22 }; });
    ws["!autofilter"] = { ref: "A1:" + XLSX.utils.encode_cell({ r: range.e.r, c: range.e.c }) };
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", frozen: true };
    return ws;
  }
  function setExpStatus(m) { $("expStatus").textContent = m; }
  function dlError(e) {
    var c = e && e.code;
    if (c === "declined") return "Unduhan dibatalkan.";
    if (c === "rate_limited") return "Masih ada permintaan unduhan yang terbuka. Tunggu sebentar lalu coba lagi.";
    if (c === "too_large") return "File terlalu besar untuk disimpan.";
    return "Unduhan gagal. Coba lagi, atau pakai Unduh CSV.";
  }
  function updateReport() {
    var tbl = $("repTable"); if (!tbl) return;
    var rows = aggregate(repKind), has = rows.length > 0, ok = dlState === "ok";
    $("expXlsx").disabled = !has || !ok; $("expCopy").hidden = dlState !== "none";
    if (dlState === "none") setExpStatus("Unduhan file tidak tersedia di tampilan ini. Pakai Salin tabel, lalu tempel di Excel atau Google Sheets.");
    if (!has) { tbl.innerHTML = ""; $("repNote").textContent = "Belum ada transaksi untuk dilaporkan. Laporan terisi setelah ada pembayaran."; return; }
    var shown = rows.slice().sort(function (a, b) { return a.meta.key.localeCompare(b.meta.key); }).slice(0, 12), tot = sumRows(rows);
    function cells(g) { return '<td class="num">' + g.n + '</td><td class="num">' + g.qty + '</td><td class="num">' + rp(g.tot) + '</td><td class="num">' + rp(g.Tunai) + '</td><td class="num">' + rp(g.QRIS) + '</td><td class="num">' + rp(g.Transfer) + '</td>'; }
    var h = '<thead><tr><th>Periode</th><th class="num">Trx</th><th class="num">Barang</th><th class="num">Total</th><th class="num">Tunai</th><th class="num">QRIS</th><th class="num">Transfer</th></tr></thead><tbody>';
    shown.forEach(function (g) { h += '<tr><td>' + esc(g.meta.disp) + '</td>' + cells(g) + '</tr>'; });
    h += '</tbody><tfoot><tr><td>Semua periode</td>' + cells(tot) + '</tr></tfoot>';
    tbl.innerHTML = h;
    $("repNote").textContent = rows.length > shown.length ? "Menampilkan " + shown.length + " dari " + rows.length + " periode. File unduhan memuat semuanya." : "";
  }
  function exportXlsx() {
    if (!dl) return;
    if (typeof XLSX === "undefined") { setExpStatus("Pustaka Excel gagal dimuat. Muat ulang halaman, atau pakai Unduh CSV."); return; }
    var wb = XLSX.utils.book_new();
    ["Harian", "Mingguan", "Bulanan", "Transaksi", "Detail Barang", "Per Barang", "Penutupan"].forEach(function (nm) {
      var aoa = buildReport(nm), ws = XLSX.utils.aoa_to_sheet(aoa);
      Object.keys(ws).forEach(function (a) { if (a.charAt(0) !== "!" && ws[a].t === "n") ws[a].z = "#,##0"; });
      applySpreadsheetStyle(ws, aoa);
      XLSX.utils.book_append_sheet(wb, ws, nm);
    });
    var data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    dl.save({ filename: "laporan-kasir-" + ymd(new Date()) + ".xlsx", data: data }).then(
      function () { setExpStatus("File Excel tersimpan dengan tabel berwarna dan garis."); toast("Laporan Excel diunduh"); },
      function (e) { setExpStatus(dlError(e)); });
  }
  function copyTable() {
    var text = toCSV(buildReport(repKind), "\t", false);
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); setExpStatus(ok ? "Tabel tersalin. Tempel di Excel atau Google Sheets." : "Tabel tidak bisa disalin otomatis.");
    }
    try { navigator.clipboard.writeText(text).then(function () { setExpStatus("Tabel tersalin. Tempel di Excel atau Google Sheets."); }, fallback); } catch (e) { fallback(); }
  }
  $("repTabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-r]"); if (!b) return;
    repKind = b.dataset.r;
    $("repTabs").querySelectorAll("[data-r]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    updateReport();
  });
  $("expXlsx").addEventListener("click", exportXlsx);
  $("expCopy").addEventListener("click", copyTable);
  (function () {
    function done(m) { dl = m || null; dlState = dl ? "ok" : "none"; updateReport(); }
    try {
      var cl = window.claude;
      if (cl && typeof cl.use === "function") {
        cl.use("downloads").then(done, function () { done(browserDownloadApi()); });
      } else {
        done(browserDownloadApi());
      }
    } catch (e) { done(browserDownloadApi()); }
  })();

  $("openManageMenuBtn").addEventListener("click", function () {
    window.location.assign(new URL("menu.html", document.baseURI).href);
  });

  function tick() {
    var d = new Date();
    $("clockV").textContent = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) + " · " +
      d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  }
  tick(); setInterval(tick, 15000);

  renderMenu(); renderManage(); renderPantryList(); renderClosingStockSummary(); renderCart(); renderHistory(); renderQrisStatus();
})();
