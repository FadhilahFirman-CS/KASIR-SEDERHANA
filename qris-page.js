(function () {
  "use strict";
  var auth, qrisValue = "", input = document.getElementById("qrisInput"), status = document.getElementById("qrisStatus");
  var client = window.supabaseClient;
  async function initAuth() {
    var result = await client.auth.getUser(), user = result.data && result.data.user;
    if (!user) { window.location.href = "index.html"; return null; }
    var profile = await client.from("store_profiles").select("local_id,name,username").eq("auth_user_id", user.id).maybeSingle();
    auth = profile.data || { local_id: user.id, username: user.email, name: "Kasir Warung" }; auth.authId = user.id; return user;
  }
  function syncRemote(value) {
    if (!window.supabaseClient) return;
    var client = window.supabaseClient;
    client.auth.getUser().then(function (sessionResult) {
      var user = sessionResult.data && sessionResult.data.user;
      if (!user) throw new Error("Sesi Supabase tidak aktif. Login kembali sebelum menyimpan QRIS.");
      return client.from("stores").upsert({ id: user.id, name: auth.name || auth.username || "Kasir Warung", username: auth.username || user.email }, { onConflict: "id" })
        .then(function (storeResult) {
          if (storeResult.error) throw storeResult.error;
          return client.from("qris_settings").upsert({ store_id: user.id, payload: value, updated_at: new Date().toISOString() }, { onConflict: "store_id" });
        });
    }).then(function (result) {
      if (result && result.error) throw result.error;
      status.textContent = "QRIS tersimpan di Supabase dan terhubung ke dashboard.";
    }).catch(function (error) {
      status.textContent = "QRIS gagal disimpan ke Supabase: " + (error.message || error);
    });
  }
  function crc16(text) {
    var crc = 0xffff;
    for (var i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  }

  function parseTLV(text) {
    var index = 0, items = [];
    while (index < text.length) {
      if (index + 4 > text.length) return null;
      var tag = text.substr(index, 2), length = parseInt(text.substr(index + 2, 2), 10);
      if (!/^\d{2}$/.test(tag) || isNaN(length) || index + 4 + length > text.length) return null;
      items.push([tag, text.substr(index + 4, length)]); index += 4 + length;
    }
    return items;
  }

  function validate(raw) {
    var text = String(raw || "").replace(/[\r\n\t]+/g, "").trim();
    if (!text) return { ok: false, msg: "Kode QRIS masih kosong." };
    if (/^https?:\/\//i.test(text)) return { ok: false, msg: "Yang terbaca adalah tautan, bukan kode QRIS mentah." };
    var start = text.indexOf("000201");
    if (start < 0) return { ok: false, msg: "Kode QRIS harus mengandung 000201." };
    text = text.slice(start);
    var pattern = /6304[0-9A-Fa-f]{4}/g, match, badCrc = false;
    while ((match = pattern.exec(text)) !== null) {
      var candidate = text.slice(0, match.index + 8), items = parseTLV(candidate);
      if (!items || items[0][0] !== "00" || items[items.length - 1][0] !== "63") continue;
      if (crc16(candidate.slice(0, -4)) !== items[items.length - 1][1].toUpperCase()) { badCrc = true; continue; }
      return { ok: true, clean: candidate };
    }
    return { ok: false, msg: badCrc ? "CRC kode QRIS tidak cocok. Unggah gambar atau salin ulang kode QRIS utuh." : "Format kode QRIS tidak valid." };
  }

  function render() {
    input.value = qrisValue;
    if (!qrisValue) status.textContent = "Belum disetel. Tempel kode QRIS yang diawali 000201.";
    else status.textContent = validate(qrisValue).ok ? "QRIS berhasil tersimpan dan otomatis terhubung ke dashboard kasir." : "QRIS tersimpan, tetapi format belum tervalidasi. Silakan uji scan di kasir.";
  }

  document.getElementById("qrisSave").onclick = function () {
    status.textContent = "Menyimpan QRIS... Jika berhasil tersimpan, QRIS akan otomatis terhubung ke dashboard kasir.";
    var result = validate(input.value);
    if (!input.value.trim()) { status.textContent = "Kode QRIS masih kosong."; return; }
    var savedValue = result.ok ? result.clean : input.value.replace(/[\r\n\t]+/g, "").trim();
    qrisValue = savedValue;
    syncRemote(savedValue);
    render();
  };
  document.getElementById("qrisClear").onclick = async function () { qrisValue = ""; await client.from("qris_settings").delete().eq("store_id", auth.authId); render(); };
  document.getElementById("backBtn").onclick = function () { window.location.href = "index.html"; };
  document.getElementById("qrisFile").onchange = function () {
    var file = this.files && this.files[0]; if (!file || typeof jsQR !== "function") return;
    status.textContent = "Membaca dan menyimpan QRIS... Jika berhasil tersimpan, QRIS akan otomatis terhubung ke dashboard kasir.";
    var reader = new FileReader();
    reader.onload = function () {
      var image = new Image();
      image.onload = function () {
        var result = null;
        [1400, 1000, 700, 500].some(function (maxSize) {
          var scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          var canvas = document.createElement("canvas"), context = canvas.getContext("2d");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
          return !!result;
        });
        if (!result) { status.textContent = "QR tidak terbaca. Gunakan gambar yang lebih jelas."; return; }
        input.value = result.data;
        var checked = validate(result.data);
        var savedValue = checked.ok ? checked.clean : result.data.replace(/[\r\n\t]+/g, "").trim();
        qrisValue = savedValue;
        syncRemote(savedValue);
        render();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  initAuth().then(async function () {
    document.getElementById("storeName").textContent = "Toko: " + (auth.username || "Kasir Warung");
    var result = await client.from("qris_settings").select("payload").eq("store_id", auth.authId).maybeSingle();
    qrisValue = result.data ? result.data.payload : ""; render();
  }).catch(function (error) { status.textContent = error.message || "Gagal memuat QRIS."; });
}());
