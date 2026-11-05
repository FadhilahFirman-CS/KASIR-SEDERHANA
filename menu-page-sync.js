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
      window.supabaseClient.from("store_data").upsert({ store_id: String(auth.id), data_key: "menu", data: JSON.parse(value), updated_at: new Date().toISOString() }, { onConflict: "store_id,data_key" }).catch(function () {});
    } catch (e) {}
  }, 500);
}());
