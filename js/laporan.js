/* =====================================================================
   Origara v0.4 — Laporan & Backup.
   - Laporan : ringkasan periode, produksi harian, penjualan per pelanggan,
               status PO (produksi → kirim → tagih), rekap faktur pajak. Export Excel.
   - Backup  : unduh seluruh data ke satu file Excel (satu sheet per tabel).
   Memakai fungsi bersama dari index.html ($, esc, api, run, toast, dateField, ...).
   ===================================================================== */
(function () {
  'use strict';
  const ui = { data: null, d1: '', d2: '' };
  const pad = n => String(n).padStart(2, '0');
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const rp = n => Math.round(Number(n || 0)).toLocaleString('id-ID');
  const JN = { INVOICE: 'Invoice', DP: 'Invoice DP', PELUNASAN: 'Pelunasan' };
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`; };

  /* =====================================================================
     LAPORAN
     ===================================================================== */
  async function loadReport(btn) {
    const d1 = $('#rD1').value, d2 = $('#rD2').value;
    if (!validDMY(d1) || !validDMY(d2)) return toast('Tanggal tidak valid. Format: DD/MM/YYYY.', 'bad');
    if (!ui.data) $('#rBody').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const r = await run(btn, () => api('report', d1, d2));
    if (!r) return;
    ui.data = r; ui.d1 = d1; ui.d2 = d2;
    renderReport();
  }
  const table = (head, rows, foot) => `<div class="rtable"><table><thead><tr>${head.map(h => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="muted" style="text-align:center;padding:18px">Tidak ada data pada periode ini.</td></tr>`}</tbody>${foot || ''}</table></div>`;
  function renderReport() {
    const r = ui.data, s = r.ringkasan;
    const stat = (icon, v, label, sub) => `<div class="stat"><i class="fa-solid ${icon}"></i><div><b>${v}</b><small>${label}${sub ? `<br>${sub}` : ''}</small></div></div>`;
    const maxDay = Math.max(1, ...r.perHari.map(x => x.scan));
    const totalCust = r.perPelanggan.reduce((a, x) => ({ dpp: a.dpp + Number(x.dpp), ppn: a.ppn + Number(x.ppn), total: a.total + Number(x.total) }), { dpp: 0, ppn: 0, total: 0 });
    const totalFak = r.faktur.reduce((a, x) => ({ dpp: a.dpp + Number(x.dpp), dl: a.dl + Number(x.dppLain), ppn: a.ppn + Number(x.ppn) }), { dpp: 0, dl: 0, ppn: 0 });
    $('#rBody').innerHTML = `
      <div class="stats">
        ${stat('fa-file-circle-plus', fmt(s.poBaru), 'PO baru', `${fmt(s.pcsPO)} pcs · Rp ${rp(s.nilaiPO)}`)}
        ${stat('fa-qrcode', fmt(s.pcsScan), 'Pcs ter-scan (produksi)')}
        ${stat('fa-truck', fmt(s.pcsKirim), 'Pcs dikirim', `${fmt(s.sjTerbit)} Surat Jalan`)}
        ${stat('fa-file-invoice-dollar', 'Rp ' + rp(s.totalInvoice), `${fmt(s.invoice)} invoice (incl. PPN)`, `DPP ${rp(s.dpp)} · PPN ${rp(s.ppn)}`)}
      </div>
      <div class="tags">
        <span class="tag ${s.proformaTerbuka ? 'warn' : ''}">${fmt(s.proformaTerbuka)} proforma belum dibayar · Rp ${rp(s.nilaiProformaTerbuka)}</span>
        <span class="tag ${s.spMenunggu ? 'warn' : ''}">${fmt(s.spMenunggu)} Surat Pesanan menunggu persetujuan</span>
        <span class="tag">${fmt(s.spBaru)} Surat Pesanan masuk di periode ini</span>
      </div>

      <div class="card"><h3>Produksi per hari (pcs ter-scan)</h3>
        ${r.perHari.length ? `<div class="bars">${r.perHari.map(x => `<div class="bar-row"><span class="num">${esc(dmy(x.tanggal))}</span><div><i style="width:${Math.max(2, x.scan / maxDay * 100)}%"></i></div><b class="num">${fmt(x.scan)}</b></div>`).join('')}</div>`
          : '<p class="muted" style="margin-top:8px">Tidak ada scan pada periode ini.</p>'}</div>

      <div class="card"><h3>Penjualan per pelanggan</h3>
        ${table([['Pelanggan'], ['Invoice', 'r'], ['DPP', 'r'], ['PPN', 'r'], ['Total', 'r']],
          r.perPelanggan.map(x => `<tr><td>${esc(x.pelanggan)}</td><td class="r">${fmt(x.invoice)}</td><td class="r">${rp(x.dpp)}</td><td class="r">${rp(x.ppn)}</td><td class="r"><b>${rp(x.total)}</b></td></tr>`),
          r.perPelanggan.length ? `<tfoot><tr><td>Total</td><td></td><td class="r">${rp(totalCust.dpp)}</td><td class="r">${rp(totalCust.ppn)}</td><td class="r">${rp(totalCust.total)}</td></tr></tfoot>` : '')}
        <p class="hint">Invoice, Invoice DP, dan Pelunasan pada periode ini (proforma dan dokumen batal tidak dihitung).</p></div>

      <div class="card"><h3>Status PO: produksi → kirim → tagih</h3>
        ${table([['No PO'], ['Pelanggan'], ['Tgl PO'], ['Target', 'r'], ['Scan', 'r'], ['Kirim', 'r'], ['Nilai PO', 'r'], ['Sudah ditagih', 'r'], ['Belum ditagih', 'r']],
          r.statusPO.map(x => { const sisa = Number(x.nilai) - Number(x.ditagih); return `<tr><td class="mono">${esc(x.noPO)}</td><td>${esc(x.pelanggan)}</td><td>${esc(dmy(x.tglPO))}</td>
            <td class="r">${fmt(x.target)}</td><td class="r">${fmt(x.scan)}</td><td class="r">${fmt(x.kirim)}</td><td class="r">${rp(x.nilai)}</td><td class="r">${rp(x.ditagih)}</td>
            <td class="r ${sisa > 0 ? 'warn' : ''}">${rp(Math.max(0, sisa))}</td></tr>`; }))}
        <p class="hint">PO dengan tanggal PO di periode ini, ditambah semua PO yang nilainya belum tertagih penuh (sebelum PPN).</p></div>

      <div class="card"><h3>Rekap faktur pajak</h3>
        ${table([['Tanggal'], ['No. Invoice'], ['Jenis'], ['Pelanggan'], ['NPWP'], ['DPP', 'r'], ['DPP lain', 'r'], ['PPN', 'r'], ['No. Faktur'], ['XML']],
          r.faktur.map(x => `<tr><td>${esc(dmy(x.tanggal))}</td><td class="mono">${esc(x.no)}</td><td>${esc(JN[x.jenis] || x.jenis)}</td><td>${esc(x.pelanggan)}</td>
            <td class="mono">${esc(x.npwp || '-')}</td><td class="r">${rp(x.dpp)}</td><td class="r">${rp(x.dppLain)}</td><td class="r">${rp(x.ppn)}</td>
            <td class="mono ${x.noFaktur ? '' : 'warn'}">${esc(x.noFaktur || 'belum diisi')}</td><td>${x.jenis === 'PELUNASAN' ? 'manual' : x.xml ? '✓' : '—'}</td></tr>`),
          r.faktur.length ? `<tfoot><tr><td colspan="5">Total</td><td class="r">${rp(totalFak.dpp)}</td><td class="r">${rp(totalFak.dl)}</td><td class="r">${rp(totalFak.ppn)}</td><td colspan="2"></td></tr></tfoot>` : '')}</div>`;
  }

  async function exportReport(btn) {
    if (!ui.data) return toast('Tampilkan laporan dulu.', 'info');
    await run(btn, async () => {
      await loadScript(LIB.xlsx);
      const r = ui.data, s = r.ringkasan, wb = XLSX.utils.book_new();
      const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
      add('Ringkasan', [['Laporan periode', `${ui.d1} s/d ${ui.d2}`], [],
        ['PO baru', s.poBaru], ['Pcs di PO baru', s.pcsPO], ['Nilai PO baru (Rp)', Number(s.nilaiPO)], ['Pcs ter-scan', s.pcsScan],
        ['Surat Jalan terbit', s.sjTerbit], ['Pcs dikirim', s.pcsKirim], ['Invoice terbit', s.invoice], ['DPP (Rp)', Number(s.dpp)], ['PPN (Rp)', Number(s.ppn)],
        ['Total invoice (Rp)', Number(s.totalInvoice)], ['Proforma belum dibayar', s.proformaTerbuka], ['Nilai proforma belum dibayar (Rp)', Number(s.nilaiProformaTerbuka)],
        ['Surat Pesanan masuk', s.spBaru], ['Surat Pesanan menunggu', s.spMenunggu]]);
      add('Produksi Harian', [['Tanggal', 'Pcs ter-scan'], ...r.perHari.map(x => [dmy(x.tanggal), x.scan])]);
      add('Per Pelanggan', [['Pelanggan', 'Jumlah invoice', 'DPP', 'PPN', 'Total'], ...r.perPelanggan.map(x => [x.pelanggan, x.invoice, Number(x.dpp), Number(x.ppn), Number(x.total)])]);
      add('Status PO', [['No PO', 'Pelanggan', 'Tgl PO', 'Target', 'Scan', 'Kirim', 'Nilai PO', 'Sudah ditagih', 'Belum ditagih', 'Status'],
        ...r.statusPO.map(x => [x.noPO, x.pelanggan, dmy(x.tglPO), x.target, x.scan, x.kirim, Number(x.nilai), Number(x.ditagih), Math.max(0, Number(x.nilai) - Number(x.ditagih)), x.status])]);
      add('Faktur Pajak', [['Tanggal', 'No. Invoice', 'Jenis', 'No PO', 'Pelanggan', 'NPWP', 'DPP', 'DPP nilai lain', 'PPN', 'Total', 'No. Faktur', 'XML'],
        ...r.faktur.map(x => [dmy(x.tanggal), x.no, JN[x.jenis] || x.jenis, x.noPO, x.pelanggan, x.npwp, Number(x.dpp), Number(x.dppLain), Number(x.ppn), Number(x.total), x.noFaktur,
          x.jenis === 'PELUNASAN' ? 'manual' : x.xml ? 'sudah' : 'belum'])]);
      XLSX.writeFile(wb, `laporan_${ui.d1.split('/').reverse().join('')}-${ui.d2.split('/').reverse().join('')}.xlsx`);
    });
  }

  /* =====================================================================
     BACKUP
     ===================================================================== */
  const TAB_NAMA = { customers: 'Pelanggan', master_data: 'Warna & Ukuran', master_po: 'PO', po_items: 'Item PO', master_qr: 'Master QR', scan_logs: 'Log Scan',
    delivery_notes: 'Surat Jalan', dn_items: 'Item Surat Jalan', invoices: 'Invoice', invoice_lines: 'Baris Invoice', sales_orders: 'Surat Pesanan',
    sales_order_items: 'Item Surat Pesanan', scan_corrections: 'Koreksi Scan', users: 'User', roles: 'Role', settings: 'Pengaturan', counters: 'Penomoran' };
  const lastKey = 'coa_last_backup';
  async function loadBackupInfo() {
    $('#bkInfo').innerHTML = '<div class="skel"></div>';
    const r = await run(null, () => api('backup', ''));
    if (!r) return;
    let last = null; try { last = localStorage.getItem(lastKey); } catch (e) {}
    $('#bkLast').textContent = last ? `Backup terakhir dari perangkat ini: ${last}` : 'Belum pernah backup dari perangkat ini.';
    $('#bkInfo').innerHTML = `<div class="tags">${r.tabel.map(t => `<span class="tag">${esc(TAB_NAMA[t] || t)}: ${fmt(r.jumlah[t])}</span>`).join('')}</div>`;
    ui.bk = r;
  }
  const cell = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
  async function runBackup(btn) {
    if (!ui.bk) await loadBackupInfo();
    if (!ui.bk) return;
    await run(btn, async () => {
      await loadScript(LIB.xlsx);
      const wb = XLSX.utils.book_new(), prog = $('#bkProg');
      for (const t of ui.bk.tabel) {
        let rows = [], off = 0, r;
        do {
          prog.textContent = `Mengambil ${TAB_NAMA[t] || t}… ${fmt(off)} / ${fmt(ui.bk.jumlah[t])}`;
          r = await api('backup', t, off);
          rows = rows.concat(r.rows); off += r.rows.length;
        } while (r.lanjut);
        const cols = rows.length ? Object.keys(rows[0]) : ['(kosong)'];
        const ws = XLSX.utils.aoa_to_sheet([cols, ...rows.map(x => cols.map(c => cell(x[c])))]);
        XLSX.utils.book_append_sheet(wb, ws, (TAB_NAMA[t] || t).slice(0, 31));
      }
      prog.textContent = 'Menyusun file…';
      XLSX.writeFile(wb, `backup_COA_${stamp()}.xlsx`);
      const now = new Date().toLocaleString('id-ID');
      try { localStorage.setItem(lastKey, now); } catch (e) {}
      $('#bkLast').textContent = `Backup terakhir dari perangkat ini: ${now}`;
      prog.textContent = 'Selesai. File backup sudah diunduh.';
      toast('Backup selesai diunduh.', 'ok');
    });
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  function firstOfMonth() { const d = new Date(); return `01/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; }
  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', `
      <section id="page-laporan" class="page" hidden>
        <div class="card">
          <div class="toolbar" style="align-items:end">
            <div class="f" style="min-width:170px"><span>Dari tanggal</span>${dateField('rD1', firstOfMonth())}</div>
            <div class="f" style="min-width:170px"><span>Sampai tanggal</span>${dateField('rD2', todayDMY())}</div>
            <div class="chips" id="rQuick">
              <button type="button" class="chip" data-rq="bulan">Bulan ini</button><button type="button" class="chip" data-rq="lalu">Bulan lalu</button>
              <button type="button" class="chip" data-rq="tahun">Tahun ini</button></div>
            <div class="row" style="margin-left:auto"><button class="btn primary" id="btnReport"><i class="fa-solid fa-chart-column"></i> Tampilkan</button>
              <button class="btn" id="btnReportXls"><i class="fa-solid fa-file-excel"></i> Export Excel</button></div>
          </div>
        </div>
        <div id="rBody" class="col"></div>
      </section>
      <section id="page-backup" class="page" hidden>
        <div class="card">
          <h2>Backup seluruh data</h2>
          <p class="muted" style="font-size:13.5px;margin:6px 0 14px">Satu file Excel berisi semua tabel (satu sheet per tabel): pelanggan, PO, scan, Surat Jalan, invoice,
            Surat Pesanan, user (tanpa password), pengaturan (tanpa gambar), dan penomoran. Paket gratis Supabase tidak punya backup otomatis —
            lakukan backup rutin (mis. tiap minggu) dan simpan filenya di Google Drive.</p>
          <div id="bkInfo"></div>
          <div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn primary" id="btnBackup"><i class="fa-solid fa-download"></i> Unduh backup Excel</button>
            <span class="hint" id="bkProg"></span></div>
          <p class="hint" id="bkLast" style="margin-top:10px"></p>
        </div>
      </section>`);
    $('#btnReport').onclick = e => loadReport(e.currentTarget);
    $('#btnReportXls').onclick = e => exportReport(e.currentTarget);
    $('#rQuick').onclick = e => {
      const b = e.target.closest('[data-rq]'); if (!b) return;
      const d = new Date(), y = d.getFullYear(), m = d.getMonth();
      const fmtD = x => `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
      const [a, z] = b.dataset.rq === 'bulan' ? [new Date(y, m, 1), d] : b.dataset.rq === 'lalu' ? [new Date(y, m - 1, 1), new Date(y, m, 0)] : [new Date(y, 0, 1), d];
      $('#rD1').value = fmtD(a); $('#rD2').value = fmtD(z);
      loadReport();
    };
    $('#btnBackup').onclick = e => runBackup(e.currentTarget);
  }

  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [
      { id: 'laporan', group: 'Laporan', order: 0, perm: 'laporan.lihat', label: 'Laporan', icon: 'fa-chart-column', title: 'Laporan',
        sub: 'Produksi, pengiriman, penjualan, status PO, dan rekap faktur pajak per periode.', onShow: () => { if (!ui.data) loadReport(); } },
      { id: 'backup', group: 'Sistem', order: 3, perm: 'backup.unduh', label: 'Backup', icon: 'fa-database', title: 'Backup Data',
        sub: 'Unduh salinan seluruh data ke Excel.', onShow: () => loadBackupInfo() }
    ]
  });
})();
