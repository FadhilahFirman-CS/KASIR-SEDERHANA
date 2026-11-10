(function () {
  "use strict";
  var storage = window.supabaseClient;
  var user;
  var menus = [];
  var list = document.getElementById("list");
  var search = document.getElementById("search");
  var format = new Intl.NumberFormat("id-ID");

  function localMenuKey() {
    return "kasir.demo." + user.id + ".menu";
  }

  function readLocalMenus() {
    try {
      var saved = JSON.parse(localStorage.getItem(localMenuKey()));
      return Array.isArray(saved) ? saved.map(function (item) {
        return { id: item.id || "local-" + Math.random().toString(36).slice(2), name: item.name, price: Number(item.price) || 0, category: item.category || item.cat || "Makanan" };
      }) : [];
    } catch (e) { return []; }
  }

  function writeLocalMenus(items) {
    try {
      localStorage.setItem(localMenuKey(), JSON.stringify(items.map(function (item) {
        return { id: item.id, name: item.name, price: Number(item.price) || 0, cat: item.category || item.cat || "Makanan" };
      })));
    } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function render() {
    var query = search.value.trim().toLowerCase();
    var filtered = menus.filter(function (item) {
      return !query || String(item.name).toLowerCase().indexOf(query) >= 0;
    });
    list.innerHTML = filtered.map(function (item) {
      return '<li class="mrow"><span class="dot"></span><div class="minfo"><b>' + escapeHtml(item.name) + '</b><small>' + escapeHtml(item.category) + '</small></div><span class="mprice">Rp ' + format.format(item.price) + '</span><div class="mbtns"><button class="small" data-edit="' + item.id + '">Edit</button><button class="small ghost danger" data-delete="' + item.id + '">Hapus</button></div></li>';
    }).join("") || '<li style="display:block;padding:12px"><div class="empty">Tidak ada menu.</div></li>';
  }

  async function loadMenus() {
    user = window.demoSession ? window.demoSession() : null;
    if (!user) user = { id: "demo-local", email: "demo@local" };
    await storage.from("stores").upsert({ id: user.id, name: user.email, username: user.email });
    menus = readLocalMenus();
    if (!menus.length) {
      var result = await storage.from("menus").select("id,name,price,category").eq("store_id", user.id).order("created_at", { ascending: true });
      if (result.error) throw result.error;
      menus = result.data || [];
      writeLocalMenus(menus);
    }
    render();
  }

  document.getElementById("menuForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var name = document.getElementById("name");
    var price = document.getElementById("price");
    var error = document.getElementById("err");
    var value = parseInt(price.value.replace(/\D/g, ""), 10);
    if (!name.value.trim() || !value) { error.textContent = "Nama dan harga wajib diisi."; return; }
    var result = await storage.from("menus").insert({ store_id: user.id, name: name.value.trim(), price: value, category: document.getElementById("cat").value });
    if (result.error) { error.textContent = result.error.message; return; }
    menus.push({ id: result.data && result.data[0] ? result.data[0].id : "local-" + Date.now(), name: name.value.trim(), price: value, category: document.getElementById("cat").value });
    writeLocalMenus(menus);
    name.value = ""; price.value = "";
    await loadMenus();
  });

  list.addEventListener("click", async function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    var id = button.dataset.edit || button.dataset.delete;
    if (button.dataset.delete) {
      await storage.from("menus").delete().eq("id", id).eq("store_id", user.id);
      menus = menus.filter(function (entry) { return entry.id !== id; });
      writeLocalMenus(menus);
      await loadMenus();
      return;
    }
    var item = menus.find(function (entry) { return entry.id === id; });
    if (!item) return;
    var name = prompt("Nama menu:", item.name);
    var price = prompt("Harga menu (Rp):", item.price);
    var category = prompt("Kategori:", item.category);
    if (name === null || price === null) return;
    await storage.from("menus").update({ name: name.trim(), price: parseInt(price.replace(/\D/g, ""), 10), category: (category || item.category).trim() }).eq("id", id).eq("store_id", user.id);
    item.name = name.trim();
    item.price = parseInt(price.replace(/\D/g, ""), 10) || item.price;
    item.category = (category || item.category).trim();
    writeLocalMenus(menus);
    await loadMenus();
  });

  search.addEventListener("input", render);
  document.getElementById("reset").addEventListener("click", async function () {
    await storage.from("menus").delete().eq("store_id", user.id);
    menus = [];
    writeLocalMenus(menus);
    await loadMenus();
  });
  document.getElementById("backBtn").addEventListener("click", function () { window.location.href = "index.html"; });
  loadMenus().catch(function (error) { document.getElementById("err").textContent = error.message || "Gagal memuat menu."; });
}());
