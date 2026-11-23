/* =====================================================================
   Origara v0.4 — menu Koreksi Scan.
   Membetulkan data scan yang salah tanpa membuka database:
   - ubah spesifikasi (deskripsi / warna / ukuran) dalam PO yang sama,
   - pindah ke PO lain,
   - hapus scan (produk bisa di-scan ulang).
   Kuota PO tetap dijaga, produk yang sudah ada di Surat Jalan aktif dikunci,
   dan setiap koreksi wajib beralasan serta tercatat di Riwayat koreksi.
   ===================================================================== */
(function () {
  'use strict';
  const ui = { rows: [], poItems: [], po: '', q: '', sel: new Set(), targets: null, log: null };
  const AKSI = { spek: 'Ubah spesifikasi', pindah: 'Pindah PO', hapus: 'Hapus scan' };
  const dmyTs = s => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : (s || ''); };
  const spec = x => `${x.deskripsi} · ${x.warna} · ${x.ukuran}`;

  /* ---------- cari ---------- */
  async function loadTargets() {
    if (ui.targets) return ui.targets;
    ui.targets = await api('scanTargets');
    $('#kPO').innerHTML = '<option value="">— atau pilih PO (tampilkan semua scan-nya) —</option>' +
      ui.targets.map(p => `<option value="${esc(p.noPO)}">${esc(p.noPO)} · ${esc(p.pelanggan)}</option>`).join('');
    return ui.targets;
  }
  async function search(btn) {
    // Cari kode produk = di semua PO (pilihan PO sebelumnya dikosongkan supaya tidak ikut menyaring).
    if ($('#kQ').value.trim()) $('#kPO').value = '';
    const q = $('#kQ').value.trim(), po = $('#kPO').value;
    if (!q && !po) return toast('Scan / ketik kode produk, atau pilih PO.', 'info');
    const r = await run(btn, () => api('scanSearch', q, po));
    if (!r) return;
    ui.rows = r.rows; ui.poItems = r.poItems; ui.q = q; ui.po = po; ui.sel = new Set();
    // satu kode yang cocok persis & bisa dikoreksi: langsung dicentang
    if (q && r.rows.length === 1 && !r.rows[0].noDN) ui.sel.add(r.rows[0].itemCode);
    render();
    $('#kQ').select();
  }
  function render() {
    const rows = ui.rows;
    $('#kSum').textContent = rows.length ? `${fmt(rows.length)} scan ditemukan · ${fmt(ui.sel.size)} dipilih` : '';
    $('#kBar').hidden = !rows.length;
    $$('#kBar [data-kact]').forEach(b => { b.disabled = !ui.sel.size; });
    if (!rows.length) {
      $('#kList').innerHTML = ui.q || ui.po ? `<div class="empty"><i class="fa-solid fa-magnifying-glass"></i><b>Tidak ada data scan</b>
        ${ui.q ? 'Kode ini belum pernah di-scan, atau ketik sebagian kode / batch.' : 'PO ini belum punya scan.'}</div>` : '';
      return;
    }
    const allOk = rows.filter(r => !r.noDN);
    $('#kList').innerHTML = `<div class="rtable"><table><thead><tr>
        <th style="width:34px"><input type="checkbox" id="kAll" aria-label="Pilih semua" ${allOk.length && allOk.every(r => ui.sel.has(r.itemCode)) ? 'checked' : ''}></th>
        <th>Kode produk</th><th>PO</th><th>Deskripsi</th><th>Warna</th><th>Ukuran</th><th>Di-scan</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td><input type="checkbox" data-kc="${esc(r.itemCode)}" ${ui.sel.has(r.itemCode) ? 'checked' : ''} ${r.noDN ? 'disabled' : ''} aria-label="Pilih ${esc(r.itemCode)}"></td>
        <td class="mono">${esc(r.itemCode)}</td><td class="mono">${esc(r.noPO)}</td><td>${esc(r.deskripsi)}</td><td>${esc(r.warna)}</td><td><b>${esc(r.ukuran)}</b></td>
        <td>${esc(dmyTs(r.waktu))}<br><small class="muted">${esc(r.operator)}</small></td>
        <td>${r.noDN ? `<span class="tag warn" title="Batalkan Surat Jalan dulu untuk mengoreksi">Di ${esc(r.noDN)}</span>` : r.poStatus === 'Exported' ? '<span class="tag warn">PO sudah export</span>' : '<span class="tag">Bisa dikoreksi</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  const selectedRows = () => ui.rows.filter(r => ui.sel.has(r.itemCode));
  const selInfo = () => {
    const s = selectedRows(), byPO = [...new Set(s.map(r => r.noPO))];
    const exported = s.some(r => r.poStatus === 'Exported');
    return `<div class="kv"><span>Produk dipilih <b>${fmt(s.length)}</b></span><span>PO <b>${esc(byPO.join(', '))}</b></span></div>
      ${exported ? '<div class="note">Sebagian produk berasal dari PO yang sudah di-export ke sistem verifikasi. Koreksi di sini tidak otomatis mengubah data yang sudah terkirim — sesuaikan juga di sistem tersebut bila perlu.</div>' : ''}`;
  };
  const reasonField = `<label class="f"><span>Alasan koreksi *</span><input class="input" id="kAlasan" placeholder="mis. operator salah pilih ukuran saat scan" autocomplete="off"></label>`;
  const lineOptions = (items, curKey) => items.map((x, i) => {
    const key = [x.deskripsi, x.idWarna, x.idUkuran].join('|');
    return `<label class="opt" style="position:relative"><input type="radio" name="kLine" value="${i}" ${key === curKey ? 'disabled' : ''}>
      <span class="size">${esc(x.ukuran)}</span><span class="opt-t"><b>${esc(x.warna)}</b><small>${esc(x.deskripsi)}</small></span>
      <span class="opt-r"><b>${fmt(Math.max(0, x.sisa))}</b><small>sisa kuota</small></span></label>`;
  }).join('');

  async function doFix(aksi) {
    const s = selectedRows();
    if (!s.length) return;
    if (aksi === 'spek' && new Set(s.map(r => r.noPO)).size > 1) return toast('Untuk ubah spesifikasi, pilih produk dari satu PO saja (atau pakai "Pindah PO").', 'bad');
    let items = [], targets = null;
    if (aksi === 'spek') {
      const r = await run(null, () => api('scanSearch', '', s[0].noPO));
      if (!r) return;
      items = r.poItems;
    }
    if (aksi === 'pindah') { try { targets = await loadTargets(); } catch (e) { return toast(e.message, 'bad'); } }
    const curKey = new Set(s.map(r => [r.deskripsi, r.idWarna, r.idUkuran].join('|'))).size === 1 ? [s[0].deskripsi, s[0].idWarna, s[0].idUkuran].join('|') : '';
    const res = await modal({
      title: AKSI[aksi], icon: aksi === 'hapus' ? 'fa-trash' : aksi === 'pindah' ? 'fa-right-left' : 'fa-pen-to-square',
      tone: aksi === 'hapus' ? 'bad' : '', danger: aksi === 'hapus', wide: aksi !== 'hapus', sticky: true,
      confirmText: aksi === 'hapus' ? `Hapus ${s.length} scan` : 'Simpan koreksi',
      html: selInfo() + (aksi === 'spek'
        ? `<div class="sub-h">Ubah ke spesifikasi (PO ${esc(s[0].noPO)})</div><div class="opts">${lineOptions(items, curKey)}</div>`
        : aksi === 'pindah'
          ? `<label class="f"><span>PO tujuan *</span><select class="input" id="kTo"><option value="">— Pilih PO tujuan —</option>${targets.map((p, i) =>
              `<option value="${i}">${esc(p.noPO)} · ${esc(p.pelanggan)}</option>`).join('')}</select></label><div class="opts" id="kToLines"></div>`
          : '<div class="note">Scan produk ini dihapus. Produknya kembali berstatus "belum di-scan" dan bisa di-scan ulang ke PO yang benar.</div>')
        + reasonField,
      onOpen: d => {
        if (aksi === 'pindah') $('#kTo', d).onchange = e => {
          const p = targets[+e.target.value];
          $('#kToLines', d).innerHTML = p ? (p.items.length ? lineOptions(p.items, '') : '<p class="hint">PO ini belum punya item.</p>') : '';
        };
      },
      collect: d => {
        const alasan = $('#kAlasan', d).value.trim();
        if (alasan.length < 5) throw new Error('Isi alasan koreksi (minimal 5 huruf).');
        const body = { aksi, alasan, items: s.map(r => r.itemCode) };
        if (aksi === 'hapus') return body;
        const pick = $('input[name="kLine"]:checked', d);
        if (aksi === 'pindah') {
          const p = targets[+$('#kTo', d).value];
          if (!p) throw new Error('Pilih PO tujuan.');
          if (!pick) throw new Error('Pilih spesifikasi tujuan di PO tersebut.');
          const x = p.items[+pick.value];
          return Object.assign(body, { noPO: p.noPO, deskripsi: x.deskripsi, idWarna: x.idWarna, idUkuran: x.idUkuran });
        }
        if (!pick) throw new Error('Pilih spesifikasi yang benar.');
        const x = items[+pick.value];
        return Object.assign(body, { deskripsi: x.deskripsi, idWarna: x.idWarna, idUkuran: x.idUkuran });
      },
      action: body => api('scanFix', body)
    });
    if (!res) return;
    toast(res.message, 'ok');
    ui.targets = null; ui.log = null;
    await search();
    loadLog();
    if (typeof refreshActivePO === 'function' && can('scan')) refreshActivePO();
  }

  /* ---------- riwayat ---------- */
  async function loadLog() {
    const r = await run(null, () => api('scanFixLog', $('#kLogQ').value.trim()));
    if (!r) return;
    ui.log = r;
    const desc = x => x ? `${x.noPO} · ${spec(x)}` : '(dihapus)';
    $('#kLog').innerHTML = r.length ? r.map(x => `<div class="li">
        <div class="t"><b class="mono">${esc(x.itemCode)}</b> <span class="tag ${x.aksi === 'hapus' ? 'warn' : ''}">${esc(AKSI[x.aksi])}</span>
          <small style="display:block">${esc(desc(x.sebelum))} <i class="fa-solid fa-arrow-right"></i> ${esc(desc(x.sesudah))}</small>
          <small style="display:block">Alasan: ${esc(x.alasan)} · ${esc(x.oleh)} · ${esc(dmyTs(x.waktu))}</small></div></div>`).join('')
      : '<div class="empty"><b>Belum ada koreksi</b></div>';
  }

  /* ---------- halaman ---------- */
  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', `
      <section id="page-koreksi" class="page" hidden>
        <div class="card">
          <form id="kForm" class="toolbar" autocomplete="off">
            <div class="search" style="flex:2;min-width:220px"><i class="fa-solid fa-barcode"></i>
              <input class="input" id="kQ" placeholder="Scan QR / ketik kode produk atau batch…" autocapitalize="none" spellcheck="false" enterkeyhint="search"></div>
            <select class="input" id="kPO" style="flex:1;min-width:200px"><option value="">— atau pilih PO —</option></select>
            <button class="btn primary" id="kGo" type="submit"><i class="fa-solid fa-magnifying-glass"></i> Cari</button>
          </form>
          <p class="hint" style="margin-top:8px">Produk yang sudah tercantum di Surat Jalan aktif tidak bisa dikoreksi; batalkan Surat Jalannya dulu. Setiap koreksi tercatat di riwayat.</p>
        </div>
        <div class="card">
          <div class="page-bar"><p class="muted" id="kSum" style="font-size:13.5px"></p>
            <div class="row" id="kBar" hidden>
              <button class="btn" data-kact="spek" disabled><i class="fa-solid fa-pen-to-square"></i> Ubah spesifikasi</button>
              <button class="btn" data-kact="pindah" disabled><i class="fa-solid fa-right-left"></i> Pindah PO</button>
              <button class="btn t-bad" data-kact="hapus" disabled><i class="fa-solid fa-trash"></i> Hapus scan</button>
            </div></div>
          <div id="kList"><div class="empty"><i class="fa-solid fa-barcode"></i><b>Cari produk yang mau dikoreksi</b>Scan QR produknya, ketik kodenya, atau pilih PO untuk melihat semua scan.</div></div>
        </div>
        <div class="card">
          <div class="page-bar"><h3>Riwayat koreksi</h3>
            <div class="search" style="max-width:280px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="kLogQ" type="search" placeholder="Cari kode produk…"></div></div>
          <div class="list" id="kLog" style="margin-top:8px"></div>
        </div>
      </section>`);
    $('#kForm').onsubmit = e => { e.preventDefault(); search($('#kGo')); };
    $('#kPO').onchange = () => { if ($('#kPO').value) { $('#kQ').value = ''; search($('#kGo')); } };
    $('#kList').addEventListener('change', e => {
      if (e.target.id === 'kAll') { ui.rows.filter(r => !r.noDN).forEach(r => e.target.checked ? ui.sel.add(r.itemCode) : ui.sel.delete(r.itemCode)); return render(); }
      const c = e.target.dataset.kc; if (!c) return;
      e.target.checked ? ui.sel.add(c) : ui.sel.delete(c);
      render();
    });
    $('#kBar').onclick = e => { const b = e.target.closest('[data-kact]'); if (b) doFix(b.dataset.kact); };
    let t = 0;
    $('#kLogQ').oninput = () => { clearTimeout(t); t = setTimeout(loadLog, 350); };
  }

  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [{ id: 'koreksi', group: 'Operasional', order: 3, perm: 'scan.koreksi', label: 'Koreksi Scan', icon: 'fa-pen-to-square', title: 'Koreksi Scan',
              sub: 'Betulkan scan yang salah: ubah warna/ukuran, pindah PO, atau hapus scan.',
              onShow: () => { loadTargets().catch(e => toast(e.message, 'bad')); loadLog(); setTimeout(() => $('#kQ').focus(), 150); } }]
  });
})();
