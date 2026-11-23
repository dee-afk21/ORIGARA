/* =====================================================================
   Origara v0.4 — sertifikat & alat cetak bersama.
   Dipakai oleh index.html (pratinjau di Pengaturan, cetak dari Cek QR) dan
   verifikasi.html (portal klien). Tidak bergantung pada skrip lain.

   COA_CERT.html(template, data, aset)  -> HTML satu halaman A4 mendatar
   COA_CERT.qrSvg(teks)                 -> <svg> QR code (butuh COA_CERT.loadQR() dulu)
   COA_PRINT.open(judul, halaman[], css, opsi) -> jendela cetak / simpan PDF
   ===================================================================== */
(function () {
  'use strict';
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const abs = u => { try { return u ? new URL(u, document.baseURI).href : ''; } catch (x) { return u || ''; } };
  /** 2026-05-06 -> 06/05/2026 */
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const color = (v, d) => /^#[0-9a-f]{3,8}$/i.test(v || '') ? v : d;

  let qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    return qrLoading || (qrLoading = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = QR_LIB; s.onload = ok;
      s.onerror = () => { qrLoading = null; no(new Error('Gagal memuat pembuat QR. Periksa koneksi internet.')); };
      document.head.appendChild(s);
    }));
  }
  /** QR berkoreksi tinggi (H) supaya tetap terbaca walau di tengahnya ada logo. */
  function qrSvg(text, fill) {
    if (!window.qrcode || !text) return '';
    const q = window.qrcode(0, 'H');
    q.addData(String(text)); q.make();
    const n = q.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${path}" fill="${fill || '#000'}"/></svg>`;
  }

  /** Nilai isian sertifikat dari data produk. */
  function values(d) {
    return {
      nama_perusahaan: d.namaPerusahaan, deskripsi: d.deskripsi, serial: d.serial, batch: d.batch, pelanggan: d.pelanggan,
      no_po: d.noPO, tgl_po: dmy(d.tglPO), warna: d.warna, ukuran: d.ukuran, tgl_produksi: dmy(d.tglProduksi),
      tgl_kirim: dmy(d.tglKirim) || '-', tgl_terbit: dmy(d.tglTerbit)
    };
  }
  const fill = (text, v) => e(text).replace(/\{([a-z_]+)\}/g, (m, k) => (k in v ? e(v[k]) : m));

  const CSS = `
    @page { size: A4 landscape; margin: 0; }
    .cert { position: relative; width: 297mm; height: 210mm; overflow: hidden; font-family: Arial, Helvetica, sans-serif; color: #1d1d1d;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    .cert * { box-sizing: border-box; }
    .cert .wm { position: absolute; inset: 0; background-size: 17mm 17mm; background-repeat: repeat; opacity: .06; }
    .cert .strip { position: absolute; left: 7mm; top: 0; width: 6.6mm; height: 77mm; }
    .cert .band { position: absolute; left: 13.5mm; top: 0; bottom: 0; width: 31mm; }
    .cert .tri1 { position: absolute; right: 0; top: 0; width: 103mm; height: 34mm; clip-path: polygon(0 0, 100% 0, 100% 100%, 90% 100%, 4% 13%, 0 13%); }
    .cert .tri2 { position: absolute; right: 0; top: 0; width: 43mm; height: 30mm; clip-path: polygon(0 0, 100% 0, 100% 100%); }
    .cert .foot1 { position: absolute; left: 44.5mm; right: 0; bottom: 3mm; height: 4.5mm; }
    .cert .foot2 { position: absolute; left: 0; right: 0; bottom: 0; height: 3mm; }
    .cert .qr { position: absolute; left: 15.5mm; top: 3mm; width: 27mm; height: 27mm; background: #fff; border-radius: 2.5mm; padding: 1.2mm; }
    .cert .qr svg, .cert .qr2 svg { width: 100%; height: 100%; display: block; }
    .cert .qr .lg, .cert .qr2 .lg { position: absolute; left: 50%; top: 50%; width: 24%; height: 24%; transform: translate(-50%, -50%); background: #fff; border-radius: 50%; padding: 2%; }
    .cert .qr .lg img, .cert .qr2 .lg img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .cert .comp { position: absolute; left: 47.5mm; top: 9mm; font: bold 4.6mm Georgia, 'Times New Roman', serif; }
    .cert .title { position: absolute; left: 44.5mm; right: 0; top: 21mm; text-align: center; font-weight: 800; font-size: 10.6mm; letter-spacing: .1mm; }
    .cert .open { position: absolute; left: 48mm; top: 40mm; font-size: 4.2mm; }
    .cert .prod { position: absolute; left: 50mm; right: 6mm; top: 53mm; text-align: center; font-weight: 800; font-size: 6.6mm; line-height: 1.2; }
    .cert .bar { position: absolute; left: 90mm; width: 164mm; top: 68mm; height: 1.6mm; }
    .cert .para { position: absolute; left: 69mm; right: 30mm; top: 75mm; font-size: 4.2mm; line-height: 1.3; }
    .cert .para p { margin: 0 0 3.2mm; }
    .cert .fields { position: absolute; left: 69mm; right: 12mm; top: 110mm; display: grid; grid-template-columns: 136mm 1fr; column-gap: 0; }
    .cert .col { display: grid; row-gap: 3.6mm; align-content: start; }
    .cert .fld { display: flex; align-items: center; gap: 3mm; font-size: 4.2mm; white-space: nowrap; }
    .cert .fld::before { content: ''; width: 20mm; height: .8mm; flex: none; background: var(--c1); }
    .cert .sign { position: absolute; left: 69mm; width: 48mm; top: 154mm; text-align: center; font-size: 2.8mm; line-height: 1.35; }
    .cert .sign .ln { border-top: .25mm solid #555; margin: .6mm 0; }
    .cert .qr2 { position: relative; width: 12mm; height: 12mm; margin: 2.2mm auto 1mm; }
    .cert .sign .ttd { height: 14mm; margin: 1mm auto 0; display: block; max-width: 40mm; object-fit: contain; }
    .cert .sign b { display: block; }
    .cert .sign .nm { margin-top: 1.5mm; }`;

  /**
   * t = template (Pengaturan -> Sertifikat), d = data produk, a = aset { logo, ttdImg, ttd: {nama, jabatan}, qrText }
   */
  function html(t, d, a) {
    const c1 = color(t.warnaUtama, '#0b5d1e'), c2 = color(t.warnaAksen, '#3fae2a'), bg = color(t.warnaLatar, '#f8f8ef');
    const v = values(d);
    const logo = abs(a.logo);
    const fields = (t.fields || []).filter(f => f.tampil !== false);
    const fld = side => fields.filter(f => (f.kolom === 'kanan') === (side === 'kanan'))
      .map(f => `<div class="fld">${e(f.label)} : ${e(v[f.key] ?? '')}</div>`).join('');
    const qr = a.qrText ? qrSvg(a.qrText) : '';
    const lg = logo ? `<span class="lg"><img src="${e(logo)}" alt=""></span>` : '';
    const paras = String(t.paragraf || '').split(/\n\s*\n/).map(p => `<p>${fill(p, v).replace(/\n/g, '<br>')}</p>`).join('');
    return `<div class="cert" style="--c1:${c1};background:${bg}">
      ${t.watermark && logo ? `<div class="wm" style="background-image:url('${e(logo)}')"></div>` : ''}
      <div class="strip" style="background:${c2}"></div>
      <div class="band" style="background:${c1}"></div>
      <div class="tri1" style="background:${c2}"></div>
      <div class="tri2" style="background:${c1}"></div>
      <div class="foot1" style="background:${c2}"></div>
      <div class="foot2" style="background:${c1}"></div>
      ${t.qrSudut !== false && qr ? `<div class="qr">${qr}${lg}</div>` : ''}
      <div class="comp" style="color:${c1}">${fill(t.namaAtas, v)}</div>
      <div class="title" style="color:${c1}">${fill(t.judul, v)}</div>
      <div class="open" style="color:${c1}">${fill(t.pembuka, v)}</div>
      <div class="prod" style="color:${c1}">${fill(t.produk, v)}</div>
      <div class="bar" style="background:${c1}"></div>
      <div class="para">${paras}</div>
      <div class="fields"><div class="col">${fld('kiri')}</div><div class="col">${fld('kanan')}</div></div>
      <div class="sign">
        <div>${fill(t.labelTerbit, v)}</div>
        <div class="ln"></div>
        <div>${fill(t.labelTanggal, v)} ${e(v.tgl_terbit)}</div>
        <div class="ln"></div>
        ${t.qrTtd !== false && qr ? `<div class="qr2">${qr}${lg}</div>` : ''}
        ${t.labelQr ? `<b style="color:${c1}">${fill(t.labelQr, v)}</b>` : ''}
        ${t.tampilTtd && a.ttdImg ? `<img class="ttd" src="${e(abs(a.ttdImg))}" alt="">` : ''}
        <b class="nm">${e((a.ttd || {}).nama || '')}</b>
        <div>${e((a.ttd || {}).jabatan || '')}</div>
      </div>
    </div>`;
  }

  /* ---------- jendela cetak / simpan PDF ---------- */
  /**
   * Membuka tab baru berisi dokumen siap cetak. pages = array HTML per halaman.
   * Harus dipanggil langsung dari ketukan / klik pengguna supaya tidak diblokir browser.
   */
  function openPrint(title, pages, css, opt = {}) {
    // opt.win = jendela yang sudah dibuka lebih dulu saat ketukan (dipakai bila data harus diambil dulu).
    const w = opt.win && !opt.win.closed ? opt.win : window.open('', '_blank');
    if (!w) throw new Error('Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini.');
    const doc = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${e(title)}</title>
      <style>
        html, body { margin: 0; background: #e9ecef; }
        .bar-cetak { position: sticky; top: 0; z-index: 9; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap;
                     padding: 10px; background: #0e1424; color: #fff; font: 600 14px Arial, sans-serif; }
        .bar-cetak button { font: 700 14px Arial, sans-serif; padding: 10px 18px; border: 0; border-radius: 10px; background: #3fae2a; color: #fff; cursor: pointer; }
        .bar-cetak button.sec { background: #2a3550; }
        .sheet { margin: 14px auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,.18); width: max-content; }
        .zoom { transform-origin: top left; }
        @media print { html, body { background: #fff; } .bar-cetak { display: none; } .sheet { margin: 0; box-shadow: none; } .zoom { transform: none !important; height: auto !important; }
                       .sheet + .sheet { break-before: page; } }
        ${css}
      </style></head><body>
      <div class="bar-cetak"><span>${e(title)}</span><button onclick="window.print()">Cetak / Simpan PDF</button><button class="sec" onclick="window.close()">Tutup</button></div>
      ${pages.map(p => `<div class="sheet"><div class="zoom">${p}</div></div>`).join('')}
      <script>
        // Di layar HP halaman diperkecil agar muat; saat dicetak kembali ke ukuran asli.
        function fit() {
          document.querySelectorAll('.sheet').forEach(function (s) {
            var z = s.firstElementChild; z.style.transform = ''; s.style.width = ''; s.style.height = '';
            var w = z.scrollWidth, h = z.scrollHeight, k = Math.min(1, (window.innerWidth - 16) / w);
            z.style.transform = 'scale(' + k + ')'; s.style.width = (w * k) + 'px'; s.style.height = (h * k) + 'px';
          });
        }
        window.addEventListener('resize', fit);
        window.addEventListener('beforeprint', function () { document.querySelectorAll('.sheet').forEach(function (s) { s.style.width = ''; s.style.height = ''; s.firstElementChild.style.transform = 'none'; }); });
        window.addEventListener('afterprint', fit);
        window.addEventListener('load', function () { fit(); ${opt.autoPrint === false ? '' : 'setTimeout(function () { window.print(); }, 350);'} });
      <\/script></body></html>`;
    w.document.open(); w.document.write(doc); w.document.close();
    return w;
  }

  /* ---------- kop dokumen ---------- */
  // Bila perusahaan sudah mengunggah gambar kop: pakai gambar itu. Bila belum: kop teks dari Pengaturan -> Perusahaan.
  const KOP_CSS = `
    .kop-img { width: 100%; display: block; margin-bottom: 4mm; }
    .kop-auto { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; padding-bottom: 3mm; margin-bottom: 4mm;
                border-bottom: 1mm solid #1f6f5f; font-family: Arial, Helvetica, sans-serif; }
    .kop-auto .nm { font-size: 15pt; font-weight: 800; color: #17463d; letter-spacing: .2mm; line-height: 1.15; }
    .kop-auto .al { font-size: 8pt; color: #333; white-space: pre-line; margin-top: 1.2mm; max-width: 115mm; line-height: 1.3; }
    .kop-auto .ct { font-size: 8pt; color: #333; text-align: right; line-height: 1.45; white-space: nowrap; }
    .kop-auto .lg { height: 16mm; width: auto; margin-right: 3mm; }
    .kop-auto .l { display: flex; align-items: center; }`;
  function kop(r) {
    if (r && r.kop) return `<img class="kop-img" src="${e(r.kop)}" alt="">`;
    const p = (r && r.perusahaan) || {};
    const ct = [p.telp && 'Telp. ' + p.telp, p.email, p.web].filter(Boolean).map(e).join('<br>');
    return `<div class="kop-auto"><div class="l">${r && r.logo ? `<img class="lg" src="${e(r.logo)}" alt="">` : ''}
      <div><div class="nm">${e(p.nama || 'Nama perusahaan belum diisi')}</div><div class="al">${e(p.alamat || '')}</div></div></div>
      <div class="ct">${ct}</div></div>`;
  }

  window.COA_CERT = { CSS, html, qrSvg, loadQR, dmy };
  window.COA_PRINT = { open: openPrint, abs, esc: e, kop, KOP_CSS };
})();
