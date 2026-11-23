/* =====================================================================
   Origara v0.4 — modul Pengiriman: Surat Jalan & Packing List.
   Dimuat sebelum skrip utama; memakai fungsi bersama dari index.html
   ($, esc, api, run, modal, toast, state, can, dateField, validDMY, todayDMY, ...)
   dan COA_PRINT dari js/sertifikat.js.
   ===================================================================== */
(function () {
  'use strict';
  const ui = { list: null, query: '', timer: 0 };

  /* ---------- bantuan ---------- */
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const nowLong = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${p(d.getDate())} ${BULAN[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  /** Satuan di dokumen: Piece ditulis "Pcs" seperti Surat Jalan lama, lainnya pakai nama satuannya. */
  const docUnit = code => code === 'UM.0021' ? 'Pcs' : (typeof unitName === 'function' ? unitName(code) : code);
  const totalUnit = lines => { const u = [...new Set(lines.map(l => l.satuan))]; return u.length === 1 ? docUnit(u[0]) : ''; };
  const custName = id => (typeof nameOf === 'function' ? nameOf('pelanggan', id) : id);

  /* =====================================================================
     DAFTAR SURAT JALAN
     ===================================================================== */
  async function loadDN(btn) {
    if (!ui.list) $('#dnList').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listDN', ui.query));
    if (list) { ui.list = list; renderDN(); }
  }
  function renderDN() {
    const list = ui.list || [];
    $('#btnNewDN').hidden = !can('dn.buat');
    if (!list.length) {
      $('#dnList').innerHTML = `<div class="empty"><i class="fa-solid fa-truck"></i><b>${ui.query ? 'Tidak ditemukan' : 'Belum ada Surat Jalan'}</b>${ui.query ? 'Coba kata kunci lain.' : 'Buat Surat Jalan dari barang yang sudah di-scan.'}</div>`;
      return;
    }
    $('#dnList').innerHTML = list.map(d => `
      <div class="li" data-dn="${esc(d.noDN)}">
        <div class="t"><b class="mono">${esc(d.noDN)}</b>
          <small>${esc(dmy(d.tanggal))} · PO ${esc(d.noPO)} · ${esc(d.penerima || custName(d.idPelanggan))} · ${fmt(d.qty)} pcs</small></div>
        ${d.status === 'Batal' ? '<span class="tag warn">Dibatalkan</span>' : '<span class="tag ok">Terbit</span>'}
        <div class="acts">
          <button class="btn sm" data-dact="dn" title="Cetak Surat Jalan"><i class="fa-solid fa-print"></i> SJ</button>
          <button class="btn sm" data-dact="pl" title="Cetak Packing List"><i class="fa-solid fa-list-ol"></i> PL</button>
          ${can('dn.batal') && d.status !== 'Batal' ? '<button class="btn sm icon t-bad" data-dact="batal" aria-label="Batalkan Surat Jalan"><i class="fa-solid fa-ban"></i></button>' : ''}
        </div>
      </div>`).join('');
  }

  /* =====================================================================
     BUAT SURAT JALAN
     ===================================================================== */
  async function newDN() {
    const pos = await run($('#btnNewDN'), () => api('dnPOs'));
    if (!pos) return;
    if (!pos.length) return toast('Belum ada barang ter-scan yang siap dikirim.', 'info');
    let prep = null;
    const lineRows = () => prep.lines.map((l, i) => `
      <div class="li" data-li="${i}">
        <div class="t"><b>${esc(l.deskripsi)}</b><small>${esc(l.warna)} · ${esc(l.ukuran)} · siap ${fmt(l.siap)} dari ${fmt(l.scanned)} ter-scan${l.dikirim ? ` (${fmt(l.dikirim)} sudah dikirim)` : ''}</small></div>
        <input class="input num d-qty" type="number" inputmode="numeric" min="0" max="${l.siap}" value="${l.siap}" style="width:90px" ${l.siap ? '' : 'disabled'} aria-label="Jumlah dikirim">
      </div>`).join('');
    const addrOptions = () => {
      const c = prep.pelanggan, o = [];
      (c.kirim || []).forEach((k, i) => o.push(`<option value="k${i}">${esc(k.label || 'Alamat kirim ' + (i + 1))}</option>`));
      if (c.alamatTagih) o.push('<option value="tagih">Alamat penagihan</option>');
      o.push('<option value="manual">Ketik manual</option>');
      return o.join('');
    };
    const res = await modal({
      title: 'Buat Surat Jalan', icon: 'fa-truck', wide: true, sticky: true, confirmText: 'Terbitkan Surat Jalan',
      html: `
        <label class="f"><span>PO yang dikirim *</span><select class="input" id="dPO"><option value="">— Pilih PO —</option>${pos.map(p =>
          `<option value="${esc(p.noPO)}">${esc(p.noPO)} · ${esc(custName(p.idPelanggan))} · siap kirim ${fmt(p.siap)} pcs</option>`).join('')}</select></label>
        <div id="dBody" class="hint">Pilih PO untuk melihat barang yang siap dikirim. Satu Surat Jalan untuk satu PO.</div>`,
      onOpen: d => {
        $('#dPO', d).onchange = async e => {
          const no = e.target.value; prep = null;
          if (!no) { $('#dBody', d).innerHTML = ''; return; }
          $('#dBody', d).innerHTML = '<div class="skel"></div>';
          try { prep = await api('dnPrepare', no); } catch (err) { $('#dBody', d).textContent = err.message; return; }
          const c = prep.pelanggan;
          $('#dBody', d).className = '';
          $('#dBody', d).innerHTML = `
            <div class="f2">
              <div class="f"><span>Tanggal Surat Jalan *</span>${dateField('dTgl', todayDMY())}</div>
              <div class="f"><span>Nomor (perkiraan)</span><input class="input mono" value="${esc(prep.nomorBerikutnya)}" readonly></div>
            </div>
            <div class="sub-h">Barang dikirim <span><button type="button" class="btn sm ghost" data-qall="1">Semua</button><button type="button" class="btn sm ghost" data-qall="0">Kosongkan</button></span></div>
            <div class="list" style="padding:0">${lineRows()}</div>
            <p class="hint" id="dSum"></p>
            <div class="sub-h">Penerima</div>
            <label class="f"><span>Alamat dari data pelanggan</span><select class="input" id="dAddr">${addrOptions()}</select></label>
            <div class="f2">
              <label class="f w2"><span>Nama penerima *</span><input class="input" id="dNama" value="${esc(c.nama)}"></label>
              <label class="f w2"><span>Alamat kirim *</span><textarea class="input" id="dAlamat" rows="3"></textarea></label>
              <label class="f"><span>Attn</span><input class="input" id="dAttn"></label>
              <label class="f"><span>Telepon</span><input class="input" id="dTelp" inputmode="tel"></label>
              <label class="f w2"><span>Catatan (opsional, tampil di Keterangan)</span><input class="input" id="dCat"></label>
            </div>`;
          const fillAddr = () => {
            const v = $('#dAddr', d).value;
            const k = v[0] === 'k' ? c.kirim[+v.slice(1)] : v === 'tagih' ? { alamat: c.alamatTagih, attn: c.up, telp: c.telp } : null;
            if (k) { $('#dAlamat', d).value = k.alamat || ''; $('#dAttn', d).value = k.attn || ''; $('#dTelp', d).value = k.telp || ''; }
            else { $('#dAlamat', d).value = ''; $('#dAttn', d).value = ''; $('#dTelp', d).value = ''; $('#dAlamat', d).focus(); }
          };
          const sum = () => { const n = $$('.d-qty', d).reduce((a, i) => a + (parseInt(i.value, 10) || 0), 0); $('#dSum', d).textContent = `Total dikirim: ${fmt(n)} pcs`; };
          $('#dAddr', d).onchange = fillAddr; fillAddr();
          $$('[data-qall]', d).forEach(b => b.onclick = () => { $$('.d-qty', d).forEach((i, n) => { i.value = b.dataset.qall === '1' ? prep.lines[n].siap : 0; }); sum(); });
          d.addEventListener('input', ev => { if (ev.target.classList.contains('d-qty')) sum(); });
          sum();
        };
      },
      collect: d => {
        if (!prep) throw new Error('Pilih PO terlebih dahulu.');
        const tgl = $('#dTgl', d).value;
        if (!validDMY(tgl)) { $('#dTgl', d).classList.add('invalid'); throw new Error('Tanggal tidak valid. Format: DD/MM/YYYY.'); }
        const lines = $$('.d-qty', d).map((i, n) => {
          const q = parseInt(i.value, 10) || 0, l = prep.lines[n];
          if (q < 0 || q > l.siap) { i.classList.add('invalid'); throw new Error(`Jumlah "${l.deskripsi} ${l.ukuran}" maksimal ${l.siap}.`); }
          return { deskripsi: l.deskripsi, idWarna: l.idWarna, idUkuran: l.idUkuran, qty: q };
        }).filter(l => l.qty > 0);
        if (!lines.length) throw new Error('Isi jumlah barang yang dikirim.');
        const v = id => $('#' + id, d).value.trim();
        if (!v('dNama') || !v('dAlamat')) throw new Error('Nama penerima dan alamat kirim wajib diisi.');
        return { noPO: prep.noPO, tanggal: tgl, penerima: v('dNama'), alamat: v('dAlamat'), attn: v('dAttn'), telp: v('dTelp'), catatan: v('dCat'), lines };
      },
      action: data => api('createDN', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    ui.query = ''; $('#dnSearch').value = '';
    loadDN();
    // Tawarkan cetak lewat ketukan baru (browser hanya mengizinkan jendela cetak dari ketukan pengguna).
    modal({
      title: 'Surat Jalan terbit', text: res.noDN, icon: 'fa-circle-check', tone: 'ok', noConfirm: true, cancelText: 'Tutup',
      html: `<div class="row"><button type="button" class="btn primary block" data-p="dn"><i class="fa-solid fa-print"></i> Cetak Surat Jalan</button>
             <button type="button" class="btn block" data-p="pl"><i class="fa-solid fa-list-ol"></i> Cetak Packing List</button></div>`,
      onOpen: (d, finish) => $$('[data-p]', d).forEach(b => b.onclick = () => { printDoc(res.noDN, b.dataset.p); finish(null); })
    });
  }

  async function cancelDN(no) {
    const res = await modal({
      title: `Batalkan ${no}?`, text: 'Barangnya kembali berstatus siap kirim. Nomor Surat Jalan ini tidak akan dipakai ulang.',
      icon: 'fa-ban', tone: 'bad', danger: true, confirmText: 'Batalkan Surat Jalan',
      html: '<label class="f"><span>Alasan pembatalan *</span><input class="input" id="xAlasan" placeholder="mis. salah alamat"></label>',
      collect: d => { const v = $('#xAlasan', d).value.trim(); if (!v) throw new Error('Isi alasan pembatalan.'); return v; },
      action: alasan => api('cancelDN', no, alasan)
    });
    if (res) { toast(res.message, 'ok'); loadDN(); }
  }

  /* =====================================================================
     CETAK SURAT JALAN / PACKING LIST (A4 tegak)
     ===================================================================== */
  const DOC_CSS = `
    @page { size: A4 portrait; margin: 0; }
    .doc { width: 210mm; min-height: 297mm; padding: 10mm 14mm 12mm; font: 9.5pt/1.35 Arial, Helvetica, sans-serif; color: #222; position: relative; box-sizing: border-box;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc * { box-sizing: border-box; }
    .doc .kop { width: 100%; display: block; margin-bottom: 4mm; }
    .doc .kop-txt { border-bottom: 1mm solid #3fae2a; padding-bottom: 3mm; margin-bottom: 4mm; text-align: right; font-size: 8pt; white-space: pre-line; }
    .doc h1 { margin: 2mm 0 0; text-align: center; color: #1f5c2e; font-size: 16pt; letter-spacing: .3mm; }
    .doc .sub { text-align: center; color: #666; font-size: 8pt; margin-bottom: 4mm; }
    .doc .info { display: grid; grid-template-columns: 1.15fr 1fr; border: .3mm solid #ddd; margin-bottom: 2mm; }
    .doc .info > div { padding: 2mm 3mm; border-bottom: .3mm solid #eee; }
    .doc .info > div:nth-child(odd) { border-right: .3mm solid #eee; }
    .doc .info b.l { display: block; color: #1f5c2e; font-size: 8.5pt; }
    .doc .info .v { font-weight: 700; }
    .doc table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 8.8pt; }
    .doc th { background: #2f6b3a; color: #fff; padding: 1.6mm 2mm; font-weight: 700; border: .3mm solid #2f6b3a; }
    .doc td { padding: 1.3mm 2mm; border: .3mm solid #cfd5cf; vertical-align: top; }
    .doc td.c, .doc th.c { text-align: center; }
    .doc tr.tot td { background: #2f6b3a; color: #fff; font-weight: 700; border-color: #2f6b3a; }
    .doc .ket-h { margin-top: 4mm; color: #1f5c2e; font-weight: 800; font-size: 9pt; }
    .doc .ket { border: .3mm solid #ddd; padding: 2mm 3mm; margin-top: 1.5mm; }
    .doc .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 30mm; margin-top: 6mm; text-align: center; }
    .doc .sig .sp { height: 22mm; }
    .doc .sig .ln { border-top: .3mm solid #333; width: 60mm; margin: 0 auto; }
    .doc .foot { margin-top: 8mm; text-align: center; color: #555; font-size: 8pt; }
    .doc .foot p { margin: 1.5mm 0; }
    .doc .void { position: absolute; left: 0; right: 0; top: 110mm; text-align: center; font: 900 46pt Arial; color: rgba(217,45,32,.22); transform: rotate(-22deg); pointer-events: none; }
    .doc h2 { font-size: 9.5pt; color: #1f5c2e; margin: 5mm 0 0; }
    .doc .mono { font-family: Consolas, 'Courier New', monospace; }` + COA_PRINT.KOP_CSS;

  /** Kop dokumen: gambar kop unggahan, atau kop teks dari data perusahaan. */
  function header(r) { return COA_PRINT.kop(r); }
  function infoBlock(dn, first, second) {
    return `<div class="info">
      <div><b class="l">${first[0]}</b><span class="v">${esc(first[1])}</span></div>
      <div><b class="l">Tanggal</b><span class="v">${esc(dmy(dn.tanggal))}</span></div>
      <div><b class="l">Penerima:</b><span class="v">${esc(dn.penerima)}</span><br>${esc(dn.alamat).replace(/\n/g, '<br>')}${dn.attn ? ` Attn. ${esc(dn.attn)}` : ''}${dn.telp ? ` - ${esc(dn.telp)}` : ''}</div>
      <div><b class="l">Nomor PO:</b><span class="v">${esc(dn.noPO)}</span><br><br><b class="l">${second[0]}</b><span class="v">${esc(second[1])}</span></div>
    </div>`;
  }
  function summaryTable(dn) {
    const total = dn.lines.reduce((a, l) => a + l.qty, 0);
    return `<table><thead><tr><th class="c" style="width:9mm">No</th><th class="c" style="width:22mm">Jumlah</th><th style="width:26mm">Ukuran</th><th style="width:34mm">Warna</th><th>Deskripsi Produk</th></tr></thead><tbody>
      ${dn.lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td class="c">${fmt(l.qty)}</td><td>${esc(l.ukuran)}</td><td>${esc(l.warna)}</td><td>${esc(l.deskripsi)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3" class="c">Total Jumlah</td><td colspan="2" class="c">${fmt(total)} ${esc(totalUnit(dn.lines))}</td></tr>
    </tbody></table>`;
  }
  function footer(note) {
    return `<div class="foot"><p>${note}</p><p>Dihasilkan pada: ${nowLong()}</p></div>`;
  }
  function dnPage(r) {
    const dn = r.dn;
    return `<div class="doc">${header(r)}
      ${dn.status === 'Batal' ? '<div class="void">DIBATALKAN</div>' : ''}
      <h1>SURAT JALAN</h1><div class="sub">Delivery Note - Bukti Pengiriman</div>
      ${infoBlock(dn, ['No. Surat Jalan', dn.noDN], ['No. Packing List:', dn.noPL])}
      ${summaryTable(dn)}
      <div class="ket-h">KETERANGAN</div>
      <div class="ket">Barang yang tercantum dalam surat jalan ini telah diperiksa dan disetujui kualitas serta kuantitasnya.${dn.catatan ? '<br>' + esc(dn.catatan) : ''}</div>
      <div class="sig"><div><b>Pengirim</b><div class="sp"></div><div class="ln"></div></div><div><b>Penerima</b><div class="sp"></div><div class="ln"></div></div></div>
      ${footer('Dokumen ini adalah bukti sah pengiriman barang.')}
    </div>`;
  }
  function plPage(r) {
    const dn = r.dn;
    return `<div class="doc">${header(r)}
      ${dn.status === 'Batal' ? '<div class="void">DIBATALKAN</div>' : ''}
      <h1>PACKING LIST</h1><div class="sub">Daftar Rincian Barang per Kode Item</div>
      ${infoBlock(dn, ['No. Packing List', dn.noPL], ['No. Surat Jalan:', dn.noDN])}
      ${summaryTable(dn)}
      <h2>Rincian barang (${fmt(dn.items.length)} item)</h2>
      <table><thead><tr><th class="c" style="width:10mm">No</th><th style="width:44mm">Kode Item</th><th style="width:22mm">Ukuran</th><th style="width:30mm">Warna</th><th>Deskripsi Produk</th></tr></thead><tbody>
        ${dn.items.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="mono">${esc(x.itemCode)}</td><td>${esc(x.ukuran)}</td><td>${esc(x.warna)}</td><td>${esc(x.deskripsi)}</td></tr>`).join('')}
      </tbody></table>
      <div class="sig"><div><b>Disiapkan oleh</b><div class="sp"></div><div class="ln"></div></div><div><b>Diperiksa oleh</b><div class="sp"></div><div class="ln"></div></div></div>
      ${footer('Packing List ini merupakan lampiran Surat Jalan ' + esc(dn.noDN) + '.')}
    </div>`;
  }

  /**
   * Jendela cetak dibuka SEKETIKA (masih dalam ketukan pengguna) lalu diisi setelah data datang,
   * supaya tidak diblokir browser HP.
   */
  async function printDoc(no, kind, copies) {
    let w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) w.document.write('<p style="font:16px Arial;padding:24px">Menyiapkan dokumen…</p>');
    try {
      const r = await api('getDN', no);
      const n = Math.max(1, Math.min(3, copies || 1));
      const page = kind === 'pl' ? plPage(r) : dnPage(r);
      const title = (kind === 'pl' ? 'Packing List ' + r.dn.noPL : 'Surat Jalan ' + r.dn.noDN);
      COA_PRINT.open(title, Array(n).fill(page), DOC_CSS, { win: w });
    } catch (e) {
      if (w) w.close();
      if (e.code !== 'AUTH') toast(e.message, 'bad');
    }
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  const PAGE_HTML = `
    <section id="page-dn" class="page" hidden>
      <div class="page-bar">
        <div class="search" style="max-width:360px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="dnSearch" type="search" placeholder="Cari No. Surat Jalan, PO, atau penerima…"></div>
        <div class="row"><button class="btn icon" id="btnReloadDN" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn primary" id="btnNewDN" hidden><i class="fa-solid fa-plus"></i> Buat Surat Jalan</button></div>
      </div>
      <div class="card list" id="dnList"></div>
      <p class="hint">Satu Surat Jalan untuk satu PO. Barang yang dikirim diambil dari hasil scan yang belum pernah dikirim. Packing List memakai nomor yang sama dan berisi rincian kode item.</p>
    </section>`;

  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', PAGE_HTML);
    $('#btnNewDN').onclick = newDN;
    $('#btnReloadDN').onclick = e => loadDN(e.currentTarget);
    $('#dnSearch').oninput = e => { clearTimeout(ui.timer); ui.timer = setTimeout(() => { ui.query = e.target.value.trim(); loadDN(); }, 350); };
    $('#dnList').onclick = e => {
      const b = e.target.closest('[data-dact]'); if (!b) return;
      const no = b.closest('[data-dn]').dataset.dn;
      if (b.dataset.dact === 'batal') return cancelDN(no);
      printDoc(no, b.dataset.dact);
    };
  }

  window.COA_DOC = { printDN: printDoc, DOC_CSS, header };
  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [{ id: 'dn', group: 'Pengiriman', order: 0, perm: 'dn.lihat', label: 'Surat Jalan', icon: 'fa-truck', title: 'Surat Jalan & Packing List',
              sub: 'Terbitkan dan cetak dokumen pengiriman dari barang yang sudah di-scan.', onShow: () => loadDN() }]
  });
})();
