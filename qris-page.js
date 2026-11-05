(function () {
  "use strict";
  var auth, input = document.getElementById("qrisInput"), status = document.getElementById("qrisStatus");
  try { auth = JSON.parse(localStorage.getItem("kasir.currentStore") || "null"); } catch (e) { auth = null; }
  if (!auth || !auth.id) { window.location.href = "index.html"; return; }
  var key = "kasir.store." + auth.id + ".qris";
  function syncRemote(value) {
    if (!window.supabaseClient) return;
    window.supabaseClient.from("store_data").upsert({ store_id: String(auth.id), data_key: "qris", data: value, updated_at: new Date().toISOString() }, { onConflict: "store_id,data_key" }).then(function () {}, function () {});
  }
  document.getElementById("storeName").textContent = "Toko: " + (auth.username || "Kasir Warung");

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
    var value = localStorage.getItem(key) || "";
    input.value = value;
    if (!value) status.textContent = "Belum disetel. Tempel kode QRIS yang diawali 000201.";
    else status.textContent = validate(value).ok ? "QRIS berhasil tersimpan dan otomatis terhubung ke dashboard kasir." : "QRIS tersimpan, tetapi format belum tervalidasi. Silakan uji scan di kasir.";
  }

  document.getElementById("qrisSave").onclick = function () {
    status.textContent = "Menyimpan QRIS... Jika berhasil tersimpan, QRIS akan otomatis terhubung ke dashboard kasir.";
    var result = validate(input.value);
    if (!input.value.trim()) { status.textContent = "Kode QRIS masih kosong."; return; }
    var savedValue = result.ok ? result.clean : input.value.replace(/[\r\n\t]+/g, "").trim();
    localStorage.setItem(key, savedValue);
    localStorage.setItem("kasir.qris", savedValue);
    syncRemote(savedValue);
    render();
  };
  document.getElementById("qrisClear").onclick = function () { localStorage.removeItem(key); render(); };
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
        localStorage.setItem(key, savedValue);
        localStorage.setItem("kasir.qris", savedValue);
        syncRemote(savedValue);
        render();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  render();
}());
