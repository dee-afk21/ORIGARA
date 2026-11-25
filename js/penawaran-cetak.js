/* =====================================================================
   Origara v0.7 — template cetak Surat Penawaran Harga (A4 tegak).
   Berdiri sendiri (hanya butuh COA_PRINT dari js/sertifikat.js), dipakai oleh aplikasi
   (menu Penawaran & portal akun pelanggan) dan oleh pesan.html (link pelanggan).
   ===================================================================== */
(function () {
  'use strict';
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : (iso || '-'); };
  const rp0 = n => Math.round(Number(n || 0)).toLocaleString('id-ID');
  const qtyFmt = n => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const UNIT = { 'UM.0021': 'Pcs', 'UM.0019': 'Set', 'UM.0017': 'Lusin', 'UM.0018': 'Unit', 'UM.0022': 'Boks', 'UM.0037': 'Karton' };
  const uom = c => UNIT[c] || (typeof window.unitName === 'function' ? window.unitName(c) : c);

  function terbilang(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    const t = x => x < 12 ? s[x] : x < 20 ? t(x - 10) + ' belas' : x < 100 ? t(Math.floor(x / 10)) + ' puluh ' + t(x % 10)
      : x < 200 ? 'seratus ' + t(x - 100) : x < 1000 ? t(Math.floor(x / 100)) + ' ratus ' + t(x % 100)
      : x < 2000 ? 'seribu ' + t(x - 1000) : x < 1e6 ? t(Math.floor(x / 1000)) + ' ribu ' + t(x % 1000)
      : x < 1e9 ? t(Math.floor(x / 1e6)) + ' juta ' + t(x % 1e6)
      : x < 1e12 ? t(Math.floor(x / 1e9)) + ' miliar ' + t(x % 1e9) : t(Math.floor(x / 1e12)) + ' triliun ' + t(x % 1e12);
    const w = (n === 0 ? 'nol' : t(n)).replace(/\s+/g, ' ').trim() + ' rupiah';
    return w[0].toUpperCase() + w.slice(1);
  }

  const CSS = `
    @page { size: A4 portrait; margin: 0; }
    .pnw { width: 210mm; min-height: 297mm; padding: 10mm 15mm 12mm; font: 9.6pt/1.4 Arial, Helvetica, sans-serif; color: #111; position: relative; box-sizing: border-box;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pnw * { box-sizing: border-box; }
    .pnw h1 { text-align: center; font-size: 15pt; letter-spacing: .4mm; margin: 2mm 0 0; }
    .pnw .sub { text-align: center; color: #666; font-size: 8.5pt; margin-bottom: 5mm; }
    .pnw .hd { display: grid; grid-template-columns: 1.2fr 1fr; gap: 8mm; }
    .pnw .to b { font-size: 10.5pt; }
    .pnw .to p { margin: 1mm 0 0; white-space: pre-line; }
    .pnw .pn-kv { display: grid; grid-template-columns: 24mm 3mm 1fr; row-gap: 1.2mm; }
    .pnw .intro { margin: 5mm 0 2mm; }
    .pnw table.pn-items { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .pnw .pn-items th { background: #1f2933; color: #fff; padding: 1.6mm 2mm; text-align: left; font-weight: 700; border: .3mm solid #1f2933; }
    .pnw .pn-items td { padding: 1.4mm 2mm; border: .3mm solid #cfd4da; vertical-align: top; }
    .pnw .pn-items .r { text-align: right; } .pnw .pn-items .c { text-align: center; }
    .pnw .bot { display: grid; grid-template-columns: 1fr 74mm; gap: 6mm; margin-top: 2mm; }
    .pnw table.tot { width: 100%; border-collapse: collapse; }
    .pnw .tot td { padding: 1.2mm 2mm; border: .3mm solid #cfd4da; text-align: right; }
    .pnw .tot tr.g td { font-weight: 800; background: #f1f3f5; }
    .pnw .says { font-style: italic; color: #333; }
    .pnw .blk-h { margin-top: 5mm; font-weight: 800; font-size: 9.2pt; }
    .pnw .blk { margin-top: 1.2mm; white-space: pre-line; border-left: 1mm solid #cfd4da; padding: .5mm 0 .5mm 3mm; }
    .pnw .close { margin-top: 5mm; }
    .pnw .sign { margin-top: 6mm; width: 70mm; margin-left: auto; text-align: center; }
    .pnw .sign img { height: 25mm; max-width: 60mm; object-fit: contain; display: block; margin: 1mm auto; }
    .pnw .sign .sp { height: 25mm; }
    .pnw .sign .nm { font-weight: 800; text-decoration: underline; }
    .pnw .void { position: absolute; left: 0; right: 0; top: 115mm; text-align: center; font: 900 48pt Arial; color: rgba(217,45,32,.2); transform: rotate(-22deg); pointer-events: none; }
    .pnw .stamp { display: inline-block; border: .5mm solid #05875f; color: #05875f; font-weight: 800; padding: .8mm 2.5mm; border-radius: 1.5mm; font-size: 8.5pt; }`;

  function page(r) {
    const v = r.pnw, p = r.perusahaan || {}, t = r.ttd || {};
    const K = window.COA_PRINT;
    const css = CSS + (K && K.KOP_CSS || '');
    return { css, html: `<div class="pnw">
      ${K ? K.kop(r) : ''}
      ${v.status === 'Batal' ? '<div class="void">DIBATALKAN</div>' : ''}
      <h1>SURAT PENAWARAN HARGA</h1><div class="sub">Quotation</div>
      <div class="hd">
        <div class="to">Kepada Yth.<br><b>${e(v.pelanggan)}</b><p>${e(v.alamatTagih || '')}</p>${v.up ? `<p>Up. ${e(v.up)}</p>` : ''}</div>
        <div class="pn-kv">
          <span>No.</span><span>:</span><b>${e(v.no)}</b>
          <span>Tanggal</span><span>:</span><span>${e(longDate(v.tanggal))}</span>
          <span>Berlaku s/d</span><span>:</span><span>${v.berlaku ? e(longDate(v.berlaku)) : '-'}</span>
          ${v.perihal ? `<span>Perihal</span><span>:</span><span>${e(v.perihal)}</span>` : ''}
          ${v.status === 'Disetujui' ? `<span>Status</span><span>:</span><span><span class="stamp">DISETUJUI · PO ${e(v.noPO)}</span></span>` : ''}
        </div>
      </div>
      <p class="intro">Dengan hormat,<br>Bersama ini kami sampaikan penawaran harga sebagai berikut:</p>
      <table class="pn-items"><thead><tr><th class="c" style="width:8mm">No</th><th>Deskripsi</th><th style="width:24mm">Warna</th><th style="width:16mm">Ukuran</th>
        <th class="r" style="width:15mm">Qty</th><th style="width:13mm">Satuan</th><th class="r" style="width:25mm">Harga Satuan</th><th class="r" style="width:28mm">Jumlah</th></tr></thead>
        <tbody>${v.items.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${e(l.deskripsi)}</td><td>${e(l.warna)}</td><td>${e(l.ukuran)}</td>
          <td class="r">${qtyFmt(l.qty)}</td><td>${e(uom(l.satuan))}</td><td class="r">${rp0(l.harga)}</td><td class="r">${rp0(l.jumlah)}</td></tr>`).join('')}</tbody></table>
      <div class="bot">
        <div class="says">Terbilang: ${e(terbilang(v.total))}</div>
        <table class="tot">
          <tr><td>Sub Total</td><td style="width:32mm">${rp0(v.subtotal)}</td></tr>
          <tr><td>DPP Nilai Lain (${e(v.rasioDpp)})</td><td>${rp0(v.dppLain)}</td></tr>
          <tr><td>PPN ${e(v.tarifPpn)}%</td><td>${rp0(v.ppn)}</td></tr>
          <tr class="g"><td>Total</td><td>${rp0(v.total)}</td></tr>
        </table>
      </div>
      ${v.syarat ? `<div class="blk-h">Syarat &amp; Ketentuan</div><div class="blk">${e(v.syarat)}</div>` : ''}
      ${v.catatan ? `<div class="blk-h">Catatan</div><div class="blk">${e(v.catatan)}</div>` : ''}
      <p class="close">Demikian penawaran ini kami sampaikan. Atas perhatian dan kerja samanya kami ucapkan terima kasih.</p>
      <div class="sign">${e(p.kota ? p.kota + ', ' : '')}${e(longDate(v.tanggal))}<br>Hormat kami,<br>${e(p.nama || '')}
        ${r.ttdImg ? `<img src="${e(r.ttdImg)}" alt="">` : '<div class="sp"></div>'}
        <div class="nm">${e(t.nama || '')}</div><div>${e(t.jabatan || '')}</div></div>
    </div>` };
  }

  /** Buka jendela cetak. w = jendela yang sudah dibuka saat ketukan (agar tidak diblokir browser HP). */
  function print(r, w) {
    const pg = page(r);
    window.COA_PRINT.open('Surat Penawaran ' + r.pnw.no, [pg.html], pg.css, { win: w });
  }

  window.COA_PNW = { page, print, terbilang, longDate, rp0, uom };
})();
