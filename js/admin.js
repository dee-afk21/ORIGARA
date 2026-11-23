/* =====================================================================
   Origara v0.4 — modul halaman Data & Sistem:
   Pelanggan, Master QR, Role & Hak Akses, Pengaturan (perusahaan, bank,
   tanda tangan, gambar, penomoran, pajak).

   File ini dimuat SEBELUM skrip utama di index.html dan memakai fungsi
   bersama dari sana ($, $$, esc, api, run, modal, toast, state, can, ...).
   Semua fungsi di sini baru dipanggil setelah skrip utama selesai dimuat.
   ===================================================================== */
(function () {
  'use strict';

  const ui = {
    customers: null, custQuery: '',
    qr: null, qrQuery: '', qrTimer: 0,
    roles: null, katalog: [],
    settings: null, counters: null, setTab: 'perusahaan'
  };

  /* ---------- bantuan kecil ---------- */
  const field = (id, label, value, opt = {}) => {
    const attrs = `class="input" id="${id}" ${opt.ph ? `placeholder="${esc(opt.ph)}"` : ''} ${opt.mode ? `inputmode="${opt.mode}"` : ''} autocomplete="off"`;
    const input = opt.area ? `<textarea ${attrs} rows="${opt.rows || 3}">${esc(value)}</textarea>` : `<input ${attrs} value="${esc(value)}">`;
    return `<label class="f ${opt.w2 ? 'w2' : ''}"><span>${label}${opt.hint ? ` <small class="hint">${opt.hint}</small>` : ''}</span>${input}</label>`;
  };
  const val = (d, id) => { const el = $('#' + id, d); return el ? el.value.trim() : ''; };
  const digits = v => String(v || '').replace(/\D/g, '');
  const groupNPWP = v => { const s = digits(v); return s.length === 16 ? s.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4') : s; };
  const today = () => new Date();
  const pad2 = n => String(n).padStart(2, '0');

  /** Sama persis dengan coa.fmt_number di database. */
  function fmtNumber(f, n, d) {
    let r = String(f || '')
      .split('{YYYY}').join(d.getFullYear())
      .split('{YY}').join(String(d.getFullYear()).slice(2))
      .split('{MM}').join(pad2(d.getMonth() + 1))
      .split('{DD}').join(pad2(d.getDate()));
    const m = /\{N(?::(\d{1,2}))?\}/.exec(r);
    if (!m) return r + n;
    return r.replace(m[0], String(n).padStart(+(m[1] || 1), '0'));
  }

  /* =====================================================================
     PELANGGAN
     ===================================================================== */
  async function loadCustomers(btn) {
    if (!ui.customers) $('#custList').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listCustomers'));
    if (list) { ui.customers = list; renderCustomers(); }
  }
  function renderCustomers() {
    const list = ui.customers || [];
    const q = ui.custQuery.toLowerCase();
    const rows = list.filter(c => !q || [c.id, c.nama, c.npwp, c.alamatTagih].join(' ').toLowerCase().includes(q));
    $('#custCount').textContent = `${list.length} pelanggan · ${list.filter(c => !c.npwp).length} belum ada NPWP`;
    if (!rows.length) {
      $('#custList').innerHTML = `<div class="card empty" style="grid-column:1/-1"><i class="fa-solid fa-building"></i><b>${list.length ? 'Tidak ditemukan' : 'Belum ada pelanggan'}</b>${list.length ? 'Coba kata kunci lain.' : 'Tambahkan pelanggan pertama.'}</div>`;
      return;
    }
    $('#custList').innerHTML = rows.map(c => `
      <div class="rec ${c.aktif ? '' : 'off'}" data-cust="${esc(c.id)}">
        <div class="rec-h">
          <div class="t"><b>${esc(c.nama)}</b><small class="mono">${esc(c.id)}</small></div>
          <div class="acts">
            <button class="btn sm icon ${c.linkPesan ? 't-ok' : ''}" data-cact="link" title="Link pesanan (tanpa akun)" aria-label="Link pesanan"><i class="fa-solid fa-link"></i></button>
            <button class="btn sm icon" data-cact="edit" aria-label="Edit pelanggan"><i class="fa-solid fa-pen"></i></button>
            ${can('pelanggan.hapus') ? `<button class="btn sm icon t-bad" data-cact="del" aria-label="Hapus pelanggan" ${c.jumlahPO ? 'disabled title="Sudah dipakai di PO"' : ''}><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </div>
        <div class="tags">
          ${c.npwp ? `<span class="tag">NPWP ${esc(groupNPWP(c.npwp))}</span>` : '<span class="tag warn"><i class="fa-solid fa-triangle-exclamation"></i> NPWP belum diisi</span>'}
          <span class="tag">${fmt(c.jumlahPO)} PO</span>
          <span class="tag">${fmt(c.kirim.length)} alamat kirim</span>
          ${c.aktif ? '' : '<span class="tag warn">Nonaktif</span>'}
          ${c.linkPesan ? '<span class="tag ok"><i class="fa-solid fa-link"></i> Link pesanan aktif</span>' : ''}
        </div>
        ${c.alamatTagih ? `<p><b>Tagihan:</b> ${esc(c.alamatTagih)}${c.up ? `\nUp. ${esc(c.up)}` : ''}</p>` : '<p class="muted">Alamat penagihan belum diisi.</p>'}
      </div>`).join('');
  }

  /* ---------- link pesanan tanpa akun (v0.6.0) ---------- */
  // Alamat halaman pesan.html di folder yang sama dengan aplikasi (mode uji ikut dibawa).
  const linkURL = tok => new URL('pesan.html', location.href).href + '?k=' + tok + (new URLSearchParams(location.search).has('uji') ? '&uji' : '');
  async function customerLink(id) {
    const c = (ui.customers || []).find(x => x.id === id); if (!c) return;
    const setLink = async (mode, btn) => {
      const r = await run(btn, () => api('customerLink', id, mode));
      if (!r) return false;
      c.linkPesan = r.link; toast(r.message, 'ok'); renderCustomers(); return true;
    };
    const body = () => c.linkPesan ? `
        <label class="f"><span>Link pesanan ${esc(c.nama)}</span>
          <div class="with-btn"><input class="input mono" id="lkUrl" value="${esc(linkURL(c.linkPesan))}" readonly><button type="button" class="btn primary" id="lkCopy"><i class="fa-solid fa-copy"></i> Salin</button></div></label>
        <div class="row" style="flex-wrap:wrap">
          <a class="btn" id="lkWa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Link pemesanan ' + c.nama + ': ' + linkURL(c.linkPesan))}"><i class="fa-brands fa-whatsapp"></i> Kirim lewat WhatsApp</a>
          <a class="btn" target="_blank" rel="noopener" href="${esc(linkURL(c.linkPesan))}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka</a>
        </div>
        <p class="hint">Siapa pun yang memegang link ini bisa memesan atas nama ${esc(c.nama)} dan melihat status pesanannya (tanpa Surat Jalan &amp; invoice). Bagikan hanya ke orang yang berwenang.</p>
        <div class="row" style="flex-wrap:wrap">
          <button type="button" class="btn sm" id="lkNew"><i class="fa-solid fa-rotate"></i> Ganti link</button>
          <button type="button" class="btn sm t-bad" id="lkOff"><i class="fa-solid fa-link-slash"></i> Matikan link</button>
        </div>
        <p class="hint">"Ganti link" membuat link lama langsung tidak berlaku — pakai bila link tersebar ke orang yang tidak berhak.</p>`
      : `<p>Pelanggan ini belum punya link pesanan. Dengan link, pelanggan bisa membuat Surat Pesanan dan memantau statusnya <b>tanpa username &amp; password</b>.</p>
         ${c.aktif ? '<button type="button" class="btn primary" id="lkMake"><i class="fa-solid fa-link"></i> Buat link pesanan</button>' : '<div class="note">Pelanggan nonaktif. Aktifkan dulu lewat Edit.</div>'}`;
    await modal({
      title: 'Link pesanan', text: c.nama, icon: 'fa-link', noConfirm: true, cancelText: 'Tutup', wide: true,
      html: '<div id="lkBody" style="display:grid;gap:14px"></div>',
      onOpen: d => {
        const draw = () => {
          $('#lkBody', d).innerHTML = body();
          const on = (sel, fn) => { const el = $(sel, d); if (el) el.onclick = fn; };
          on('#lkMake', async e => { if (await setLink('buat', e.currentTarget)) draw(); });
          on('#lkNew', async e => { if (confirm('Ganti link? Link lama langsung tidak berlaku.') && await setLink('buat', e.currentTarget)) draw(); });
          on('#lkOff', async e => { if (confirm('Matikan link pesanan pelanggan ini?') && await setLink('hapus', e.currentTarget)) draw(); });
          on('#lkCopy', async e => {
            const inp = $('#lkUrl', d); inp.select();
            try { await navigator.clipboard.writeText(inp.value); } catch (err) { document.execCommand('copy'); }
            e.currentTarget.innerHTML = '<i class="fa-solid fa-check"></i> Tersalin';
          });
        };
        draw();
      }
    });
  }

  const addrBlock = (a = {}) => `
    <div class="addr">
      <div class="addr-h"><input class="input a-label" value="${esc(a.label)}" placeholder="Nama lokasi, mis. Gudang Cikarang" autocomplete="off">
        <button type="button" class="btn icon t-bad" data-addr-del aria-label="Hapus alamat"><i class="fa-solid fa-trash"></i></button></div>
      <textarea class="input a-alamat" rows="2" placeholder="Alamat lengkap pengiriman">${esc(a.alamat)}</textarea>
      <div class="f2"><input class="input a-attn" value="${esc(a.attn)}" placeholder="Attn / penerima" autocomplete="off">
        <input class="input a-telp" value="${esc(a.telp)}" placeholder="No. telepon" inputmode="tel" autocomplete="off"></div>
    </div>`;

  /**
   * Form tambah / edit pelanggan. Dipakai juga dari form PO (tombol tambah pelanggan).
   * Mengembalikan data pelanggan yang tersimpan, atau null bila dibatalkan.
   */
  async function editCustomer(id, presetName) {
    if (!ui.customers && id) await loadCustomers();
    const c = id ? (ui.customers || []).find(x => x.id === id) : null;
    const v = c || { id: '', nama: presetName || '', npwp: '', idtku: '', alamatNpwp: '', alamatTagih: '', up: '', telp: '', email: '', kirim: [], catatan: '', aktif: true };
    const res = await modal({
      title: c ? `Edit ${c.nama}` : 'Tambah pelanggan', icon: 'fa-building', wide: true, confirmText: 'Simpan pelanggan',
      html: `
        <div class="f2">
          ${field('cId', 'Kode pelanggan *', v.id, { ph: 'mis. 15 atau MMP', hint: c && c.jumlahPO ? '(mengubah kode ikut mengubah PO-nya)' : '' })}
          ${field('cNama', 'Nama perusahaan *', v.nama, { ph: 'PT. ...' })}
          ${field('cNpwp', 'NPWP', v.npwp, { mode: 'numeric', ph: '16 digit', hint: '(untuk faktur pajak)' })}
          ${field('cIdtku', 'ID TKU', v.idtku, { mode: 'numeric', ph: 'Otomatis: NPWP + 000000' })}
          ${field('cAlamatNpwp', 'Alamat sesuai NPWP', v.alamatNpwp, { area: true, rows: 2, w2: true, hint: '(dipakai di Coretax)' })}
        </div>
        <label class="switch"><input type="checkbox" id="cSame" ${!v.alamatTagih || v.alamatTagih === v.alamatNpwp ? 'checked' : ''}> Alamat penagihan sama dengan alamat NPWP</label>
        <div class="f2">
          ${field('cAlamatTagih', 'Alamat penagihan (Bill To)', v.alamatTagih, { area: true, rows: 2, w2: true })}
          ${field('cUp', 'Up / Attn invoice', v.up, { ph: 'mis. Dept. Procurement' })}
          ${field('cTelp', 'Telepon', v.telp, { mode: 'tel' })}
          ${field('cEmail', 'Email', v.email, { mode: 'email' })}
        </div>
        <div class="sub-h">Alamat pengiriman <button type="button" class="btn sm dashed" id="cAddAddr"><i class="fa-solid fa-plus"></i> Tambah alamat</button></div>
        <div id="cAddrs" style="display:grid;gap:8px">${v.kirim.map(addrBlock).join('')}</div>
        <p class="hint" id="cAddrHint" ${v.kirim.length ? 'hidden' : ''}>Belum ada alamat pengiriman. Surat Jalan bisa memakai alamat penagihan atau alamat yang diketik saat itu.</p>
        ${field('cCatatan', 'Catatan', v.catatan, { area: true, rows: 2 })}
        <label class="switch"><input type="checkbox" id="cAktif" ${v.aktif ? 'checked' : ''}> Pelanggan aktif (muncul di pilihan PO)</label>`,
      onOpen: d => {
        const same = $('#cSame', d), tagih = $('#cAlamatTagih', d).closest('.f');
        const syncSame = () => { tagih.hidden = same.checked; };
        same.onchange = syncSame; syncSame();
        $('#cNpwp', d).addEventListener('input', () => {
          const n = digits($('#cNpwp', d).value), t = $('#cIdtku', d);
          if (!t.dataset.manual) t.value = n.length === 16 ? n + '000000' : n.length === 15 ? '0' + n + '000000' : '';
        });
        $('#cIdtku', d).addEventListener('input', e => { e.target.dataset.manual = e.target.value ? '1' : ''; });
        const box = $('#cAddrs', d), hint = $('#cAddrHint', d);
        $('#cAddAddr', d).onclick = () => { box.insertAdjacentHTML('beforeend', addrBlock()); hint.hidden = true; $('.addr:last-child .a-label', box).focus(); };
        box.onclick = e => { const b = e.target.closest('[data-addr-del]'); if (b) { b.closest('.addr').remove(); hint.hidden = !!box.children.length; } };
      },
      collect: d => {
        const npwp = digits(val(d, 'cNpwp'));
        if (!val(d, 'cId') || !val(d, 'cNama')) throw new Error('Kode dan nama pelanggan wajib diisi.');
        if (npwp && npwp.length !== 15 && npwp.length !== 16) throw new Error('NPWP harus 15 atau 16 digit angka.');
        return {
          asal: c ? c.id : '', id: val(d, 'cId'), nama: val(d, 'cNama'), npwp, idtku: digits(val(d, 'cIdtku')),
          alamatNpwp: val(d, 'cAlamatNpwp'),
          alamatTagih: $('#cSame', d).checked ? val(d, 'cAlamatNpwp') : val(d, 'cAlamatTagih'),
          up: val(d, 'cUp'), telp: val(d, 'cTelp'), email: val(d, 'cEmail'), catatan: val(d, 'cCatatan'),
          aktif: $('#cAktif', d).checked,
          kirim: $$('.addr', d).map(a => ({ label: $('.a-label', a).value.trim(), alamat: $('.a-alamat', a).value.trim(), attn: $('.a-attn', a).value.trim(), telp: $('.a-telp', a).value.trim() }))
                               .filter(a => a.alamat)
        };
      },
      action: data => api('saveCustomer', data).then(r => Object.assign(r, { saved: data }))
    });
    if (!res) return null;
    ui.customers = res.customers;
    setLookup(res.lookup);
    toast(res.message, 'ok');
    if (state.page === 'pelanggan') renderCustomers();
    return res.customers.find(x => x.id === res.saved.id) || null;
  }
  async function deleteCustomer(id) {
    const c = (ui.customers || []).find(x => x.id === id);
    if (!c) return;
    const res = await modal({
      title: `Hapus ${c.nama}?`, text: 'Data pelanggan dihapus permanen. Pelanggan yang sudah dipakai di PO tidak bisa dihapus.',
      icon: 'fa-trash', tone: 'bad', danger: true, confirmText: 'Hapus',
      action: () => api('deleteCustomer', id)
    });
    if (!res) return;
    ui.customers = res.customers; setLookup(res.lookup); renderCustomers(); toast(res.message, 'ok');
  }

  /* =====================================================================
     MASTER QR
     ===================================================================== */
  async function loadQR(btn) {
    if (!ui.qr) $('#qrItems').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const r = await run(btn, () => api('listQR', ui.qrQuery));
    if (r) { ui.qr = r; renderQR(); }
  }
  function renderQR() {
    const r = ui.qr;
    const stat = (icon, v, label) => `<div class="stat"><i class="fa-solid ${icon}"></i><div><b>${v}</b><small>${label}</small></div></div>`;
    $('#qrStats').innerHTML = stat('fa-qrcode', fmt(r.total), 'Kode terdaftar') + stat('fa-box', fmt(r.terpakai), 'Sudah di-scan') +
      stat('fa-boxes-packing', fmt(r.total - r.terpakai), 'Siap dipakai');
    const del = can('qr.hapus');
    $('#qrBatches').innerHTML = r.batches.length ? r.batches.map(b => `
      <div class="li" data-batch="${esc(b.batch)}">
        <span class="id">${fmt(b.jumlah)}</span>
        <div class="t"><b class="mono">${esc(b.batch || '(tanpa batch)')}</b><small>${fmt(b.terpakai)} sudah di-scan · ${fmt(b.jumlah - b.terpakai)} sisa</small></div>
        <div class="acts">
          <button class="btn sm" data-qbatch="show">Lihat</button>
          ${del ? `<button class="btn sm icon t-bad" data-qbatch="del" aria-label="Hapus batch" ${b.terpakai >= b.jumlah ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </div>`).join('') : '<div class="empty"><i class="fa-solid fa-qrcode"></i><b>Belum ada kode QR</b>Impor dari file Excel di atas.</div>';
    $('#qrItems').innerHTML = r.items.length ? r.items.map(x => `
      <div class="li" data-qcode="${esc(x.itemCode)}">
        <div class="t"><b class="mono">${esc(x.itemCode)}</b><small>${esc(x.batch || '-')}${x.url !== x.itemCode ? ' · ' + esc(x.url) : ''}</small></div>
        ${x.noPO ? `<span class="tag ok">PO ${esc(x.noPO)}</span>` : '<span class="tag">Belum di-scan</span>'}
        ${del && !x.noPO ? '<div class="acts"><button class="btn sm icon t-bad" data-qdel aria-label="Hapus kode"><i class="fa-solid fa-trash"></i></button></div>' : ''}
      </div>`).join('') + (r.items.length >= 100 ? '<p class="hint" style="padding:10px 14px">Menampilkan 100 kode terbaru. Ketik kata kunci untuk mencari kode lain.</p>' : '')
      : `<div class="empty"><b>${ui.qrQuery ? 'Kode tidak ditemukan' : 'Belum ada kode'}</b></div>`;
  }

  const QR_ALIASES = {
    itemCode: ['item_code', 'itemcode', 'item code', 'kode item', 'kode', 'serial', 'serial number', 'code'],
    batch: ['batch_id', 'batch', 'batch id', 'batchid', 'kode batch'],
    url: ['url', 'link', 'qr', 'isi qr', 'qr content', 'qr_url']
  };
  async function readQRFile(file) {
    await loadScript(LIB.xlsx);
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    const norm = v => String(v || '').trim().toLowerCase();
    const hi = rows.findIndex(r => r.some(c => QR_ALIASES.itemCode.includes(norm(c))));
    if (hi < 0) throw new Error('Kolom item_code tidak ditemukan. Pakai template (kolom: item_code, batch_id, url).');
    const head = rows[hi].map(norm);
    const col = k => head.findIndex(h => QR_ALIASES[k].includes(h));
    const ci = col('itemCode'), cb = col('batch'), cu = col('url');
    const data = rows.slice(hi + 1)
      .map(r => ({ itemCode: String(r[ci] || '').trim(), batch: cb >= 0 ? String(r[cb] || '').trim() : '', url: cu >= 0 ? String(r[cu] || '').trim() : '' }))
      .filter(x => x.itemCode);
    return { data, hasBatch: cb >= 0, hasUrl: cu >= 0, sheet: wb.SheetNames[0] };
  }
  async function importQR(file) {
    let parsed;
    try { parsed = await readQRFile(file); }
    catch (e) { return toast(e.message || 'File tidak bisa dibaca.', 'bad'); }
    if (!parsed.data.length) return toast('Tidak ada baris berisi item_code di file ini.', 'bad');
    const sample = parsed.data.slice(0, 4);
    const res = await modal({
      title: 'Impor Master QR', text: `${file.name} · sheet "${parsed.sheet}"`, icon: 'fa-file-import', wide: true, sticky: true,
      confirmText: `Impor ${fmt(parsed.data.length)} kode`,
      html: `
        <div class="kv"><span>Baris terbaca <b>${fmt(parsed.data.length)}</b></span><span>Kolom batch <b>${parsed.hasBatch ? 'ada' : 'tidak ada'}</b></span><span>Kolom url <b>${parsed.hasUrl ? 'ada' : 'tidak ada'}</b></span></div>
        ${parsed.hasBatch ? '' : field('qBatch', 'Batch ID untuk semua baris', '', { ph: 'mis. MLY260427A', hint: '(boleh kosong)' })}
        ${parsed.hasUrl ? '' : '<div class="note">Tidak ada kolom url: isi QR dianggap sama dengan item_code.</div>'}
        <div class="list">${sample.map(x => `<div class="li"><div class="t"><b class="mono">${esc(x.itemCode)}</b><small>${esc(x.batch || '-')} · ${esc(x.url || x.itemCode)}</small></div></div>`).join('')}</div>
        <p class="hint">Kode yang sudah terdaftar dilewati (tidak ditimpa).</p>
        <div class="progress-line" id="qProg"></div>`,
      collect: d => ({ batch: parsed.hasBatch ? null : val(d, 'qBatch') }),
      action: async opt => {
        const rows = opt.batch === null ? parsed.data : parsed.data.map(x => Object.assign({}, x, { batch: opt.batch }));
        const total = { masuk: 0, dilewati: 0 };
        const prog = $('#qProg');
        for (let i = 0; i < rows.length; i += 1000) {
          prog.textContent = `Mengirim ${fmt(Math.min(i + 1000, rows.length))} / ${fmt(rows.length)}…`;
          const r = await api('importQR', rows.slice(i, i + 1000));
          total.masuk += r.masuk; total.dilewati += r.dilewati;
        }
        return total;
      }
    });
    if (!res) return;
    toast(`${fmt(res.masuk)} kode baru masuk${res.dilewati ? `, ${fmt(res.dilewati)} dilewati karena sudah terdaftar` : ''}.`, 'ok');
    ui.qrQuery = ''; $('#qrSearch').value = '';
    loadQR();
  }
  async function downloadQRTemplate(btn) {
    await run(btn, async () => {
      await loadScript(LIB.xlsx);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['item_code', 'batch_id', 'url'],
        ['MLY260427A-01', 'MLY260427A', 'https://contoh.link/verifikasi/MLY260427A-01'],
        ['MLY260427A-02', 'MLY260427A', 'https://contoh.link/verifikasi/MLY260427A-02']
      ]), 'Master_QR');
      XLSX.writeFile(wb, 'template_master_qr.xlsx');
    });
  }
  async function deleteQR(mode, value) {
    const res = await modal({
      title: mode === 'batch' ? `Hapus batch ${value || '(tanpa batch)'}?` : `Hapus kode ${value}?`,
      text: mode === 'batch' ? 'Semua kode di batch ini yang belum di-scan akan dihapus. Kode yang sudah di-scan tetap disimpan.' : 'Kode ini akan dihapus dari Master QR.',
      icon: 'fa-trash', tone: 'bad', danger: true, confirmText: 'Hapus',
      action: () => api('deleteQR', mode, value)
    });
    if (res) { toast(res.message, 'ok'); loadQR(); }
  }

  /* =====================================================================
     ROLE & HAK AKSES
     ===================================================================== */
  async function loadRoles(btn) {
    if (!ui.roles) $('#roleList').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    const r = await run(btn, () => api('listRoles'));
    if (r) { ui.roles = r.roles; ui.katalog = r.katalog; state.roles = r.roles; renderRoles(); }
  }
  function renderRoles() {
    const label = k => (ui.katalog.find(x => x.key === k) || { label: k }).label;
    $('#roleList').innerHTML = ui.roles.map(r => {
      const mine = r.nama === state.user.role;
      const editable = isAdmin() || (!mine && !r.sistem && r.perms.every(p => can(p)));
      return `<div class="rec" data-role="${esc(r.nama)}">
        <div class="rec-h">
          <div class="t"><b>${esc(r.nama)} ${mine ? '<small>(role Anda)</small>' : ''}</b><small>${esc(r.keterangan || '')}</small></div>
          <div class="acts">
            <button class="btn sm icon" data-ract="edit" aria-label="Edit role" ${editable ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
            ${r.sistem ? '' : `<button class="btn sm icon t-bad" data-ract="del" aria-label="Hapus role" ${editable && !r.jumlahUser ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>`}
          </div>
        </div>
        <div class="tags"><span class="tag">${fmt(r.jumlahUser)} user</span>${r.sistem ? '<span class="tag ok">Semua akses</span>' : `<span class="tag">${fmt(r.perms.length)} dari ${fmt(ui.katalog.length)} akses</span>`}</div>
        ${r.sistem ? '' : `<p>${r.perms.length ? r.perms.map(label).map(esc).join(' · ') : '<span class="muted">Belum ada akses.</span>'}</p>`}
      </div>`;
    }).join('');
  }
  async function editRole(name) {
    const r = name ? ui.roles.find(x => x.nama === name) : null;
    const v = r || { nama: '', keterangan: '', perms: ['scan', 'cekqr'], sistem: false };
    const groups = [...new Set(ui.katalog.map(k => k.grup))];
    const res = await modal({
      title: r ? `Edit role ${r.nama}` : 'Tambah role', icon: 'fa-user-shield', wide: true, confirmText: 'Simpan role',
      html: `
        <div class="f2">
          ${field('rNama', 'Nama role / jabatan *', v.nama, { ph: 'mis. Staff Gudang' })}
          ${field('rKet', 'Keterangan', v.keterangan, { ph: 'Singkat, tampil di pilihan role' })}
        </div>
        ${v.sistem ? '<div class="note">Role Admin selalu punya semua akses dan tidak bisa dibatasi. Hanya keterangannya yang bisa diubah.</div>' : ''}
        <div class="sub-h">Hak akses <span><button type="button" class="btn sm ghost" data-rall="1">Pilih semua</button><button type="button" class="btn sm ghost" data-rall="0">Kosongkan</button></span></div>
        <div class="f2">${groups.map(g => `<div class="perm-grp"><b>${esc(g)}</b>${ui.katalog.filter(k => k.grup === g).map(k => {
          const lock = v.sistem || (!isAdmin() && !can(k.key));
          return `<label ${lock && !v.sistem ? 'title="Anda sendiri tidak punya akses ini"' : ''}><input type="checkbox" value="${esc(k.key)}" ${v.sistem || v.perms.includes(k.key) ? 'checked' : ''} ${lock ? 'disabled' : ''}> ${esc(k.label)}</label>`;
        }).join('')}</div>`).join('')}</div>`,
      onOpen: d => $$('[data-rall]', d).forEach(b => b.onclick = () => $$('.perm-grp input:not(:disabled)', d).forEach(i => { i.checked = b.dataset.rall === '1'; })),
      collect: d => {
        const nama = val(d, 'rNama');
        if (!nama) throw new Error('Nama role wajib diisi.');
        return { asal: r ? r.nama : '', nama, keterangan: val(d, 'rKet'), perms: $$('.perm-grp input:checked', d).map(i => i.value) };
      },
      action: data => api('saveRole', data)
    });
    if (!res) return;
    ui.roles = res.roles; state.roles = res.roles; renderRoles(); toast(res.message, 'ok');
  }
  async function deleteRole(name) {
    const res = await modal({
      title: `Hapus role ${name}?`, text: 'Role yang masih dipakai user tidak bisa dihapus.', icon: 'fa-trash', tone: 'bad', danger: true, confirmText: 'Hapus',
      action: () => api('deleteRole', name)
    });
    if (res) { ui.roles = res.roles; state.roles = res.roles; renderRoles(); toast(res.message, 'ok'); }
  }

  /* =====================================================================
     PENGATURAN
     ===================================================================== */
  const SET_TABS = { perusahaan: 'Perusahaan', bank: 'Bank & Tanda Tangan', gambar: 'Kop, Logo & TTD', nomor: 'Penomoran', pajak: 'Pajak', sertifikat: 'Sertifikat' };
  const CERT_KEYS = { serial: 'Kode item / serial', batch: 'Batch', pelanggan: 'Nama pelanggan', no_po: 'Nomor PO', tgl_po: 'Tanggal PO',
    warna: 'Warna', ukuran: 'Ukuran', tgl_produksi: 'Tanggal produksi', tgl_kirim: 'Tanggal kirim', deskripsi: 'Deskripsi produk' };
  const CERT_SAMPLE = { serial: 'ABC2026-0001', batch: 'ABC2026', deskripsi: 'NAMA PRODUK CONTOH',
    pelanggan: 'PT. CONTOH PELANGGAN', noPO: 'PO-2026-001', tglPO: '2026-04-21', warna: 'ROYAL BLUE',
    ukuran: 'S', tglProduksi: '2026-05-06', tglKirim: '2026-05-20' };
  let certTimer = 0;

  /** Template dari form di tab Sertifikat. */
  function readCert() {
    const d = document, t = Object.assign({}, ui.settings.sertifikat);
    ['judul', 'namaAtas', 'pembuka', 'produk', 'paragraf', 'labelTerbit', 'labelTanggal', 'labelQr'].forEach(k => { t[k] = $('#ct_' + k, d).value; });
    ['warnaUtama', 'warnaAksen', 'warnaLatar'].forEach(k => { t[k] = $('#ct_' + k, d).value; });
    ['watermark', 'qrSudut', 'qrTtd', 'tampilTtd'].forEach(k => { t[k] = $('#ct_' + k, d).checked; });
    t.fields = $$('#ctFields [data-fk]', d).map(r => ({ key: r.dataset.fk, label: $('.cf-label', r).value.trim(), kolom: $('.cf-kol', r).value, tampil: $('.cf-on', r).checked }));
    return t;
  }
  function certData() {
    const p = ui.settings.perusahaan || {}, n = new Date();
    return Object.assign({ namaPerusahaan: p.nama ? p.nama.replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase()).replace(/^Pt\b/, 'PT') : '',
      tglTerbit: `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}` }, CERT_SAMPLE);
  }
  function certAssets() {
    return { logo: window.coaImage('logo'), ttdImg: window.coaImage('ttd'), ttd: ui.settings.ttd || {}, qrText: location.origin + location.pathname.replace(/[^/]*$/, '') + 'verifikasi.html?code=' + CERT_SAMPLE.serial };
  }
  async function previewCert() {
    const box = $('#certPrev'); if (!box) return;
    try { await COA_CERT.loadQR(); } catch (e) { /* pratinjau tetap tampil tanpa QR */ }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${COA_CERT.CSS}</style></head><body>${COA_CERT.html(readCert(), certData(), certAssets())}</body></html>`;
    let f = $('iframe', box);
    if (!f) { box.innerHTML = '<iframe title="Pratinjau sertifikat" tabindex="-1"></iframe>'; f = $('iframe', box); }
    f.srcdoc = html;
    const k = box.clientWidth / 1123;
    f.style.transform = `scale(${k})`; box.style.height = Math.round(794 * k) + 'px';
  }
  function certFieldRow(f) {
    return `<div class="cf" data-fk="${esc(f.key)}">
      <input type="checkbox" class="cf-on" ${f.tampil !== false ? 'checked' : ''} aria-label="Tampilkan">
      <input class="input cf-label" value="${esc(f.label)}" placeholder="${esc(CERT_KEYS[f.key] || f.key)}" title="Isi: ${esc(CERT_KEYS[f.key] || f.key)}">
      <select class="input cf-kol"><option value="kiri" ${f.kolom !== 'kanan' ? 'selected' : ''}>Kiri</option><option value="kanan" ${f.kolom === 'kanan' ? 'selected' : ''}>Kanan</option></select>
      <span class="cf-mv"><button type="button" class="btn sm icon ghost" data-fmv="-1" aria-label="Naik"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="btn sm icon ghost" data-fmv="1" aria-label="Turun"><i class="fa-solid fa-arrow-down"></i></button></span>
      <small class="hint cf-src">${esc(CERT_KEYS[f.key] || f.key)}</small>
    </div>`;
  }
  function certForm(t) {
    const fieldsAll = (t.fields || []).slice();
    Object.keys(CERT_KEYS).forEach(k => { if (!fieldsAll.some(f => f.key === k)) fieldsAll.push({ key: k, label: CERT_KEYS[k], kolom: 'kiri', tampil: false }); });
    const color = (k, label) => `<label class="f"><span>${label}</span><input type="color" class="input" id="ct_${k}" value="${esc(t[k] || '#000000')}" style="padding:4px;height:44px"></label>`;
    const chk = (k, label) => `<label class="switch"><input type="checkbox" id="ct_${k}" ${t[k] ? 'checked' : ''}> ${label}</label>`;
    return `<div class="cert-grid">
      <div class="card col" id="certForm">
        <div class="codes"><span>Kode isian:</span>${['{nama_perusahaan}', '{deskripsi}', '{serial}', '{pelanggan}', '{no_po}', '{warna}', '{ukuran}', '{tgl_produksi}', '{tgl_kirim}', '{tgl_terbit}']
          .map(c => `<code>${c}</code>`).join('')}</div>
        ${field('ct_namaAtas', 'Nama di kiri atas', t.namaAtas)}
        ${field('ct_judul', 'Judul', t.judul)}
        ${field('ct_pembuka', 'Kalimat pembuka', t.pembuka)}
        ${field('ct_produk', 'Baris nama produk', t.produk)}
        ${field('ct_paragraf', 'Paragraf (pisahkan paragraf dengan baris kosong)', t.paragraf, { area: true, rows: 6 })}
        <div class="sub-h">Data yang ditampilkan</div>
        <div id="ctFields" class="cf-list">${fieldsAll.map(certFieldRow).join('')}</div>
        <div class="sub-h">Tanda tangan</div>
        <div class="f2">
          ${field('ct_labelTerbit', 'Teks di atas', t.labelTerbit)}
          ${field('ct_labelTanggal', 'Teks tanggal terbit', t.labelTanggal)}
          ${field('ct_labelQr', 'Teks di bawah QR kecil', t.labelQr, { ph: '(boleh kosong)' })}
        </div>
        <p class="hint">Nama & jabatan penandatangan diambil dari tab Bank &amp; Tanda Tangan.</p>
        <div class="sub-h">Tampilan</div>
        <div class="f2">${color('warnaUtama', 'Warna utama')}${color('warnaAksen', 'Warna aksen')}${color('warnaLatar', 'Warna latar')}</div>
        <div style="display:grid;gap:8px">
          ${chk('watermark', 'Watermark logo di latar')}${chk('qrSudut', 'QR di pojok kiri atas')}${chk('qrTtd', 'QR kecil di atas nama penandatangan')}${chk('tampilTtd', 'Gambar tanda tangan')}
        </div>
        <div class="form-foot" style="flex-wrap:wrap">
          <button type="button" class="btn" id="sResetCert"><i class="fa-solid fa-rotate-left"></i> Kembalikan bawaan</button>
          <button type="button" class="btn" id="sPrintCert"><i class="fa-solid fa-print"></i> Cetak contoh</button>
          <button type="button" class="btn primary" id="sSaveCert"><i class="fa-solid fa-floppy-disk"></i> Simpan template</button>
        </div>
      </div>
      <div class="card col cert-side"><h3>Pratinjau (data contoh)</h3><div id="certPrev" class="cert-prev"></div>
        <p class="hint">QR pada sertifikat berisi isi QR produk (kolom url di Master QR). Bila isinya bukan alamat web, QR diarahkan ke halaman verifikasi.html.</p></div>
    </div>`;
  }
  const IMG = {
    kop:  { label: 'Kop surat', def: '', max: 2000, type: 'image/jpeg', note: 'Gambar melebar di bagian atas Surat Jalan & Invoice. Bila kosong, kop dibuat otomatis dari data perusahaan.' },
    ttd:  { label: 'Tanda tangan', def: '', max: 600, type: 'image/png', note: 'Disarankan PNG berlatar transparan. Bila kosong, area tanda tangan dibiarkan kosong untuk ditandatangani basah.' },
    logo: { label: 'Logo', def: '', max: 600, type: 'image/png', note: 'Dipakai di sertifikat, tengah QR, dan portal verifikasi.' }
  };
  /** Gambar yang dipakai dokumen: hanya unggahan di Pengaturan (versi Origara tidak membawa gambar perusahaan mana pun). */
  window.coaImage = key => (ui.settings && ui.settings.gambar && ui.settings.gambar[key]) || (IMG[key] && IMG[key].def) || '';

  async function loadSettings(btn) {
    if (!ui.settings) $('#setBody').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const [s, c] = await Promise.all([run(btn, () => api('getSettings')), run(null, () => api('listCounters'))]);
    if (s) ui.settings = s;
    if (c) ui.counters = c;
    if (s && c) renderSettings();
  }
  function renderSettings() {
    $('#setTabs').innerHTML = Object.keys(SET_TABS).map(k => `<button type="button" class="${k === ui.setTab ? 'on' : ''}" data-stab="${k}">${SET_TABS[k]}</button>`).join('');
    const s = ui.settings, p = s.perusahaan || {}, b = s.bank || {}, t = s.ttd || {}, pj = s.pajak || {};
    const saveBtn = (id, text) => `<div class="form-foot"><button type="button" class="btn primary" id="${id}"><i class="fa-solid fa-floppy-disk"></i> ${text || 'Simpan'}</button></div>`;
    let html = '';
    if (ui.setTab === 'perusahaan') {
      html = `<div class="card"><div class="f2">
          ${field('sNama', 'Nama perusahaan', p.nama, { w2: true })}
          ${field('sAlamat', 'Alamat', p.alamat, { area: true, rows: 3, w2: true })}
          ${field('sKota', 'Kota (untuk tanggal dokumen)', p.kota)}
          ${field('sTelp', 'Telepon', p.telp)}
          ${field('sEmail', 'Email', p.email)}
          ${field('sWeb', 'Website', p.web)}
          ${field('sNpwp', 'NPWP perusahaan (16 digit)', p.npwp, { mode: 'numeric' })}
          ${field('sIdtku', 'ID TKU penjual (22 digit)', p.idtku, { mode: 'numeric' })}
        </div>${saveBtn('sSavePer')}</div>`;
    } else if (ui.setTab === 'bank') {
      html = `<div class="card"><h2>Rekening pembayaran</h2><p class="muted" style="font-size:13px;margin-bottom:14px">Tampil di bagian "Perhatian" pada invoice.</p><div class="f2">
          ${field('bBank', 'Nama bank', b.bank)}
          ${field('bCabang', 'Kantor cabang', b.cabang)}
          ${field('bNorek', 'Nomor rekening', b.norek, { mode: 'numeric' })}
          ${field('bAtas', 'Atas nama', b.atasNama)}
          ${field('bSwift', 'Swift code', b.swift)}
          ${field('bEmail', 'Email bukti transfer', b.emailBukti)}
        </div>
        <h2 style="margin-top:22px">Penandatangan</h2><p class="muted" style="font-size:13px;margin-bottom:14px">Nama & jabatan di bawah tanda tangan invoice dan sertifikat.</p><div class="f2">
          ${field('tNama', 'Nama', t.nama)}
          ${field('tJabatan', 'Jabatan', t.jabatan)}
        </div>${saveBtn('sSaveBank')}</div>`;
    } else if (ui.setTab === 'gambar') {
      html = `<div class="imgs">${Object.keys(IMG).map(k => `
        <div class="card img-card" data-img="${k}">
          <div><h2>${IMG[k].label}</h2><p class="muted" style="font-size:13px">${IMG[k].note}</p></div>
          <div class="img-box">${window.coaImage(k) ? `<img src="${esc(window.coaImage(k))}" alt="${IMG[k].label}">` : '<span class="hint"><i class="fa-regular fa-image"></i> Belum diunggah</span>'}</div>
          <div class="tags">${s.gambar && s.gambar[k] ? '<span class="tag ok">Sudah diunggah</span>' : '<span class="tag warn">Belum ada</span>'}</div>
          <div class="row">
            <button type="button" class="btn block" data-imgup><i class="fa-solid fa-upload"></i> Ganti gambar</button>
            ${s.gambar && s.gambar[k] ? '<button type="button" class="btn t-bad" data-imgreset title="Hapus gambar"><i class="fa-solid fa-trash"></i></button>' : ''}
          </div>
        </div>`).join('')}</div><input type="file" id="imgFile" accept="image/png,image/jpeg,image/webp" hidden>`;
    } else if (ui.setTab === 'nomor') {
      const resetSel = (cur) => `<select class="input c-reset">${[['tidak', 'Terus berjalan'], ['tahunan', 'Mulai 1 tiap tahun'], ['bulanan', 'Mulai 1 tiap bulan'], ['harian', 'Mulai 1 tiap hari']]
        .map(o => `<option value="${o[0]}" ${o[0] === cur ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
      html = `<div class="card">
        <p class="muted" style="font-size:13.5px">Kode yang bisa dipakai di format:</p>
        <div class="codes" style="margin:8px 0 4px"><span><code>{YYYY}</code> tahun</span><span><code>{YY}</code> 2 digit tahun</span><span><code>{MM}</code> bulan</span><span><code>{DD}</code> tanggal</span><span><code>{N:5}</code> nomor urut 5 digit</span></div>
        ${ui.counters.map(c => `
          <div class="ctr" data-ctr="${esc(c.jenis)}">
            <div class="nm"><b>${esc(c.nama)}</b><small class="mono">${esc(c.jenis)}</small></div>
            <label class="f fmt"><span>Format</span><input class="input c-fmt mono" value="${esc(c.format)}" autocomplete="off" spellcheck="false"></label>
            ${c.ikut ? `<div class="f" style="grid-column:span 2"><span>Nomor urut</span><p class="hint" style="padding-top:12px">Sama dengan nomor ${esc(c.ikut === 'DN' ? 'Surat Jalan' : c.ikut)}</p></div>`
              : `<label class="f"><span>Nomor terakhir</span><input class="input c-last num" inputmode="numeric" value="${esc(c.terakhir)}"></label>
                 <label class="f"><span>Reset nomor</span>${resetSel(c.reset)}</label>`}
            <button type="button" class="btn" data-ctrsave><i class="fa-solid fa-floppy-disk"></i> Simpan</button>
            <div class="nxt">Nomor berikutnya: <b class="c-next">${esc(c.berikutnya)}</b></div>
          </div>`).join('')}
        <p class="hint" style="margin-top:12px">"Nomor terakhir" = nomor yang terakhir kali dipakai. Dokumen berikutnya memakai nomor ini + 1, jadi nomor tidak pernah terpakai dua kali.</p>
      </div>`;
    } else if (ui.setTab === 'pajak') {
      const R = window.CORETAX_REF;
      if (!R) {
        html = '<div class="card"><div class="skel"></div><div class="skel"></div></div>';
        loadScript('js/ref-coretax.js').then(() => { if (ui.setTab === 'pajak') renderSettings(); })
          .catch(e => toast(e.message + ' (js/ref-coretax.js)', 'bad'));
      } else {
        const sel = (id, list, cur) => `<select class="input" id="${id}">${list.map(([k, l]) =>
          `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${esc(k)} — ${esc(l.replace(/^\d+\s*-\s*/, ''))}</option>`).join('')}</select>`;
        const jenis = pj.jenisBarang || 'A';
        const goodsLabel = code => { const g = R.kodeBarang.find(x => x[1] === code); return g ? g[2] : ''; };
        html = `<div class="card">
          <p class="muted" style="font-size:13.5px;margin-bottom:14px">Nilai bawaan untuk invoice dan file XML Coretax (Tahap 3). Pilihan kode diambil dari template converter e-Faktur Coretax Anda. Kode barang dan satuan tetap bisa diganti per baris saat membuat invoice.</p>
          <div class="f2">
            <label class="f w2"><span>Kode transaksi faktur</span>${sel('pKode', R.kodeTransaksi, pj.kodeTransaksi || '04')}</label>
            <label class="f"><span>Barang / Jasa</span>${sel('pJenis', R.barangJasa, jenis)}</label>
            <label class="f"><span>Satuan ukur Coretax</span>${sel('pSatuan', R.satuan, pj.satuanCoretax || 'UM.0021')}</label>
            <label class="f w2"><span>Kode barang/jasa <small class="hint">(ketik kode atau nama, mis. 620000 / pakaian)</small></span>
              <input class="input" id="pBarang" list="dlGoods" value="${esc(pj.kodeBarang || '')}" autocomplete="off">
              <small class="hint" id="pBarangLbl">${esc(goodsLabel(pj.kodeBarang))}</small></label>
            ${field('pTarif', 'Tarif PPN (%)', pj.tarifPpn || '12', { mode: 'numeric' })}
            ${field('pDpp', 'DPP nilai lain', pj.dppLain || '11/12', { hint: '(× harga jual)' })}
          </div>
          <datalist id="dlGoods">${R.kodeBarang.filter(g => g[0] === jenis).map(g => `<option value="${g[1]}">${esc(g[2])}</option>`).join('')}</datalist>
          <div class="note" style="margin-top:14px">Rumus: DPP nilai lain = ${esc(pj.dppLain || '11/12')} × harga jual, lalu PPN = ${esc(pj.tarifPpn || '12')}% × DPP nilai lain.</div>
          ${saveBtn('sSavePajak')}</div>`;
      }
    }
    else if (ui.setTab === 'sertifikat') html = certForm(s.sertifikat || {});
    $('#setBody').innerHTML = html;
    if (ui.setTab === 'sertifikat') previewCert();
  }

  async function saveSetting(btn, key, value) {
    const r = await run(btn, () => api('saveSettings', key, value));
    if (r) { ui.settings = r.settings; toast(r.message, 'ok'); renderSettings(); }
    return r;
  }
  /** Perkecil gambar di HP/PC sebelum dikirim, supaya database tetap ringan. */
  function shrinkImage(file, max, type) {
    return new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const cx = cv.getContext('2d');
        if (type === 'image/jpeg') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); }
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        ok(cv.toDataURL(type, .88));
      };
      img.onerror = () => no(new Error('File ini bukan gambar yang bisa dibaca.'));
      img.src = URL.createObjectURL(file);
    });
  }
  let imgTarget = null;
  async function uploadImage(file) {
    const key = imgTarget; imgTarget = null;
    if (!key || !file) return;
    let data;
    try { data = await shrinkImage(file, IMG[key].max, IMG[key].type); }
    catch (e) { return toast(e.message, 'bad'); }
    if (data.length > 1400000) return toast('Gambar masih terlalu besar setelah diperkecil. Pakai gambar yang lebih sederhana.', 'bad');
    await saveSetting($(`[data-img="${key}"] [data-imgup]`), 'img.' + key, { data });
  }
  async function saveCounter(row, btn) {
    const data = { jenis: row.dataset.ctr, format: $('.c-fmt', row).value.trim() };
    if ($('.c-last', row)) { data.terakhir = $('.c-last', row).value.trim(); data.reset = $('.c-reset', row).value; }
    const r = await run(btn, () => api('saveCounter', data));
    if (r) { ui.counters = r.counters; toast(r.message, 'ok'); renderSettings(); }
  }
  function previewCounter(row) {
    const c = ui.counters.find(x => x.jenis === row.dataset.ctr);
    const parent = c.ikut ? $(`[data-ctr="${c.ikut}"]`) : row;
    const last = parent && $('.c-last', parent) ? parseInt($('.c-last', parent).value, 10) : NaN;
    const fmtVal = $('.c-fmt', row).value;
    $('.c-next', row).textContent = /\{N(:\d{1,2})?\}/.test(fmtVal)
      ? fmtNumber(fmtVal, Number.isFinite(last) ? last + 1 : 1, today())
      : 'format wajib memuat {N:5}';
    // Packing List ikut Surat Jalan: perbarui contohnya juga
    if (!c.ikut) $$(`[data-ctr]`).forEach(r2 => { const c2 = ui.counters.find(x => x.jenis === r2.dataset.ctr); if (c2 && c2.ikut === c.jenis) previewCounter(r2); });
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  const PAGES_HTML = `
    <section id="page-pelanggan" class="page" hidden>
      <div class="page-bar">
        <div class="search" style="max-width:360px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="custSearch" type="search" placeholder="Cari nama, kode, NPWP, atau alamat…"></div>
        <button class="btn primary" id="btnAddCust"><i class="fa-solid fa-plus"></i> Tambah pelanggan</button>
      </div>
      <p class="muted" id="custCount" style="font-size:13px"></p>
      <div class="grid-cards" id="custList"></div>
    </section>

    <section id="page-qr" class="page" hidden>
      <div class="stats s3" id="qrStats"></div>
      <div class="card">
        <div class="page-bar">
          <div><h2>Impor kode QR dari Excel</h2><p class="muted" style="font-size:13px">Kolom: <b>item_code</b>, <b>batch_id</b>, <b>url</b> (isi QR). Kode yang sudah ada dilewati.</p></div>
          <div class="row">
            <button class="btn" id="btnQrTpl"><i class="fa-solid fa-file-arrow-down"></i> Template</button>
            <button class="btn primary" id="btnQrImport"><i class="fa-solid fa-file-import"></i> Pilih file Excel</button>
          </div>
        </div>
        <input type="file" id="qrFile" accept=".xlsx,.xls,.csv" hidden>
      </div>
      <div class="card"><h3>Batch terbaru</h3><div class="list" id="qrBatches" style="margin-top:8px"></div></div>
      <div class="card">
        <div class="page-bar"><h3>Daftar kode</h3><div class="search" style="max-width:320px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="qrSearch" type="search" placeholder="Cari item code atau batch…"></div></div>
        <div class="list" id="qrItems" style="margin-top:8px"></div>
      </div>
    </section>

    <section id="page-roles" class="page" hidden>
      <div class="page-bar">
        <p class="muted" style="font-size:13.5px">Atur menu dan tindakan yang boleh dilakukan setiap jabatan. Perubahan berlaku saat user membuka aplikasi lagi.</p>
        <button class="btn primary" id="btnAddRole"><i class="fa-solid fa-plus"></i> Tambah role</button>
      </div>
      <div class="grid-cards" id="roleList"></div>
    </section>

    <section id="page-settings" class="page" hidden>
      <div class="seg" id="setTabs" style="overflow-x:auto;max-width:100%"></div>
      <div id="setBody" class="col"></div>
    </section>`;

  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', PAGES_HTML);

    // Pelanggan
    $('#btnAddCust').onclick = () => editCustomer(null);
    $('#custSearch').oninput = e => { ui.custQuery = e.target.value.trim(); renderCustomers(); };
    $('#custList').onclick = e => {
      const b = e.target.closest('[data-cact]'); if (!b) return;
      const id = b.closest('[data-cust]').dataset.cust;
      if (b.dataset.cact === 'link') customerLink(id);
      else if (b.dataset.cact === 'edit') editCustomer(id); else deleteCustomer(id);
    };

    // Master QR
    $('#btnQrTpl').onclick = e => downloadQRTemplate(e.currentTarget);
    $('#btnQrImport').onclick = () => $('#qrFile').click();
    $('#qrFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importQR(f); };
    $('#qrSearch').oninput = e => {
      clearTimeout(ui.qrTimer);
      ui.qrTimer = setTimeout(() => { ui.qrQuery = e.target.value.trim(); loadQR(); }, 350);
    };
    $('#qrBatches').onclick = e => {
      const b = e.target.closest('[data-qbatch]'); if (!b) return;
      const batch = b.closest('[data-batch]').dataset.batch;
      if (b.dataset.qbatch === 'del') return deleteQR('batch', batch);
      ui.qrQuery = batch; $('#qrSearch').value = batch; loadQR();
      $('#qrItems').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#qrItems').onclick = e => { const b = e.target.closest('[data-qdel]'); if (b) deleteQR('item', b.closest('[data-qcode]').dataset.qcode); };

    // Role
    $('#btnAddRole').onclick = () => editRole(null);
    $('#roleList').onclick = e => {
      const b = e.target.closest('[data-ract]'); if (!b) return;
      const name = b.closest('[data-role]').dataset.role;
      if (b.dataset.ract === 'edit') editRole(name); else deleteRole(name);
    };

    // Pengaturan
    $('#setTabs').onclick = e => { const b = e.target.closest('[data-stab]'); if (b) { ui.setTab = b.dataset.stab; renderSettings(); } };
    $('#setBody').addEventListener('click', async e => {
      const t = e.target;
      const s = ui.settings;
      if (t.closest('#sSavePer')) {
        return saveSetting(t.closest('button'), 'perusahaan', Object.assign({}, s.perusahaan, {
          nama: val(document, 'sNama'), alamat: val(document, 'sAlamat'), kota: val(document, 'sKota'), telp: val(document, 'sTelp'),
          email: val(document, 'sEmail'), web: val(document, 'sWeb'), npwp: digits(val(document, 'sNpwp')), idtku: digits(val(document, 'sIdtku'))
        }));
      }
      if (t.closest('#sSaveBank')) {
        const btn = t.closest('button');
        const ttd = { nama: val(document, 'tNama'), jabatan: val(document, 'tJabatan') };
        const ok = await saveSetting(btn, 'bank', Object.assign({}, s.bank, {
          bank: val(document, 'bBank'), cabang: val(document, 'bCabang'), norek: val(document, 'bNorek'), atasNama: val(document, 'bAtas'),
          swift: val(document, 'bSwift'), emailBukti: val(document, 'bEmail')
        }));
        if (ok) await saveSetting($('#sSaveBank'), 'ttd', ttd);
        return;
      }
      if (t.closest('#sSavePajak')) {
        const R = window.CORETAX_REF, code = val(document, 'pBarang').split(/\s/)[0], jenis = val(document, 'pJenis');
        if (!R.kodeBarang.some(g => g[0] === jenis && g[1] === code)) {
          $('#pBarang').classList.add('invalid');
          return toast('Kode barang/jasa tidak ada di daftar referensi Coretax. Pilih dari daftar.', 'bad');
        }
        return saveSetting(t.closest('button'), 'pajak', {
          kodeTransaksi: val(document, 'pKode'), jenisBarang: jenis, kodeBarang: code, satuanCoretax: val(document, 'pSatuan'),
          tarifPpn: val(document, 'pTarif'), dppLain: val(document, 'pDpp')
        });
      }
      if (t.closest('#sSaveCert')) {
        const tpl = readCert();
        if (!tpl.fields.some(f => f.tampil)) return toast('Pilih minimal satu data yang ditampilkan.', 'bad');
        return saveSetting(t.closest('button'), 'sertifikat', tpl);
      }
      if (t.closest('#sResetCert')) {
        const ok = await confirmBox('Kembalikan template bawaan?', 'Semua perubahan template sertifikat diganti dengan template awal (sama dengan contoh PDF).', 'Kembalikan', false);
        if (ok) saveSetting(t.closest('button'), 'sertifikat', null);
        return;
      }
      if (t.closest('#sPrintCert')) {
        try {
          await COA_CERT.loadQR();
          COA_PRINT.open('Contoh sertifikat', [COA_CERT.html(readCert(), certData(), certAssets())], COA_CERT.CSS);
        } catch (err) { toast(err.message, 'bad'); }
        return;
      }
      let el;
      if ((el = t.closest('[data-fmv]'))) {
        const row = el.closest('[data-fk]'), box = row.parentElement;
        if (el.dataset.fmv === '-1' && row.previousElementSibling) box.insertBefore(row, row.previousElementSibling);
        if (el.dataset.fmv === '1' && row.nextElementSibling) box.insertBefore(row.nextElementSibling, row);
        return previewCert();
      }
      if ((el = t.closest('[data-imgup]'))) { imgTarget = el.closest('[data-img]').dataset.img; return $('#imgFile').click(); }
      if ((el = t.closest('[data-imgreset]'))) return saveSetting(el, 'img.' + el.closest('[data-img]').dataset.img, null);
      if ((el = t.closest('[data-ctrsave]'))) return saveCounter(el.closest('[data-ctr]'), el);
    });
    $('#setBody').addEventListener('change', e => { if (e.target.id === 'imgFile') { const f = e.target.files[0]; e.target.value = ''; uploadImage(f); } });
    const certChanged = e => { if (e.target.closest('#certForm')) { clearTimeout(certTimer); certTimer = setTimeout(previewCert, 250); } };
    $('#setBody').addEventListener('change', certChanged);
    window.addEventListener('resize', () => { if (state.page === 'settings' && ui.setTab === 'sertifikat') previewCert(); });
    $('#setBody').addEventListener('input', e => {
      certChanged(e);
      const row = e.target.closest('[data-ctr]'); if (row) previewCounter(row);
      if (e.target.id === 'pBarang' && window.CORETAX_REF) {
        e.target.classList.remove('invalid');
        const g = window.CORETAX_REF.kodeBarang.find(x => x[1] === e.target.value.trim().split(/\s/)[0]);
        $('#pBarangLbl').textContent = g ? g[2] : 'Kode belum cocok dengan daftar referensi.';
      }
    });
    $('#setBody').addEventListener('change', e => {
      if (e.target.id !== 'pJenis' || !window.CORETAX_REF) return;   // daftar kode ikut jenis Barang (A) / Jasa (B)
      $('#dlGoods').innerHTML = window.CORETAX_REF.kodeBarang.filter(g => g[0] === e.target.value)
        .map(g => `<option value="${g[1]}">${esc(g[2])}</option>`).join('');
    });
  }

  /* =====================================================================
     WIZARD PENGATURAN AWAL (instalasi baru: nama perusahaan masih kosong)
     ===================================================================== */
  let setupOpen = false;
  async function openSetup() {
    if (setupOpen) return;
    setupOpen = true;
    try {
      const [s, ctr] = await Promise.all([api('getSettings'), api('listCounters')]);
      try { await loadScript('js/ref-coretax.js'); } catch (e) { /* kode barang tetap bisa diketik */ }
      const p = s.perusahaan || {}, b = s.bank || {}, t = s.ttd || {}, pj = s.pajak || {};
      const inv = ctr.find(c => c.jenis === 'INV') || {}, dn = ctr.find(c => c.jenis === 'DN') || {};
      const goods = (window.CORETAX_REF && window.CORETAX_REF.kodeBarang) || [];
      const res = await modal({
        title: 'Selamat datang di Origara', text: 'Lengkapi data perusahaan Anda. Data ini tampil di Surat Jalan, invoice, sertifikat, dan file pajak.',
        icon: 'fa-wand-magic-sparkles', wide: true, sticky: true, confirmText: 'Simpan & mulai', cancelText: 'Nanti saja',
        html: `
          <div class="sub-h">1. Perusahaan</div>
          <div class="f2">
            ${field('wNama', 'Nama perusahaan *', p.nama, { ph: 'PT CONTOH JAYA', w2: true })}
            ${field('wAlamat', 'Alamat *', p.alamat, { area: true, rows: 2, w2: true })}
            ${field('wKota', 'Kota', p.kota)}
            ${field('wTelp', 'Telepon', p.telp, { mode: 'tel' })}
            ${field('wEmail', 'Email', p.email, { mode: 'email' })}
            ${field('wWeb', 'Website', p.web)}
            ${field('wNpwp', 'NPWP (16 digit)', p.npwp, { mode: 'numeric', hint: '(wajib bila PKP / ekspor Coretax)' })}
            ${field('wIdtku', 'ID TKU (22 digit)', p.idtku, { mode: 'numeric', ph: 'Otomatis: NPWP + 000000' })}
          </div>
          <div class="sub-h">2. Rekening pembayaran (tampil di invoice)</div>
          <div class="f2">
            ${field('wBank', 'Nama bank', b.bank, { ph: 'mis. Bank Central Asia (BCA)' })}
            ${field('wNorek', 'Nomor rekening', b.norek, { mode: 'numeric' })}
            ${field('wAtas', 'Atas nama', b.atasNama)}
            ${field('wCabang', 'Kantor cabang', b.cabang)}
            ${field('wSwift', 'Swift code', b.swift)}
            ${field('wEmailB', 'Email bukti transfer', b.emailBukti, { mode: 'email' })}
          </div>
          <div class="sub-h">3. Penandatangan invoice & sertifikat</div>
          <div class="f2">${field('wTNama', 'Nama', t.nama)}${field('wTJab', 'Jabatan', t.jabatan || 'Direktur')}</div>
          <div class="sub-h">4. Penomoran dokumen</div>
          <div class="f2">
            ${field('wInvFmt', 'Format nomor invoice', inv.format, { hint: '({YYYY} tahun, {MM} bulan, {N:5} nomor urut)' })}
            ${field('wInvLast', 'Nomor invoice terakhir yang sudah terpakai', String(inv.terakhir ?? 0), { mode: 'numeric', hint: '(0 bila belum pernah)' })}
            ${field('wDnLast', 'Nomor Surat Jalan terakhir yang sudah terpakai', String(dn.terakhir ?? 0), { mode: 'numeric' })}
          </div>
          <div class="sub-h">5. Pajak (Coretax)</div>
          <label class="f"><span>Kode barang/jasa utama <small class="hint">(ketik kode atau nama barang; boleh dikosongkan bila tidak membuat faktur pajak)</small></span>
            <input class="input" id="wKode" list="dlWizGoods" value="${esc(pj.kodeBarang || '')}" autocomplete="off"></label>
          <datalist id="dlWizGoods">${goods.filter(g => g[0] === 'A').map(g => `<option value="${g[1]}">${esc(g[2])}</option>`).join('')}</datalist>
          <p class="hint"><i class="fa-regular fa-image"></i> Kop surat, logo, dan tanda tangan bisa diunggah nanti di Pengaturan → Kop, Logo & TTD.
            Selama belum diunggah, dokumen memakai kop teks dari data di atas.</p>`,
        onOpen: d => {
          $('#wNpwp', d).addEventListener('input', () => {
            const n = digits($('#wNpwp', d).value), el = $('#wIdtku', d);
            if (!el.dataset.manual) el.value = n.length === 16 ? n + '000000' : n.length === 15 ? '0' + n + '000000' : '';
          });
          $('#wIdtku', d).addEventListener('input', e => { e.target.dataset.manual = e.target.value ? '1' : ''; });
          $('#wNama', d).addEventListener('input', e => { const a = $('#wAtas', d); if (!a.dataset.manual) a.value = e.target.value; });
          $('#wAtas', d).addEventListener('input', e => { e.target.dataset.manual = '1'; });
        },
        collect: d => {
          const v = id => val(d, id);
          if (!v('wNama') || !v('wAlamat')) throw new Error('Nama dan alamat perusahaan wajib diisi.');
          const npwp = digits(v('wNpwp'));
          if (npwp && npwp.length !== 15 && npwp.length !== 16) throw new Error('NPWP harus 15 atau 16 digit angka.');
          if (!/\{N(:\d{1,2})?\}/.test(v('wInvFmt'))) throw new Error('Format nomor invoice wajib memuat {N:5}.');
          if (!/^\d{1,12}$/.test(v('wInvLast')) || !/^\d{1,12}$/.test(v('wDnLast'))) throw new Error('Nomor terakhir harus angka (0 bila belum pernah).');
          const kode = v('wKode').split(/\s/)[0];
          if (kode && goods.length && !goods.some(g => g[1] === kode)) throw new Error('Kode barang tidak ada di daftar referensi Coretax. Pilih dari daftar atau kosongkan.');
          return {
            perusahaan: Object.assign({}, p, { nama: v('wNama'), alamat: v('wAlamat'), kota: v('wKota'), telp: v('wTelp'), email: v('wEmail'), web: v('wWeb'),
              npwp: npwp.length === 15 ? '0' + npwp : npwp, idtku: digits(v('wIdtku')) }),
            bank: Object.assign({}, b, { bank: v('wBank'), norek: v('wNorek'), atasNama: v('wAtas'), cabang: v('wCabang'), swift: v('wSwift'), emailBukti: v('wEmailB') }),
            ttd: { nama: v('wTNama'), jabatan: v('wTJab') },
            pajak: Object.assign({}, pj, { kodeBarang: kode }),
            inv: { jenis: 'INV', format: v('wInvFmt'), terakhir: v('wInvLast'), reset: inv.reset || 'tidak' },
            dn: { jenis: 'DN', format: dn.format, terakhir: v('wDnLast'), reset: dn.reset || 'tidak' }
          };
        },
        action: async x => {
          await api('saveSettings', 'perusahaan', x.perusahaan);
          await api('saveSettings', 'bank', x.bank);
          await api('saveSettings', 'ttd', x.ttd);
          await api('saveSettings', 'pajak', x.pajak);
          await api('saveCounter', x.inv);
          await api('saveCounter', x.dn);
          return x;
        }
      });
      if (res) {
        ui.settings = null; ui.counters = null;
        toast(`Data ${res.perusahaan.nama} tersimpan. Unggah kop, logo & tanda tangan di Pengaturan bila ada.`, 'ok');
      }
    } catch (e) {
      if (e.code !== 'AUTH') toast(e.message, 'bad');
    } finally { setupOpen = false; }
  }
  window.COA_SETUP = openSetup;

  window.editCustomer = editCustomer;
  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [
      { id: 'pelanggan', group: 'Data',   order: -1, perm: 'pelanggan.kelola',  label: 'Pelanggan',  icon: 'fa-building',    title: 'Data Pelanggan', sub: 'Alamat penagihan, alamat kirim, dan NPWP untuk dokumen & faktur pajak.', onShow: () => loadCustomers() },
      { id: 'qr',        group: 'Data',   order: 2,  perm: 'qr.kelola',         label: 'Master QR',  icon: 'fa-qrcode',      title: 'Master QR',      sub: 'Daftar kode QR produk yang boleh di-scan. Impor dari Excel.', onShow: () => loadQR() },
      { id: 'roles',     group: 'Sistem', order: 1,  perm: 'role.kelola',       label: 'Role',       icon: 'fa-user-shield', title: 'Role & Hak Akses', sub: 'Batasan menu dan tindakan untuk setiap jabatan.', onShow: () => loadRoles() },
      { id: 'settings',  group: 'Sistem', order: 2,  perm: 'pengaturan.kelola', label: 'Pengaturan', icon: 'fa-sliders',     title: 'Pengaturan',     sub: 'Data perusahaan, rekening, tanda tangan, gambar, penomoran dokumen, dan pajak.', onShow: () => loadSettings() }
    ]
  });
})();
