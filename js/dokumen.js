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
  /* v0.8.0: barang tanpa QR — jumlah boleh desimal, warna/ukuran boleh kosong. */
  const spec = l => [l.warna, l.ukuran].filter(Boolean).map(esc).join(' · ');
  const noQRTag = '<span class="jenis-tag"><i class="fa-solid fa-boxes-stacked"></i>Tanpa QR</span>';
  /** Jumlah dari input: barang ber-QR harus bulat. Mengembalikan angka atau melempar pesan. */
  function readQty(input, l, max) {
    const q = parseQty(input.value);
    const bad = msg => { input.classList.add('invalid'); throw new Error(msg); };
    if (!Number.isFinite(q) || q < 0) bad(`Jumlah "${l.deskripsi}" tidak valid${l.pakaiQr === false ? ' (maks. 2 angka di belakang koma)' : ''}.`);
    if (l.pakaiQr !== false && !Number.isInteger(q)) bad(`Jumlah "${l.deskripsi}" harus bilangan bulat (barang ber-QR).`);
    if (q > max + 1e-9) bad(`Jumlah "${l.deskripsi}${l.ukuran ? ' ' + l.ukuran : ''}" maksimal ${qtyText(max)}.`);
    return q;
  }
  const qtyInput = (cls, l, val, max) =>
    `<input class="input num ${cls}" type="text" inputmode="${l.pakaiQr === false ? 'decimal' : 'numeric'}" value="${esc(String(val).replace('.', ','))}" style="width:96px" ${max > 0 ? '' : 'disabled'} aria-label="Jumlah dikirim" autocomplete="off">`;

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
          <small>${esc(dmy(d.tanggal))} · PO ${esc(d.noPO)} · ${esc(d.penerima || custName(d.idPelanggan))} · ${qtyText(d.qty)} barang</small>
          ${d.diubahOleh ? `<small class="dn-edited" style="display:block"><i class="fa-solid fa-pen"></i> Diubah ${esc(d.diubahOleh)} · ${esc(fmtStamp(d.diubahAt))}</small>` : ''}</div>
        ${d.status === 'Batal' ? '<span class="tag warn">Dibatalkan</span>' : d.ditagih ? '<span class="tag ok"><i class="fa-solid fa-file-invoice-dollar"></i> Ditagih</span>' : '<span class="tag ok">Terbit</span>'}
        <div class="acts">
          ${can('dn.buat') && d.status !== 'Batal' && !d.ditagih ? '<button class="btn sm" data-dact="edit" title="Edit Surat Jalan"><i class="fa-solid fa-pen"></i> Edit</button>' : ''}
          <button class="btn sm" data-dact="dn" title="Cetak Surat Jalan"><i class="fa-solid fa-print"></i> SJ</button>
          ${d.jenis === 'TANPA_QR' ? '' : '<button class="btn sm" data-dact="pl" title="Cetak Packing List"><i class="fa-solid fa-list-ol"></i> PL</button>'}
          ${can('dn.batal') && d.status !== 'Batal' ? '<button class="btn sm icon t-bad" data-dact="batal" aria-label="Batalkan Surat Jalan" title="Batalkan"><i class="fa-solid fa-ban"></i></button>' : ''}
          ${can('dn.hapus') ? '<button class="btn sm icon t-bad" data-dact="hapus" aria-label="Hapus Surat Jalan" title="Hapus permanen (nomor dipakai lagi)"><i class="fa-solid fa-trash"></i></button>' : ''}
        </div>
      </div>`).join('');
  }

  /* =====================================================================
     BUAT SURAT JALAN
     ===================================================================== */
  async function newDN() {
    const pos = await run($('#btnNewDN'), () => api('dnPOs'));
    if (!pos) return;
    if (!pos.length) return toast('Belum ada barang yang siap dikirim (barang ber-QR harus di-scan dulu).', 'info');
    let prep = null;
    const lineRows = () => prep.lines.map((l, i) => {
      const unit = docUnit(l.satuan), info = [spec(l)];
      if (l.pakaiQr === false) info.push(`sisa ${qtyText(l.siap)} ${esc(unit)} dari target ${qtyText(l.qtyTarget)}${l.dikirim ? ` (${qtyText(l.dikirim)} sudah dikirim)` : ''}`);
      else info.push(`siap ${fmt(l.siap)} dari ${fmt(l.scanned)} ter-scan${l.dikirim ? ` (${fmt(l.dikirim)} sudah dikirim)` : ''}`);
      return `
      <div class="li" data-li="${i}">
        <div class="t"><b>${esc(l.deskripsi)}</b> ${l.pakaiQr === false ? noQRTag : ''}<small>${info.filter(Boolean).join(' · ')}</small></div>
        ${qtyInput('d-qty', l, l.siap, l.siap)}
      </div>`;
    }).join('');
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
          `<option value="${esc(p.noPO)}">${esc(p.noPO)} · ${esc(custName(p.idPelanggan))} · siap kirim ${qtyText(p.siap)}</option>`).join('')}</select></label>
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
          const sum = () => { const n = $$('.d-qty', d).reduce((a, i) => a + (parseQty(i.value) || 0), 0); $('#dSum', d).textContent = `Total dikirim: ${qtyText(n)} ${esc(totalUnit(prep.lines) || 'barang')}`; };
          $('#dAddr', d).onchange = fillAddr; fillAddr();
          $$('[data-qall]', d).forEach(b => b.onclick = () => { $$('.d-qty', d).forEach((i, n) => { i.value = b.dataset.qall === '1' ? String(prep.lines[n].siap).replace('.', ',') : 0; i.classList.remove('invalid'); }); sum(); });
          d.addEventListener('input', ev => { if (ev.target.classList.contains('d-qty')) sum(); });
          sum();
        };
      },
      collect: d => {
        if (!prep) throw new Error('Pilih PO terlebih dahulu.');
        const tgl = $('#dTgl', d).value;
        if (!validDMY(tgl)) { $('#dTgl', d).classList.add('invalid'); throw new Error('Tanggal tidak valid. Format: DD/MM/YYYY.'); }
        const lines = $$('.d-qty', d).map((i, n) => {
          const l = prep.lines[n], q = i.disabled ? 0 : readQty(i, l, l.siap);
          return { deskripsi: l.deskripsi, idWarna: l.idWarna, idUkuran: l.idUkuran, qty: String(q) };
        }).filter(l => Number(l.qty) > 0);
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
             ${(pos.find(p => p.noPO === prep.noPO) || {}).jenis === 'TANPA_QR' ? '' : '<button type="button" class="btn block" data-p="pl"><i class="fa-solid fa-list-ol"></i> Cetak Packing List</button>'}</div>`,
      onOpen: (d, finish) => $$('[data-p]', d).forEach(b => b.onclick = () => { printDoc(res.noDN, b.dataset.p); finish(null); })
    });
  }

  /* =====================================================================
     EDIT SURAT JALAN (v0.7.0) — selama belum ditagih invoice. Nomor tetap.
     ===================================================================== */
  async function editDN(no) {
    const prep = await run(null, () => api('dnEditPrepare', no));
    if (!prep) return;
    const c = prep.pelanggan;
    const addrOptions = () => {
      const o = ['<option value="">— tetap seperti sekarang —</option>'];
      (c.kirim || []).forEach((k, i) => o.push(`<option value="k${i}">${esc(k.label || 'Alamat kirim ' + (i + 1))}</option>`));
      if (c.alamatTagih) o.push('<option value="tagih">Alamat penagihan</option>');
      return o.join('');
    };
    const res = await modal({
      title: `Edit ${no}`, text: `PO ${prep.noPO} · ${c.nama} · Packing List ${prep.noPL} ikut berubah`, icon: 'fa-pen', wide: true, sticky: true, noEnter: true,
      confirmText: 'Simpan perubahan',
      html: `
        <div class="f2">
          <div class="f"><span>Tanggal Surat Jalan *</span>${dateField('eTgl', dmy(prep.tanggal))}</div>
          <div class="f"><span>Nomor</span><input class="input mono" value="${esc(no)}" readonly></div>
        </div>
        <div class="sub-h">Jumlah barang</div>
        <div class="list" style="padding:0">${prep.lines.map((l, i) => `
          <div class="li" data-li="${i}">
            <div class="t"><b>${esc(l.deskripsi)}</b> ${l.pakaiQr === false ? noQRTag : ''}<small>${[spec(l), `sekarang ${qtyText(l.diSJ)} ${esc(docUnit(l.satuan))}`, `bisa ditambah ${qtyText(l.siap)}`].filter(Boolean).join(' · ')}</small></div>
            ${qtyInput('e-qty', l, l.diSJ, l.diSJ + l.siap)}
          </div>`).join('')}</div>
        <p class="hint" id="eSum"></p>
        <div class="sub-h">Penerima</div>
        <label class="f"><span>Ganti dengan alamat dari data pelanggan</span><select class="input" id="eAddr">${addrOptions()}</select></label>
        <div class="f2">
          <label class="f w2"><span>Nama penerima *</span><input class="input" id="eNama" value="${esc(prep.penerima)}"></label>
          <label class="f w2"><span>Alamat kirim *</span><textarea class="input" id="eAlamat" rows="3">${esc(prep.alamat)}</textarea></label>
          <label class="f"><span>Attn</span><input class="input" id="eAttn" value="${esc(prep.attn)}"></label>
          <label class="f"><span>Telepon</span><input class="input" id="eTelp" inputmode="tel" value="${esc(prep.telp)}"></label>
          <label class="f w2"><span>Catatan (tampil di Keterangan)</span><input class="input" id="eCat" value="${esc(prep.catatan)}"></label>
        </div>
        <p class="hint">Barang ber-QR — mengurangi jumlah: produk yang terakhir di-scan dilepas dan kembali siap kirim; menambah: diambil dari produk ter-scan yang belum dikirim. Barang tanpa QR: jumlahnya langsung diganti (maksimal sisa target PO). Surat Jalan yang sudah ditagih invoice tidak bisa diedit.</p>`,
      onOpen: d => {
        const sum = () => {
          const n = $$('.e-qty', d).reduce((a, i) => a + (parseQty(i.value) || 0), 0);
          const was = prep.lines.reduce((a, l) => a + Number(l.diSJ), 0), u = esc(totalUnit(prep.lines) || 'barang');
          $('#eSum', d).textContent = `Total ${qtyText(n)} ${u}` + (Math.abs(n - was) > 1e-9 ? ` (sebelumnya ${qtyText(was)} ${u})` : '');
        };
        $('#eAddr', d).onchange = e => {
          const v = e.target.value; if (!v) return;
          const k = v[0] === 'k' ? c.kirim[+v.slice(1)] : { alamat: c.alamatTagih, attn: c.up, telp: c.telp };
          $('#eAlamat', d).value = k.alamat || ''; $('#eAttn', d).value = k.attn || ''; $('#eTelp', d).value = k.telp || '';
        };
        d.addEventListener('input', ev => { if (ev.target.classList.contains('e-qty')) sum(); });
        sum();
      },
      collect: d => {
        const tgl = $('#eTgl', d).value;
        if (!validDMY(tgl)) { $('#eTgl', d).classList.add('invalid'); throw new Error('Tanggal tidak valid. Format: DD/MM/YYYY.'); }
        const lines = $$('.e-qty', d).map((i, n) => {
          const l = prep.lines[n], q = i.disabled ? 0 : readQty(i, l, Number(l.diSJ) + Number(l.siap));
          return { deskripsi: l.deskripsi, idWarna: l.idWarna, idUkuran: l.idUkuran, qty: String(q) };
        });
        if (!lines.some(l => Number(l.qty) > 0)) throw new Error('Surat Jalan harus berisi minimal 1 barang. Bila tidak jadi dikirim, batalkan Surat Jalannya.');
        const v = id => $('#' + id, d).value.trim();
        if (!v('eNama') || !v('eAlamat')) throw new Error('Nama penerima dan alamat kirim wajib diisi.');
        return { noDN: no, tanggal: tgl, penerima: v('eNama'), alamat: v('eAlamat'), attn: v('eAttn'), telp: v('eTelp'), catatan: v('eCat'), lines };
      },
      action: data => api('updateDN', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    loadDN();
  }

  // v0.8.3: hapus permanen — barang kembali siap kirim dan nomornya dipakai Surat Jalan berikutnya.
  async function deleteDN(no) {
    const res = await modal({
      title: `Hapus ${no} permanen?`, icon: 'fa-trash', tone: 'bad', danger: true, confirmText: 'Hapus permanen',
      text: 'Surat Jalan (dan Packing List-nya) dihapus, barangnya kembali siap kirim, dan nomornya akan dipakai lagi oleh Surat Jalan berikutnya. Tindakan ini tidak bisa dibatalkan.',
      html: `<label class="f"><span>Alasan penghapusan *</span><input class="input" id="hAl" placeholder="mis. salah input, dibuat ulang"></label>
        <p class="hint">Surat Jalan yang sudah ditagih harus dihapus / dibatalkan invoice-nya dulu. Isi dokumen tetap dicatat di riwayat penghapusan (ikut di Backup).</p>`,
      collect: d => { const a = $('#hAl', d).value.trim(); if (a.length < 3) throw new Error('Isi alasan penghapusan.'); return a; },
      action: a => api('deleteDN', no, a)
    });
    if (res) { toast(res.message, 'ok'); loadDN(); }
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
      <div><b class="l">Nomor PO:</b><span class="v">${esc(dn.noPO)}</span>${second ? `<br><br><b class="l">${second[0]}</b><span class="v">${esc(second[1])}</span>` : ''}</div>
    </div>`;
  }
  function summaryTable(dn) {
    const total = dn.lines.reduce((a, l) => a + Number(l.qty), 0);
    const oneUnit = totalUnit(dn.lines);          // kosong = satuan berbeda-beda (mis. Kilogram + Pcs)
    // v0.8.1: kolom Satuan selalu ada; kolom Ukuran / Warna hanya tampil bila ada isinya (barang tanpa QR sering kosong)
    const showU = dn.lines.some(l => l.ukuran), showW = dn.lines.some(l => l.warna);
    const head = `<th class="c" style="width:9mm">No</th><th class="c" style="width:24mm">Jumlah</th><th style="width:22mm">Satuan</th>`
      + (showU ? '<th style="width:24mm">Ukuran</th>' : '') + (showW ? '<th style="width:32mm">Warna</th>' : '') + '<th>Deskripsi Produk</th>';
    const row = (l, i) => `<tr><td class="c">${i + 1}</td><td class="c">${qtyText(l.qty)}</td><td>${esc(docUnit(l.satuan))}</td>`
      + (showU ? `<td>${esc(l.ukuran || '-')}</td>` : '') + (showW ? `<td>${esc(l.warna || '-')}</td>` : '') + `<td>${esc(l.deskripsi)}</td></tr>`;
    const nCol = 4 + showU + showW;
    return `<table><thead><tr>${head}</tr></thead><tbody>
      ${dn.lines.map(row).join('')}
      <tr class="tot"><td colspan="${nCol}" class="c">Total Jumlah: ${oneUnit ? `${qtyText(total)} ${esc(oneUnit)}` : `${fmt(dn.lines.length)} jenis barang`}</td></tr>
    </tbody></table>`;
  }
  // Packing List: barang tanpa QR tidak punya kode item, jadi dicantumkan per jumlah.
  function noQRSection(dn) {
    const rows = dn.lines.filter(l => l.pakaiQr === false);
    if (!rows.length) return '';
    const showU = rows.some(l => l.ukuran), showW = rows.some(l => l.warna);
    return `<h2>Barang tanpa kode QR (${fmt(rows.length)} jenis)</h2>
      <table><thead><tr><th class="c" style="width:10mm">No</th><th class="c" style="width:24mm">Jumlah</th><th style="width:22mm">Satuan</th>${showU ? '<th style="width:22mm">Ukuran</th>' : ''}${showW ? '<th style="width:30mm">Warna</th>' : ''}<th>Deskripsi Produk</th></tr></thead><tbody>
        ${rows.map((l, i) => `<tr><td class="c">${i + 1}</td><td class="c">${qtyText(l.qty)}</td><td>${esc(docUnit(l.satuan))}</td>${showU ? `<td>${esc(l.ukuran || '-')}</td>` : ''}${showW ? `<td>${esc(l.warna || '-')}</td>` : ''}<td>${esc(l.deskripsi)}</td></tr>`).join('')}
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
      ${infoBlock(dn, ['No. Surat Jalan', dn.noDN], dn.jenis === 'TANPA_QR' ? null : ['No. Packing List:', dn.noPL])}
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
      ${dn.items.length ? `<h2>Rincian barang ber-QR (${fmt(dn.items.length)} item)</h2>
      <table><thead><tr><th class="c" style="width:10mm">No</th><th style="width:44mm">Kode Item</th><th style="width:22mm">Ukuran</th><th style="width:30mm">Warna</th><th>Deskripsi Produk</th></tr></thead><tbody>
        ${dn.items.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="mono">${esc(x.itemCode)}</td><td>${esc(x.ukuran)}</td><td>${esc(x.warna)}</td><td>${esc(x.deskripsi)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${noQRSection(dn)}
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
      // v0.8.1: PO Tanpa QR tidak memakai Packing List (cukup Surat Jalan)
      if (kind === 'pl' && r.dn.jenis === 'TANPA_QR') {
        if (w) w.close();
        return toast('Surat Jalan untuk PO Tanpa QR tidak memakai Packing List. Cetak Surat Jalan saja.', 'info');
      }
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
      <p class="hint">Satu Surat Jalan untuk satu PO. Barang ber-QR yang dikirim diambil dari hasil scan yang belum pernah dikirim; barang tanpa QR (bahan baku / trading) cukup diisi jumlahnya. Packing List memakai nomor yang sama dan berisi rincian kode item.
        Surat Jalan bisa <b>diedit</b> (tanggal, penerima, jumlah barang) selama belum ditagih invoice.</p>
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
      if (b.dataset.dact === 'hapus') return deleteDN(no);
      if (b.dataset.dact === 'edit') return editDN(no);
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
