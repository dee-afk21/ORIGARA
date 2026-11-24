/* =====================================================================
   Origara v0.7 — Surat Penawaran (pengganti Surat Pesanan).
   Untuk klien yang TIDAK menerbitkan PO:
     staf membuat penawaran (barang + harga) -> cetak / kirim PDF ke klien ->
     setelah klien setuju (chat / telepon) staf menekan "Disetujui klien" -> otomatis jadi PO.
   - Menu "Penawaran" (staf, hak akses pnw.kelola).
   - Menu "Penawaran Saya" (akun pelanggan): melihat penawaran, progres, Surat Jalan & invoice miliknya.
   Template cetak ada di js/penawaran-cetak.js (COA_PNW), dipakai juga oleh pesan.html.
   ===================================================================== */
(function () {
  'use strict';
  const ui = { list: null, mine: null, query: '', status: 'Menunggu', timer: 0 };
  const ST = { Menunggu: 'warn', Disetujui: 'ok', Ditolak: '', Batal: '' };
  const ST_LABEL = { Menunggu: 'Menunggu jawaban klien', Disetujui: 'Disetujui · jadi PO', Ditolak: 'Ditolak klien', Batal: 'Dibatalkan' };
  const JN = { PROFORMA: 'Proforma', INVOICE: 'Invoice', DP: 'Invoice DP', PELUNASAN: 'Invoice Pelunasan' };
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const plusDaysDMY = n => { const d = new Date(Date.now() + n * 864e5), p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const totalQty = s => s.items.reduce((a, i) => a + i.qty, 0);
  const itemsLine = s => s.items.slice(0, 3).map(i => `${i.deskripsi} ${i.warna} ${i.ukuran} ×${fmt(i.qty)}`).join(' · ') + (s.items.length > 3 ? ` · +${s.items.length - 3} baris` : '');
  const stTag = s => `<span class="tag ${ST[s.status] || ''}">${esc(ST_LABEL[s.status] || s.status)}</span>`;

  /* =====================================================================
     DAFTAR PENAWARAN (staf)
     ===================================================================== */
  async function loadList(btn) {
    if (!ui.list) $('#pnwList').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listPNW', ui.query, ui.status));
    if (list) { ui.list = list; renderList(); }
  }
  function renderList() {
    const chips = [['Menunggu', 'Menunggu jawaban'], ['', 'Semua'], ['Disetujui', 'Disetujui'], ['Ditolak', 'Ditolak'], ['Batal', 'Dibatalkan']];
    $('#pnwChips').innerHTML = chips.map(c => `<button type="button" class="chip ${ui.status === c[0] ? 'on' : ''}" data-pst="${c[0]}">${c[1]}</button>`).join('');
    const list = ui.list || [];
    if (!list.length) {
      $('#pnwList').innerHTML = `<div class="card empty" style="grid-column:1/-1"><i class="fa-solid fa-file-signature"></i><b>${ui.query ? 'Tidak ditemukan' : 'Belum ada penawaran di sini'}</b>Tekan "Buat penawaran" untuk membuat Surat Penawaran baru.</div>`;
      return;
    }
    $('#pnwList').innerHTML = list.map(s => `
      <div class="rec" data-pnw="${esc(s.no)}">
        <div class="rec-h">
          <div class="t"><b class="mono">${esc(s.no)}</b><small>${esc(s.pelanggan)} · ${esc(dmy(s.tanggal))}</small></div>
          ${stTag(s)}
        </div>
        ${s.perihal ? `<p><b>${esc(s.perihal)}</b></p>` : ''}
        <p>${esc(itemsLine(s))}</p>
        <div class="tags">
          <span class="tag">${fmt(totalQty(s))} pcs</span>
          <span class="tag ok">Total ${rupiah(s.total)}</span>
          ${s.berlaku ? `<span class="tag ${s.kedaluwarsa ? 'warn' : ''}">${s.kedaluwarsa ? '<i class="fa-solid fa-clock"></i> Lewat masa berlaku ' : 'Berlaku s/d '}${esc(dmy(s.berlaku))}</span>` : ''}
          ${s.noPO ? `<span class="tag ok">PO ${esc(s.noPO)}</span>` : ''}
        </div>
        ${s.status === 'Ditolak' && s.alasan ? `<div class="note">Alasan: ${esc(s.alasan)}</div>` : ''}
        ${s.status === 'Batal' && s.alasan ? `<p class="hint">Dibatalkan: ${esc(s.alasan)}</p>` : ''}
        <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
          <button class="btn sm" data-pact="print"><i class="fa-solid fa-print"></i> Cetak</button>
          ${s.status === 'Menunggu' ? `
            <button class="btn sm" data-pact="edit"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn sm t-ok" data-pact="ok"><i class="fa-solid fa-handshake"></i> Disetujui klien</button>
            <button class="btn sm icon t-bad" data-pact="tolak" title="Klien menolak" aria-label="Klien menolak"><i class="fa-solid fa-thumbs-down"></i></button>
            <button class="btn sm icon t-bad" data-pact="batal" title="Batalkan penawaran" aria-label="Batalkan penawaran"><i class="fa-solid fa-ban"></i></button>` : ''}
          ${s.status === 'Ditolak' || s.status === 'Batal' ? '<button class="btn sm" data-pact="buka"><i class="fa-solid fa-rotate-left"></i> Buka lagi</button>' : ''}
        </div>
        <small class="hint">Dibuat ${esc(s.dibuatOleh)}${s.diubahOleh ? ` · diubah ${esc(s.diubahOleh)}` : ''}${s.diprosesOleh ? ` · diproses ${esc(s.diprosesOleh)}` : ''}</small>
      </div>`).join('');
  }

  /* =====================================================================
     BUAT / EDIT PENAWARAN
     ===================================================================== */
  function itemRow(it = {}) {
    return `<div class="sp-row pnw-row">
      <input class="input s-desc" list="dlPnwDesc" value="${esc(it.deskripsi)}" placeholder="Deskripsi barang" aria-label="Deskripsi barang">
      <input class="input s-warna" list="dlWarna" value="${esc(it.warna)}" placeholder="Warna" aria-label="Warna" autocomplete="off">
      <input class="input s-size" list="dlUkuran" value="${esc(it.ukuran)}" placeholder="Ukuran" aria-label="Ukuran" autocomplete="off">
      <input class="input s-qty num" type="number" min="1" inputmode="numeric" value="${esc(it.qty)}" placeholder="Qty" aria-label="Jumlah">
      <select class="input s-unit" aria-label="Satuan">${unitOptions(it.satuan || 'UM.0021')}</select>
      <div class="rp"><input class="input num s-price" inputmode="decimal" value="${it.harga ? esc(fmtPrice(it.harga)) : ''}" placeholder="Harga" aria-label="Harga satuan"></div>
      <button type="button" class="btn icon t-bad" data-rowdel aria-label="Hapus baris"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }
  async function editPNW(no) {
    let cur = null;
    if (no) { const r = await run(null, () => api('getPNW', no)); if (!r) return; cur = r.pnw; }
    const custs = (state.lookup.pelanggan || []).filter(c => c.aktif !== false || (cur && c.id === cur.idPelanggan));
    let prep = null;
    const res = await modal({
      title: no ? `Edit ${no}` : 'Buat Surat Penawaran', text: no ? 'Perubahan tersimpan dengan nomor yang sama.' : 'Barang + harga yang ditawarkan ke klien.',
      icon: 'fa-file-signature', wide: true, xwide: true, sticky: true, noEnter: true, confirmText: no ? 'Simpan perubahan' : 'Simpan penawaran',
      html: `
        <div class="f2">
          <label class="f w2"><span>Pelanggan *</span><select class="input" id="pCust" ${no ? 'disabled' : ''}><option value="">— Pilih pelanggan —</option>${custs.map(c =>
            `<option value="${esc(c.id)}" ${cur && cur.idPelanggan === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <div class="f"><span>Tanggal penawaran *</span>${dateField('pTgl', cur ? dmy(cur.tanggal) : todayDMY())}</div>
          <div class="f"><span>Berlaku sampai</span>${dateField('pBerlaku', cur ? dmy(cur.berlaku) : plusDaysDMY(14))}</div>
          <label class="f"><span>Perihal</span><input class="input" id="pPerihal" value="${esc(cur ? cur.perihal : '')}" placeholder="mis. Penawaran seragam kerja"></label>
          <label class="f"><span>Up. (kepada)</span><input class="input" id="pUp" value="${esc(cur ? cur.up : '')}" placeholder="mis. Bp. Andi / Dept. Procurement"></label>
        </div>
        <div class="sub-h">Barang & harga <button type="button" class="btn sm dashed" id="pAdd"><i class="fa-solid fa-plus"></i> Tambah baris</button></div>
        <div class="pnw-head"><div>Deskripsi</div><div>Warna</div><div>Ukuran</div><div>Qty</div><div>Satuan</div><div>Harga satuan</div><div></div></div>
        <div id="pRows" style="display:grid;gap:8px">${cur ? cur.items.map(itemRow).join('') : itemRow()}</div>
        <p class="hint" id="pSum"></p>
        <datalist id="dlPnwDesc"></datalist>
        <label class="f"><span>Syarat &amp; ketentuan</span><textarea class="input" id="pSyarat" rows="4" placeholder="mis. Harga belum termasuk ongkir. Pembayaran DP 50%, pelunasan sebelum kirim. Waktu produksi 14 hari kerja.">${esc(cur ? cur.syarat : '')}</textarea></label>
        <label class="f"><span>Catatan (opsional)</span><textarea class="input" id="pCat" rows="2">${esc(cur ? cur.catatan : '')}</textarea></label>`,
      onOpen: d => {
        const box = $('#pRows', d);
        const sum = () => {
          let q = 0, sub = 0;
          $$('.pnw-row', d).forEach(r => { const n = parseInt($('.s-qty', r).value, 10) || 0, h = parsePrice($('.s-price', r).value); q += n; sub += Number.isFinite(h) ? n * h : 0; });
          $('#pSum', d).textContent = `${$$('.pnw-row', d).length} baris · ${fmt(q)} pcs · subtotal ${rupiah(sub)} (PPN dihitung otomatis di dokumen)`;
        };
        const loadPrep = async id => {
          prep = null; if (!id) return;
          try { prep = await api('pnwPrepare', id); } catch (e) { toast(e.message, 'bad'); return; }
          $('#dlPnwDesc', d).innerHTML = prep.deskripsi.map(x => `<option value="${esc(x)}"></option>`).join('');
          if (!no && !$('#pUp', d).value) $('#pUp', d).value = prep.pelanggan.up || '';
          if (!$('#pSyarat', d).value) $('#pSyarat', d).value = prep.syarat || '';
        };
        $('#pCust', d).onchange = e => loadPrep(e.target.value);
        if (cur) loadPrep(cur.idPelanggan);
        $('#pAdd', d).onclick = () => {
          const last = $('.pnw-row:last-child', box);
          box.insertAdjacentHTML('beforeend', itemRow(last ? { deskripsi: $('.s-desc', last).value, warna: $('.s-warna', last).value, satuan: $('.s-unit', last).value, harga: parsePrice($('.s-price', last).value) || '' } : {}));
          $('.pnw-row:last-child .s-size', box).focus(); sum();
        };
        box.addEventListener('click', e => { const b = e.target.closest('[data-rowdel]'); if (b && $$('.pnw-row', box).length > 1) { b.closest('.pnw-row').remove(); sum(); } });
        box.addEventListener('input', sum); sum();
      },
      collect: d => {
        const id = $('#pCust', d).value;
        if (!id) throw new Error('Pilih pelanggan.');
        const v = k => $('#' + k, d).value.trim();
        if (!validDMY(v('pTgl'))) throw new Error('Tanggal penawaran tidak valid. Format: DD/MM/YYYY.');
        if (v('pBerlaku') && !validDMY(v('pBerlaku'))) throw new Error('Tanggal berlaku tidak valid. Format: DD/MM/YYYY.');
        const items = $$('.pnw-row', d).map((r, i) => {
          const it = { deskripsi: $('.s-desc', r).value.trim(), idWarna: idOf('warna', $('.s-warna', r).value), idUkuran: idOf('ukuran', $('.s-size', r).value),
                       qtyTarget: parseInt($('.s-qty', r).value, 10) || 0, satuan: $('.s-unit', r).value, harga: parsePrice($('.s-price', r).value) };
          if (!it.deskripsi || !it.idWarna || !it.idUkuran) throw new Error(`Lengkapi barang baris ke-${i + 1} (deskripsi, warna, ukuran).`);
          if (it.qtyTarget < 1) throw new Error(`Isi jumlah barang baris ke-${i + 1}.`);
          if (!Number.isFinite(it.harga) || it.harga <= 0) { $('.s-price', r).classList.add('invalid'); throw new Error(`Isi harga barang baris ke-${i + 1}.`); }
          return it;
        });
        return { no: no || '', idPelanggan: id, tanggal: v('pTgl'), berlaku: v('pBerlaku'), perihal: v('pPerihal'), up: v('pUp'), syarat: v('pSyarat'), catatan: v('pCat'), items };
      },
      action: data => api('savePNW', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    if (!no) { ui.status = 'Menunggu'; ui.query = ''; $('#pnwSearch').value = ''; }
    loadList();
    modal({
      title: 'Penawaran tersimpan', text: res.no, icon: 'fa-circle-check', tone: 'ok', noConfirm: true, cancelText: 'Tutup',
      html: `<p class="hint">Cetak / simpan PDF lalu kirim ke klien. Setelah klien setuju, tekan "Disetujui klien" pada penawaran ini.</p>
             <button type="button" class="btn primary block" data-p><i class="fa-solid fa-print"></i> Cetak Surat Penawaran</button>`,
      onOpen: (d, finish) => { $('[data-p]', d).onclick = () => { printPNW(res.no); finish(null); }; }
    });
  }

  /* =====================================================================
     STATUS: DISETUJUI (JADI PO) / DITOLAK / BATAL / BUKA LAGI
     ===================================================================== */
  async function approve(no) {
    const s = (ui.list || []).find(x => x.no === no); if (!s) return;
    const res = await modal({
      title: `Klien menyetujui ${no}?`, text: `${s.pelanggan} · total ${rupiah(s.total)}`, icon: 'fa-handshake', tone: 'ok', wide: true,
      confirmText: 'Setujui & buat PO',
      html: `
        ${s.kedaluwarsa ? '<div class="note">Penawaran ini sudah lewat masa berlaku. Pastikan harga masih sesuai.</div>' : ''}
        <div class="f2">
          <label class="f"><span>Nomor PO</span><input class="input mono" id="aPO" value="${esc(no)}"></label>
          <label class="f"><span>MOP *</span><input class="input" id="aMOP" placeholder="mis. MCTG/26/13048"></label>
          <div class="f"><span>Tanggal PO (tanggal klien setuju) *</span>${dateField('aTgl', todayDMY())}</div>
          <div class="f"><span>Tanggal produksi *</span>${dateField('aProd', todayDMY())}</div>
        </div>
        <div class="list" style="padding:0">${s.items.map(i => `<div class="li"><div class="t"><b>${esc(i.deskripsi)}</b><small>${esc(i.warna)} · ${esc(i.ukuran)} · ${fmt(i.qty)} × ${rupiah(i.harga)}</small></div></div>`).join('')}</div>
        <p class="hint">Barang, jumlah, harga, dan satuan ikut menjadi PO. Nomor PO bawaan = nomor penawaran (tampil di invoice dan XML Coretax sebagai nomor PO).</p>`,
      collect: d => {
        const mop = $('#aMOP', d).value.trim(), tgl = $('#aTgl', d).value, prod = $('#aProd', d).value;
        if (!mop) throw new Error('MOP wajib diisi.');
        if (!validDMY(tgl)) throw new Error('Tanggal PO tidak valid.');
        if (!validDMY(prod)) throw new Error('Tanggal produksi tidak valid.');
        return { no, noPO: $('#aPO', d).value.trim(), mop, tglPO: tgl, tglProduksi: prod };
      },
      action: data => api('approvePNW', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    if (res.activePO) { state.activePO = res.activePO; if (typeof renderPOSelect === 'function') renderPOSelect(); }
    loadList();
  }
  async function setStatus(no, st) {
    const cfg = {
      Ditolak: { title: `Klien menolak ${no}?`, icon: 'fa-thumbs-down', confirm: 'Tandai ditolak', label: 'Alasan klien menolak *', need: true },
      Batal: { title: `Batalkan ${no}?`, icon: 'fa-ban', confirm: 'Batalkan penawaran', label: 'Alasan (opsional)', need: false },
      Menunggu: { title: `Buka lagi ${no}?`, icon: 'fa-rotate-left', confirm: 'Buka lagi', label: '', need: false }
    }[st];
    const res = await modal({
      title: cfg.title, icon: cfg.icon, tone: st === 'Menunggu' ? '' : 'bad', danger: st !== 'Menunggu', confirmText: cfg.confirm,
      text: st === 'Menunggu' ? 'Penawaran kembali berstatus "Menunggu jawaban klien" dan bisa diedit lagi.' : '',
      html: cfg.label ? `<label class="f"><span>${cfg.label}</span><input class="input" id="sAl" placeholder="${st === 'Ditolak' ? 'mis. harga terlalu tinggi' : ''}"></label>` : '',
      collect: d => { const v = cfg.label ? $('#sAl', d).value.trim() : ''; if (cfg.need && !v) throw new Error('Isi alasannya.'); return v; },
      action: al => api('pnwStatus', no, st, al)
    });
    if (res) { toast(res.message, 'ok'); loadList(); }
  }

  /* =====================================================================
     CETAK
     ===================================================================== */
  async function printPNW(no) {
    let w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) w.document.write('<p style="font:16px Arial;padding:24px">Menyiapkan dokumen…</p>');
    try { COA_PNW.print(await api('getPNW', no), w); }
    catch (e) { if (w) w.close(); if (e.code !== 'AUTH') toast(e.message, 'bad'); }
  }

  /* =====================================================================
     PENAWARAN SAYA (akun pelanggan)
     ===================================================================== */
  async function loadMine(btn) {
    if (!ui.mine) $('#myList').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listPNW', '', ''));
    if (list) { ui.mine = list; renderMine(); }
  }
  function renderMine() {
    $('#myWho').textContent = state.user.pelanggan || '';
    const list = ui.mine || [];
    if (!list.length) {
      $('#myList').innerHTML = '<div class="card empty" style="grid-column:1/-1"><i class="fa-solid fa-file-signature"></i><b>Belum ada penawaran</b>Penawaran dari kami akan muncul di sini.</div>';
      return;
    }
    $('#myList').innerHTML = list.map(s => {
      const pr = s.progres || { target: 0, selesai: 0, dikirim: 0 };
      const pct = pr.target ? Math.min(100, Math.round(pr.selesai * 100 / pr.target)) : 0;
      return `<div class="rec" data-pnw="${esc(s.no)}">
        <div class="rec-h"><div class="t"><b class="mono">${esc(s.no)}</b><small>${esc(dmy(s.tanggal))}${s.perihal ? ' · ' + esc(s.perihal) : ''}</small></div>
          <span class="tag ${ST[s.status] || ''}">${esc({ Menunggu: 'Menunggu persetujuan Anda', Disetujui: 'Disetujui', Ditolak: 'Ditolak' }[s.status] || s.status)}</span></div>
        <p>${esc(itemsLine(s))}</p>
        <div class="tags"><span class="tag">${fmt(totalQty(s))} pcs</span><span class="tag ok">Total ${rupiah(s.total)}</span>${s.berlaku ? `<span class="tag">Berlaku s/d ${esc(dmy(s.berlaku))}</span>` : ''}</div>
        ${s.status === 'Disetujui' ? `
          <div class="tags"><span class="tag ok">No. PO ${esc(s.noPO)}</span></div>
          <div><small class="hint">Produksi ${fmt(pr.selesai)} / ${fmt(pr.target)} pcs · dikirim ${fmt(pr.dikirim)} pcs</small><div class="bar ${pct >= 100 ? 'full' : ''}"><i style="width:${pct}%"></i></div></div>
          ${(s.suratJalan || []).length ? `<div class="sub-h">Pengiriman</div>${s.suratJalan.map(d => `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="mono">${esc(d.no)} · ${esc(dmy(d.tanggal))} · ${fmt(d.qty)} pcs</span><span class="row"><button class="btn sm" data-myp="dn:${esc(d.no)}">Surat Jalan</button><button class="btn sm" data-myp="pl:${esc(d.no)}">Packing List</button></span></div>`).join('')}` : ''}
          ${(s.tagihan || []).length ? `<div class="sub-h">Tagihan</div>${s.tagihan.map(v => `<div class="row" style="justify-content:space-between"><span><span class="mono">${esc(v.no)}</span> · ${esc(JN[v.jenis] || v.jenis)} · ${rupiah(v.total)}</span><button class="btn sm" data-myp="inv:${esc(v.no)}"><i class="fa-solid fa-print"></i></button></div>`).join('')}` : ''}` : ''}
        ${s.status === 'Ditolak' && s.alasan ? `<div class="note">Alasan: ${esc(s.alasan)}</div>` : ''}
        <div class="row" style="justify-content:flex-end"><button class="btn sm" data-myp="pnw:${esc(s.no)}"><i class="fa-solid fa-print"></i> Cetak penawaran</button></div>
      </div>`;
    }).join('');
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  const PAGES_HTML = `
    <section id="page-pesanan" class="page" hidden>
      <div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between">
        <div><h2 id="myWho"></h2><p class="muted" style="font-size:13.5px">Penawaran harga dari kami, status persetujuan, produksi, pengiriman, dan tagihan.</p></div>
        <button class="btn icon" id="btnReloadMy" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
      </div>
      <div class="grid-cards" id="myList"></div>
    </section>
    <section id="page-pnw" class="page" hidden>
      <div class="page-bar">
        <div class="search" style="max-width:360px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="pnwSearch" type="search" placeholder="Cari nomor, pelanggan, perihal, PO…"></div>
        <div class="row"><button class="btn icon" id="btnReloadPNW" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn primary" id="btnNewPNW"><i class="fa-solid fa-plus"></i> Buat penawaran</button></div>
      </div>
      <div class="chips" id="pnwChips"></div>
      <div class="grid-cards" id="pnwList"></div>
      <p class="hint"><b>Alur:</b> buat penawaran → cetak / simpan PDF dan kirim ke klien → setelah klien setuju tekan <b>Disetujui klien</b> → otomatis menjadi PO dan bisa langsung di-scan.
        Klien juga bisa melihat penawarannya lewat link pelanggan (menu Pelanggan → ikon <i class="fa-solid fa-link"></i>).</p>
    </section>`;

  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', PAGES_HTML);
    $('#btnNewPNW').onclick = () => editPNW(null);
    $('#btnReloadPNW').onclick = e => loadList(e.currentTarget);
    $('#pnwSearch').oninput = e => { clearTimeout(ui.timer); ui.timer = setTimeout(() => { ui.query = e.target.value.trim(); loadList(); }, 350); };
    $('#pnwChips').onclick = e => { const b = e.target.closest('[data-pst]'); if (b) { ui.status = b.dataset.pst; loadList(); } };
    $('#pnwList').onclick = e => {
      const b = e.target.closest('[data-pact]'); if (!b) return;
      const no = b.closest('[data-pnw]').dataset.pnw;
      ({ print: printPNW, edit: editPNW, ok: approve, tolak: n => setStatus(n, 'Ditolak'), batal: n => setStatus(n, 'Batal'), buka: n => setStatus(n, 'Menunggu') })[b.dataset.pact](no);
    };
    $('#btnReloadMy').onclick = e => loadMine(e.currentTarget);
    $('#myList').onclick = e => {
      const p = e.target.closest('[data-myp]'); if (!p) return;
      const i = p.dataset.myp.indexOf(':'), k = p.dataset.myp.slice(0, i), no = p.dataset.myp.slice(i + 1);
      if (k === 'pnw') return printPNW(no);
      if (k === 'inv') return COA_INV.print(no);
      return COA_DOC.printDN(no, k);
    };
  }

  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [
      { id: 'pesanan', group: 'Portal', customer: true, perm: 'sp.pesan', label: 'Penawaran Saya', icon: 'fa-file-signature', title: 'Penawaran & Pesanan Saya',
        sub: 'Penawaran dari kami, progres produksi, pengiriman, dan tagihan.', onShow: () => loadMine() },
      { id: 'pnw', group: 'Pesanan', order: 1, perm: 'pnw.kelola', label: 'Penawaran', icon: 'fa-file-signature', title: 'Surat Penawaran',
        sub: 'Untuk klien tanpa PO: kirim penawaran, setelah disetujui klien otomatis jadi PO.', onShow: () => loadList() }
    ]
  });
})();
