(function () {
  "use strict";
  var auth, last = "";
  try { auth = JSON.parse(localStorage.getItem("kasir.currentStore") || "null"); } catch (e) { auth = null; }
  if (!auth || !auth.id || !window.supabaseClient) return;
  setInterval(function () {
    var value = localStorage.getItem("kasir.store." + auth.id + ".menu");
    if (!value || value === last) return;
    last = value;
    try {
      var items = JSON.parse(value);
      window.supabaseClient.from("store_data").upsert({ store_id: String(auth.id), data_key: "menu", data: items, updated_at: new Date().toISOString() })
        .then(function () { return window.supabaseClient.auth.getUser(); })
        .then(function (sessionResult) {
        var user = sessionResult.data && sessionResult.data.user;
        if (!user) return;
        return window.supabaseClient.from("stores").upsert({ id: user.id, name: auth.username || "Kasir Warung", username: auth.username || user.email }, { onConflict: "id" })
          .then(function () { return window.supabaseClient.from("menus").delete().eq("store_id", user.id); })
          .then(function () { return window.supabaseClient.from("menus").insert(items.map(function (item) { return { store_id: user.id, name: item.name, price: item.price, category: item.cat || "Makanan" }; })); })
          .then(function () {});
      }).then(function () {}, function () {});
    } catch (e) {}
  }, 500);
}());
