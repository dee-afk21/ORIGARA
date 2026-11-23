/* =====================================================================
   Origara v0.4 — Surat Pesanan (portal pelanggan).
   - "Pesanan Saya"  : akun pelanggan membuat Surat Pesanan dan memantau pesanannya
                       (progres produksi, Surat Jalan, invoice) — hanya miliknya sendiri.
   - "Surat Pesanan" : staf menyetujui (menjadi PO, isi MOP & harga) atau menolak.
   Memakai fungsi bersama dari index.html, COA_PRINT, COA_DOC, dan COA_INV.
   ===================================================================== */
(function () {
  'use strict';
  const ui = { mine: null, all: null, query: '', status: 'Diajukan', timer: 0 };
  const ST = { Diajukan: 'warn', Disetujui: 'ok', Ditolak: 'warn', Dibatalkan: '' };
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const stTag = s => `<span class="tag ${ST[s.status] || ''}">${esc(s.status === 'Ditolak' ? 'Ditolak' : s.status)}</span>`;
  const totalQty = s => s.items.reduce((a, i) => a + i.qty, 0);
  const itemsLine = s => s.items.slice(0, 4).map(i => `${i.deskripsi} ${i.warna} ${i.ukuran} ×${fmt(i.qty)}`).join(' · ') + (s.items.length > 4 ? ` · +${s.items.length - 4} baris` : '');
  const JN = { PROFORMA: 'Proforma', INVOICE: 'Invoice', DP: 'Invoice DP', PELUNASAN: 'Invoice Pelunasan' };

  /* =====================================================================
     PESANAN SAYA (akun pelanggan)
     ===================================================================== */
  async function loadMine(btn) {
    if (!ui.mine) $('#myList').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listSP', '', ''));
    if (list) { ui.mine = list; renderMine(); }
  }
  function renderMine() {
    $('#myWho').textContent = state.user.pelanggan || '';
    const list = ui.mine || [];
    if (!list.length) {
      $('#myList').innerHTML = '<div class="card empty"><i class="fa-solid fa-cart-shopping"></i><b>Belum ada pesanan</b>Tekan "Buat Surat Pesanan" untuk memesan barang.</div>';
      return;
    }
    $('#myList').innerHTML = list.map(s => {
      const pr = s.progres || { target: 0, selesai: 0 };
      const pct = pr.target ? Math.min(100, Math.round(pr.selesai * 100 / pr.target)) : 0;
      return `<div class="rec" data-sp="${esc(s.no)}">
        <div class="rec-h">
          <div class="t"><b class="mono">${esc(s.no)}</b><small>${esc(dmy(s.tanggal))}${s.refPelanggan ? ' · Ref ' + esc(s.refPelanggan) : ''}${s.tglButuh ? ' · dibutuhkan ' + esc(dmy(s.tglButuh)) : ''}</small></div>
          ${stTag(s)}
        </div>
        <p>${esc(itemsLine(s))}</p>
        <div class="tags"><span class="tag">${fmt(totalQty(s))} pcs</span><span class="tag">Kirim ke ${esc(s.penerima)}</span></div>
        ${s.status === 'Ditolak' ? `<div class="note">Alasan: ${esc(s.alasan || '-')}</div>` : ''}
        ${s.status === 'Disetujui' ? `
          <div class="tags"><span class="tag ok">No. PO ${esc(s.noPO)}</span></div>
          <div><small class="hint">Produksi ${fmt(pr.selesai)} / ${fmt(pr.target)} pcs</small><div class="bar ${pct >= 100 ? 'full' : ''}"><i style="width:${pct}%"></i></div></div>
          ${s.suratJalan.length ? `<div class="sub-h">Pengiriman</div>${s.suratJalan.map(d => `<div class="row" style="justify-content:space-between"><span class="mono">${esc(d.no)} · ${esc(dmy(d.tanggal))} · ${fmt(d.qty)} pcs</span><span class="row"><button class="btn sm" data-myp="dn:${esc(d.no)}">Surat Jalan</button><button class="btn sm" data-myp="pl:${esc(d.no)}">Packing List</button></span></div>`).join('')}` : ''}
          ${s.tagihan.length ? `<div class="sub-h">Tagihan</div>${s.tagihan.map(v => `<div class="row" style="justify-content:space-between"><span><span class="mono">${esc(v.no)}</span> · ${esc(JN[v.jenis] || v.jenis)} · ${rupiah(v.total)}</span><button class="btn sm" data-myp="inv:${esc(v.no)}"><i class="fa-solid fa-print"></i></button></div>`).join('')}` : ''}` : ''}
        <div class="row" style="justify-content:flex-end">
          <button class="btn sm" data-myp="sp:${esc(s.no)}"><i class="fa-solid fa-print"></i> Cetak Surat Pesanan</button>
          ${s.status === 'Diajukan' ? '<button class="btn sm t-bad" data-mycancel><i class="fa-solid fa-xmark"></i> Batalkan</button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  function itemRowSP(it = {}) {
    return `<div class="sp-row">
      <input class="input s-desc" list="dlSpDesc" value="${esc(it.deskripsi)}" placeholder="Deskripsi barang" aria-label="Deskripsi barang">
      <input class="input s-warna" list="dlWarna" value="${esc(it.warna)}" placeholder="Warna" aria-label="Warna" autocomplete="off">
      <input class="input s-size" list="dlUkuran" value="${esc(it.ukuran)}" placeholder="Ukuran" aria-label="Ukuran" autocomplete="off">
      <input class="input s-qty num" type="number" min="1" inputmode="numeric" value="${esc(it.qty)}" placeholder="Jumlah" aria-label="Jumlah">
      <button type="button" class="btn icon t-bad" data-spdel aria-label="Hapus baris"><i class="fa-solid fa-trash"></i></button>
    </div>`;
  }
  async function newSP() {
    const prep = await run($('#btnNewSP'), () => api('spPrepare', ''));
    if (!prep) return;
    const c = prep.pelanggan;
    const addr = [...(c.kirim || []).map((k, i) => `<option value="k${i}">${esc(k.label || 'Alamat kirim ' + (i + 1))}</option>`),
      c.alamatTagih ? '<option value="tagih">Alamat kantor / penagihan</option>' : '', '<option value="manual">Ketik alamat lain</option>'].join('');
    const res = await modal({
      title: 'Buat Surat Pesanan', text: `${c.nama} · nomor ${prep.nomorBerikutnya} (perkiraan)`, icon: 'fa-cart-shopping', wide: true, sticky: true, confirmText: 'Kirim pesanan',
      html: `
        <div class="sub-h">Barang yang dipesan <button type="button" class="btn sm dashed" id="spAdd"><i class="fa-solid fa-plus"></i> Tambah baris</button></div>
        <div id="spRows" style="display:grid;gap:8px">${itemRowSP()}</div>
        <p class="hint" id="spSum"></p>
        <datalist id="dlSpDesc">${prep.deskripsi.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
        <div class="f2">
          <label class="f"><span>No. referensi Anda (opsional)</span><input class="input" id="spRef" placeholder="mis. nomor permintaan internal"></label>
          <div class="f"><span>Tanggal dibutuhkan (opsional)</span>${dateField('spButuh', '')}</div>
        </div>
        <div class="sub-h">Dikirim ke</div>
        <label class="f"><span>Alamat</span><select class="input" id="spAddr">${addr}</select></label>
        <div class="f2">
          <label class="f w2"><span>Nama penerima *</span><input class="input" id="spNama" value="${esc(c.nama)}"></label>
          <label class="f w2"><span>Alamat kirim *</span><textarea class="input" id="spAlamat" rows="2"></textarea></label>
          <label class="f"><span>Attn</span><input class="input" id="spAttn"></label>
          <label class="f"><span>Telepon</span><input class="input" id="spTelp" inputmode="tel"></label>
          <label class="f w2"><span>Catatan</span><textarea class="input" id="spCat" rows="2"></textarea></label>
        </div>`,
      onOpen: d => {
        const box = $('#spRows', d);
        const sum = () => { const n = $$('.s-qty', d).reduce((a, i) => a + (parseInt(i.value, 10) || 0), 0); $('#spSum', d).textContent = `${$$('.sp-row', d).length} baris · ${fmt(n)} pcs`; };
        const fill = () => {
          const v = $('#spAddr', d).value;
          const k = v[0] === 'k' ? c.kirim[+v.slice(1)] : v === 'tagih' ? { alamat: c.alamatTagih, attn: c.up, telp: c.telp } : { alamat: '', attn: '', telp: '' };
          $('#spAlamat', d).value = k.alamat || ''; $('#spAttn', d).value = k.attn || ''; $('#spTelp', d).value = k.telp || '';
        };
        $('#spAddr', d).onchange = fill; fill();
        $('#spAdd', d).onclick = () => {
          const last = $('.sp-row:last-child', box);
          box.insertAdjacentHTML('beforeend', itemRowSP(last ? { deskripsi: $('.s-desc', last).value, warna: $('.s-warna', last).value } : {}));
          $('.sp-row:last-child .s-size', box).focus(); sum();
        };
        box.addEventListener('click', e => { const b = e.target.closest('[data-spdel]'); if (b && $$('.sp-row', box).length > 1) { b.closest('.sp-row').remove(); sum(); } });
        box.addEventListener('input', sum); sum();
      },
      collect: d => {
        const items = $$('.sp-row', d).map((r, i) => {
          const it = { deskripsi: $('.s-desc', r).value.trim(), idWarna: idOf('warna', $('.s-warna', r).value), idUkuran: idOf('ukuran', $('.s-size', r).value),
                       qty: parseInt($('.s-qty', r).value, 10) || 0 };
          if (!it.deskripsi || !it.idWarna || !it.idUkuran || it.qty < 1) throw new Error(`Lengkapi barang baris ke-${i + 1} (deskripsi, warna, ukuran, jumlah).`);
          return it;
        });
        const v = id => $('#' + id, d).value.trim();
        if (v('spButuh') && !validDMY(v('spButuh'))) throw new Error('Tanggal dibutuhkan tidak valid. Format: DD/MM/YYYY.');
        if (!v('spNama') || !v('spAlamat')) throw new Error('Nama penerima dan alamat kirim wajib diisi.');
        return { items, refPelanggan: v('spRef'), tglButuh: v('spButuh'), penerima: v('spNama'), alamat: v('spAlamat'), attn: v('spAttn'), telp: v('spTelp'), catatan: v('spCat') };
      },
      action: data => api('saveSP', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    loadMine();
  }
  async function cancelMine(no) {
    const res = await modal({
      title: `Batalkan ${no}?`, text: 'Pesanan yang belum diproses bisa dibatalkan.', icon: 'fa-xmark', tone: 'bad', danger: true, confirmText: 'Batalkan pesanan',
      html: '<label class="f"><span>Alasan (opsional)</span><input class="input" id="cAl"></label>',
      collect: d => $('#cAl', d).value.trim(),
      action: a => api('cancelSP', no, a)
    });
    if (res) { toast(res.message, 'ok'); loadMine(); }
  }

  /* =====================================================================
     SURAT PESANAN (staf)
     ===================================================================== */
  async function loadAll(btn) {
    if (!ui.all) $('#spList').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listSP', ui.query, ui.status));
    if (list) { ui.all = list; renderAll(); }
  }
  function renderAll() {
    const chips = [['Diajukan', 'Perlu diproses'], ['', 'Semua'], ['Disetujui', 'Disetujui'], ['Ditolak', 'Ditolak'], ['Dibatalkan', 'Dibatalkan']];
    $('#spChips').innerHTML = chips.map(c => `<button type="button" class="chip ${ui.status === c[0] ? 'on' : ''}" data-spst="${c[0]}">${c[1]}</button>`).join('');
    const list = ui.all || [];
    if (!list.length) {
      $('#spList').innerHTML = `<div class="empty"><i class="fa-solid fa-inbox"></i><b>${ui.status === 'Diajukan' ? 'Tidak ada pesanan baru' : 'Tidak ada Surat Pesanan'}</b>Pesanan dari portal pelanggan akan muncul di sini.</div>`;
      return;
    }
    const kelola = can('sp.kelola');
    $('#spList').innerHTML = list.map(s => `
      <div class="li" data-sp="${esc(s.no)}">
        <div class="t"><b class="mono">${esc(s.no)}</b>
          <small>${esc(dmy(s.tanggal))} · ${esc(s.pelanggan)} · ${fmt(totalQty(s))} pcs${s.refPelanggan ? ' · Ref ' + esc(s.refPelanggan) : ''}${s.tglButuh ? ' · butuh ' + esc(dmy(s.tglButuh)) : ''}${s.noPO ? ' · PO ' + esc(s.noPO) : ''}</small>
          <small style="display:block">${esc(itemsLine(s))}</small></div>
        ${stTag(s)}
        <div class="acts">
          <button class="btn sm" data-spact="print" title="Cetak"><i class="fa-solid fa-print"></i></button>
          ${kelola && s.status === 'Diajukan' ? '<button class="btn sm t-ok" data-spact="ok"><i class="fa-solid fa-check"></i> Setujui</button><button class="btn sm icon t-bad" data-spact="no" aria-label="Tolak"><i class="fa-solid fa-xmark"></i></button>' : ''}
        </div>
      </div>`).join('');
  }
  async function approve(no) {
    const s = (ui.all || []).find(x => x.no === no);
    const res = await modal({
      title: `Setujui ${no}`, text: `${s.pelanggan} — menjadi PO internal`, icon: 'fa-check', tone: 'ok', wide: true, confirmText: 'Setujui & buat PO',
      html: `
        <div class="f2">
          <label class="f"><span>Nomor PO</span><input class="input mono" id="aPO" value="${esc(no)}"></label>
          <label class="f"><span>MOP *</span><input class="input" id="aMOP" placeholder="MCTG/26/13048"></label>
          <div class="f"><span>Tanggal produksi *</span>${dateField('aProd', todayDMY())}</div>
          <div class="f"><span>Tanggal PO</span><input class="input" value="${esc(dmy(s.tanggal))}" readonly></div>
        </div>
        <div class="sub-h">Harga & satuan per barang</div>
        <div class="list" style="padding:0">${s.items.map((i, k) => `
          <div class="li" style="display:grid;grid-template-columns:minmax(0,1fr) 120px 140px;gap:8px">
            <div class="t"><b>${esc(i.deskripsi)}</b><small>${esc(i.warna)} · ${esc(i.ukuran)} · ${fmt(i.qty)} pcs</small></div>
            <select class="input a-unit" data-k="${k}" aria-label="Satuan">${unitOptions('UM.0021')}</select>
            <div class="rp"><input class="input num a-price" data-k="${k}" inputmode="decimal" placeholder="Harga" aria-label="Harga satuan"></div>
          </div>`).join('')}</div>
        <p class="hint">Nomor PO bawaan = nomor Surat Pesanan (tampil di invoice dan XML Coretax sebagai nomor PO).</p>`,
      collect: d => {
        const mop = $('#aMOP', d).value.trim(), prod = $('#aProd', d).value;
        if (!mop) throw new Error('MOP wajib diisi.');
        if (!validDMY(prod)) throw new Error('Tanggal produksi tidak valid.');
        const items = $$('.a-price', d).map((el, k) => {
          const h = parsePrice(el.value);
          if (!Number.isFinite(h) || h <= 0) { el.classList.add('invalid'); throw new Error(`Isi harga barang baris ke-${k + 1}.`); }
          return { harga: h, satuan: $(`.a-unit[data-k="${k}"]`, d).value };
        });
        return { noSP: no, noPO: $('#aPO', d).value.trim(), mop, tglProduksi: prod, items };
      },
      action: data => api('approveSP', data)
    });
    if (!res) return;
    toast(res.message, 'ok');
    if (res.activePO) { state.activePO = res.activePO; if (typeof renderPOSelect === 'function') renderPOSelect(); }
    loadAll();
  }
  async function reject(no) {
    const res = await modal({
      title: `Tolak ${no}?`, text: 'Alasan penolakan akan dilihat pelanggan di portal.', icon: 'fa-xmark', tone: 'bad', danger: true, confirmText: 'Tolak pesanan',
      html: '<label class="f"><span>Alasan *</span><input class="input" id="rAl"></label>',
      collect: d => { const v = $('#rAl', d).value.trim(); if (!v) throw new Error('Isi alasan penolakan.'); return v; },
      action: a => api('rejectSP', no, a)
    });
    if (res) { toast(res.message, 'ok'); loadAll(); }
  }

  /* =====================================================================
     CETAK SURAT PESANAN
     ===================================================================== */
  function spPage(r) {
    const s = r.sp, total = totalQty(s);
    return `<div class="doc">${COA_DOC.header(r)}
      ${s.status === 'Dibatalkan' || s.status === 'Ditolak' ? `<div class="void">${s.status.toUpperCase()}</div>` : ''}
      <h1>SURAT PESANAN</h1><div class="sub">Sales Order - Pesanan Pelanggan</div>
      <div class="info">
        <div><b class="l">No. Surat Pesanan</b><span class="v">${esc(s.no)}</span></div>
        <div><b class="l">Tanggal</b><span class="v">${esc(dmy(s.tanggal))}</span></div>
        <div><b class="l">Pemesan:</b><span class="v">${esc(s.pelanggan)}</span>${s.refPelanggan ? `<br>Ref. pemesan: ${esc(s.refPelanggan)}` : ''}</div>
        <div><b class="l">Status:</b><span class="v">${esc(s.status)}</span>${s.noPO ? `<br><b class="l">Nomor PO:</b><span class="v">${esc(s.noPO)}</span>` : ''}</div>
        <div><b class="l">Dikirim ke:</b><span class="v">${esc(s.penerima)}</span><br>${esc(s.alamat).replace(/\n/g, '<br>')}${s.attn ? ` Attn. ${esc(s.attn)}` : ''}${s.telp ? ` - ${esc(s.telp)}` : ''}</div>
        <div><b class="l">Tanggal dibutuhkan:</b><span class="v">${esc(s.tglButuh ? dmy(s.tglButuh) : '-')}</span></div>
      </div>
      <table><thead><tr><th class="c" style="width:9mm">No</th><th>Deskripsi Produk</th><th style="width:32mm">Warna</th><th style="width:22mm">Ukuran</th><th class="c" style="width:22mm">Jumlah</th></tr></thead><tbody>
        ${s.items.map((i, k) => `<tr><td class="c">${k + 1}</td><td>${esc(i.deskripsi)}</td><td>${esc(i.warna)}</td><td>${esc(i.ukuran)}</td><td class="c">${fmt(i.qty)}</td></tr>`).join('')}
        <tr class="tot"><td colspan="4" class="c">Total Jumlah</td><td class="c">${fmt(total)}</td></tr></tbody></table>
      ${s.catatan ? `<div class="ket-h">CATATAN</div><div class="ket">${esc(s.catatan).replace(/\n/g, '<br>')}</div>` : ''}
      ${s.status === 'Ditolak' && s.alasan ? `<div class="ket-h">ALASAN PENOLAKAN</div><div class="ket">${esc(s.alasan)}</div>` : ''}
      <div class="foot"><p>Surat Pesanan ini dibuat melalui portal pelanggan oleh ${esc(s.dibuatOleh)} pada ${esc(s.dibuatAt)} dan berlaku sebagai dasar pesanan.</p>
        ${s.diprosesOleh ? `<p>${esc(s.status)} oleh ${esc(s.diprosesOleh)} pada ${esc(s.diprosesAt)}.</p>` : ''}</div>
    </div>`;
  }
  async function printSP(no) {
    let w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) w.document.write('<p style="font:16px Arial;padding:24px">Menyiapkan dokumen…</p>');
    try {
      const r = await api('getSP', no);
      COA_PRINT.open('Surat Pesanan ' + no, [spPage(r)], COA_DOC.DOC_CSS, { win: w });
    } catch (e) { if (w) w.close(); if (e.code !== 'AUTH') toast(e.message, 'bad'); }
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  const PAGES_HTML = `
    <section id="page-pesanan" class="page" hidden>
      <div class="card" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between">
        <div><h2 id="myWho"></h2><p class="muted" style="font-size:13.5px">Buat Surat Pesanan dan pantau produksi, pengiriman, serta tagihannya di sini.</p></div>
        <div class="row"><button class="btn icon" id="btnReloadMy" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn primary" id="btnNewSP"><i class="fa-solid fa-plus"></i> Buat Surat Pesanan</button></div>
      </div>
      <div class="grid-cards" id="myList"></div>
    </section>
    <section id="page-sp" class="page" hidden>
      <div class="page-bar">
        <div class="search" style="max-width:360px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="spSearch" type="search" placeholder="Cari nomor, pelanggan, referensi, PO…"></div>
        <button class="btn icon" id="btnReloadSP" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
      </div>
      <div class="chips" id="spChips"></div>
      <div class="card list" id="spList"></div>
      <p class="hint">Akun pelanggan dibuat di menu User (role "Pelanggan", pilih pelanggannya). Setelah disetujui, Surat Pesanan menjadi PO dan bisa langsung di-scan.</p>
    </section>`;

  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', PAGES_HTML);
    $('#btnNewSP').onclick = newSP;
    $('#btnReloadMy').onclick = e => loadMine(e.currentTarget);
    $('#myList').onclick = e => {
      const p = e.target.closest('[data-myp]');
      if (p) {
        const [k, no] = [p.dataset.myp.slice(0, p.dataset.myp.indexOf(':')), p.dataset.myp.slice(p.dataset.myp.indexOf(':') + 1)];
        if (k === 'sp') return printSP(no);
        if (k === 'inv') return COA_INV.print(no);
        return COA_DOC.printDN(no, k);
      }
      if (e.target.closest('[data-mycancel]')) cancelMine(e.target.closest('[data-sp]').dataset.sp);
    };
    $('#btnReloadSP').onclick = e => loadAll(e.currentTarget);
    $('#spSearch').oninput = e => { clearTimeout(ui.timer); ui.timer = setTimeout(() => { ui.query = e.target.value.trim(); loadAll(); }, 350); };
    $('#spChips').onclick = e => { const b = e.target.closest('[data-spst]'); if (b) { ui.status = b.dataset.spst; loadAll(); } };
    $('#spList').onclick = e => {
      const b = e.target.closest('[data-spact]'); if (!b) return;
      const no = b.closest('[data-sp]').dataset.sp;
      ({ print: printSP, ok: approve, no: reject })[b.dataset.spact](no);
    };
  }

  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [
      { id: 'pesanan', group: 'Portal', customer: true, perm: 'sp.pesan', label: 'Pesanan Saya', icon: 'fa-cart-shopping', title: 'Pesanan Saya',
        sub: 'Surat Pesanan, progres produksi, pengiriman, dan tagihan.', onShow: () => loadMine() },
      { id: 'sp', group: 'PO', order: 2, perm: 'sp.kelola', label: 'Surat Pesanan', icon: 'fa-inbox', title: 'Surat Pesanan Pelanggan',
        sub: 'Pesanan dari portal pelanggan: setujui menjadi PO atau tolak.', onShow: () => loadAll() }
    ]
  });
})();
