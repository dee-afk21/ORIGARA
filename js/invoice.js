/* =====================================================================
   Origara v0.4 — modul Penagihan:
   Proforma, Invoice (dari Surat Jalan), Invoice DP, Invoice Pelunasan,
   cetak PDF, nomor faktur pajak, dan export XML Coretax.
   Memakai fungsi bersama dari index.html dan COA_PRINT dari js/sertifikat.js.
   ===================================================================== */
(function () {
  'use strict';
  const ui = { list: null, query: '', jenis: '', timer: 0 };
  const JENIS = { PROFORMA: 'Proforma', INVOICE: 'Invoice', DP: 'Invoice DP', PELUNASAN: 'Pelunasan' };
  const UNTUK = { PENUH: 'Tagihan penuh', DP: 'Uang muka (DP)', PELUNASAN: 'Pelunasan' };
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  /* ---------- bantuan ---------- */
  const longDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : (iso || ''); };
  const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || ''); };
  const rp0 = n => Math.round(Number(n || 0)).toLocaleString('id-ID');               // tampilan dokumen: tanpa desimal
  const rp2 = n => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const uom = code => code === 'UM.0021' ? 'PCS' : String(typeof unitName === 'function' ? unitName(code) : code).toUpperCase();
  const custName = id => (typeof nameOf === 'function' ? nameOf('pelanggan', id) : id);
  const docTitle = v => v.jenis === 'PROFORMA' ? 'PROFORMA INVOICE' : v.jenis === 'DP' ? 'INVOICE UANG MUKA' : v.jenis === 'PELUNASAN' ? 'INVOICE PELUNASAN' : 'INVOICE';
  const kindLabel = v => v.jenis === 'PROFORMA' ? `Proforma · ${UNTUK[v.untuk] || ''}` : JENIS[v.jenis];

  /** Terbilang bahasa Indonesia: 13209000 -> "Tiga belas juta dua ratus sembilan ribu rupiah". */
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

  /* =====================================================================
     DAFTAR
     ===================================================================== */
  async function loadInv(btn) {
    if (!ui.list) $('#invList').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const list = await run(btn, () => api('listInvoices', ui.query, ui.jenis));
    if (list) { ui.list = list; renderInv(); }
  }
  function renderInv() {
    $('#btnNewInv').hidden = !can('inv.buat');
    $('#btnCoretax').hidden = !can('inv.coretax');
    const chips = [['', 'Semua'], ['PROFORMA', 'Proforma'], ['INVOICE', 'Invoice'], ['DP', 'DP'], ['PELUNASAN', 'Pelunasan']];
    $('#invChips').innerHTML = chips.map(c => `<button type="button" class="chip ${ui.jenis === c[0] ? 'on' : ''}" data-ij="${c[0]}">${c[1]}</button>`).join('');
    const list = ui.list || [];
    if (!list.length) {
      $('#invList').innerHTML = `<div class="empty"><i class="fa-solid fa-file-invoice-dollar"></i><b>${ui.query || ui.jenis ? 'Tidak ditemukan' : 'Belum ada dokumen'}</b>${ui.query || ui.jenis ? 'Ubah kata kunci atau filter.' : 'Buat invoice dari Surat Jalan, atau proforma / DP dari PO.'}</div>`;
      return;
    }
    const buat = can('inv.buat'), batal = can('inv.batal'), hapus = can('inv.hapus');
    $('#invList').innerHTML = list.map(v => {
      const tags = [];
      if (v.status === 'Batal') tags.push('<span class="tag warn">Dibatalkan</span>');
      else if (v.status === 'Diproses') tags.push(`<span class="tag ok">→ ${esc(v.diprosesKe)}</span>`);
      if (v.noFaktur) tags.push(`<span class="tag">Faktur ${esc(v.noFaktur)}</span>`);
      if (v.xml) tags.push('<span class="tag">XML ✓</span>');
      return `<div class="li" data-inv="${esc(v.no)}" data-jenis="${v.jenis}">
        <div class="t"><b class="mono">${esc(v.no)}</b>
          <small>${esc(kindLabel(v))} · ${esc(dmy(v.tanggal))} · PO ${esc(v.noPO)} · ${esc(v.pelanggan)}${v.noDN.length ? ' · ' + esc(v.noDN.join(', ')) : ''}</small>
          <div class="tags" style="margin-top:4px"><span class="tag ok" style="font-weight:800">${rupiah(v.total)}</span>${tags.join('')}</div></div>
        <div class="acts" style="flex-wrap:wrap;justify-content:flex-end">
          <button class="btn sm" data-iact="print" title="Cetak / PDF"><i class="fa-solid fa-print"></i></button>
          ${buat && v.jenis === 'PROFORMA' && v.status === 'Terbit' ? '<button class="btn sm t-ok" data-iact="convert" title="Sudah dibayar: terbitkan invoice"><i class="fa-solid fa-file-circle-check"></i> Terbitkan</button>' : ''}
          ${v.jenis === 'PELUNASAN' && v.status !== 'Batal' ? '<button class="btn sm" data-iact="info" title="Data untuk Coretax"><i class="fa-solid fa-receipt"></i> Coretax</button>' : ''}
          ${buat && v.jenis !== 'PROFORMA' && v.status !== 'Batal' ? '<button class="btn sm" data-iact="faktur" title="Isi nomor faktur pajak"><i class="fa-solid fa-hashtag"></i></button>' : ''}
          ${batal && v.status === 'Terbit' ? '<button class="btn sm icon t-bad" data-iact="batal" aria-label="Batalkan" title="Batalkan"><i class="fa-solid fa-ban"></i></button>' : ''}
          ${hapus && v.status !== 'Diproses' ? '<button class="btn sm icon t-bad" data-iact="hapus" aria-label="Hapus permanen" title="Hapus permanen (nomor dipakai lagi)"><i class="fa-solid fa-trash"></i></button>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  /* =====================================================================
     BUAT DOKUMEN
     ===================================================================== */
  function previewHTML(dr) {
    const pel = dr.jenis === 'PELUNASAN' || (dr.jenis === 'PROFORMA' && dr.untuk === 'PELUNASAN');
    return `
      <div class="list" style="padding:0">${dr.lines.map((l, i) => `
        <div class="li" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px">
          <input class="input i-nm" data-i="${i}" value="${esc(l.nama)}" aria-label="Nama barang baris ${i + 1}">
          <span class="num" style="text-align:right;font-size:13px">${rp2(l.qty)} ${esc(uom(l.satuan))} × ${rp2(l.harga)}<br><b>${rupiah(l.jumlah)}</b></span>
        </div>`).join('')}</div>
      <div class="kv" style="justify-content:flex-end">
        <span>Subtotal <b>${rupiah(dr.subtotal)}</b></span>
        ${Number(dr.diskon) ? `<span>Diskon <b>${rupiah(dr.diskon)}</b></span>` : ''}
        ${pel ? `<span>Uang muka dipotong <b>${rupiah(dr.potongDp)}</b></span>` : ''}
        <span>DPP <b>${rupiah(dr.dpp)}</b></span><span>DPP nilai lain <b>${rupiah(dr.dppLain)}</b></span>
        <span>PPN ${esc(dr.tarifPpn)}% <b>${rupiah(dr.ppn)}</b></span><span>Total <b>${rupiah(dr.total)}</b></span>
      </div>
      ${pel && dr.semuaTerkirim === false ? '<div class="note">Belum semua barang PO ini terkirim. Pelunasan biasanya dibuat setelah semua barang terkirim.</div>' : ''}
      ${!dr.npwp && dr.jenis !== 'PROFORMA' ? '<div class="note">NPWP pelanggan ini belum diisi. Invoice tetap bisa dibuat, tetapi belum bisa diekspor ke Coretax.</div>' : ''}`;
  }

  async function newInv(preset) {
    const src = await run($('#btnNewInv'), () => api('invSources'));
    if (!src) return;
    let draft = null, names = [], timer = 0, seq = 0;
    const poOpt = (filter, hint) => {
      const list = src.po.filter(filter);
      return list.length ? '<option value="">— Pilih PO —</option>' + list.map(p => `<option value="${esc(p.noPO)}">${esc(p.noPO)} · ${esc(custName(p.idPelanggan))} · ${rupiah(p.nilai)}${hint ? hint(p) : ''}</option>`).join('')
        : '<option value="">Tidak ada PO yang bisa dipilih</option>';
    };
    const free = p => !p.bill.perSJ && !p.bill.penuh;
    const res = await modal({
      title: 'Buat dokumen tagihan', icon: 'fa-file-invoice-dollar', wide: true, sticky: true, confirmText: 'Terbitkan',
      html: `
        <label class="f"><span>Jenis dokumen *</span><select class="input" id="iJenis">
          <option value="INVOICE">Invoice — dari Surat Jalan</option>
          <option value="PROFORMA">Proforma Invoice — sebelum dibayar / dikirim</option>
          <option value="DP">Invoice DP (uang muka) — dari PO</option>
          <option value="PELUNASAN">Invoice Pelunasan — PO yang sudah ada DP</option></select></label>
        <div id="iSrc"></div>
        <div class="f2">
          <div class="f"><span>Tanggal dokumen *</span>${dateField('iTgl', todayDMY())}</div>
          <div class="f"><span>Nomor (perkiraan)</span><input class="input mono" id="iNo" readonly></div>
          <label class="f" id="iDiskonF"><span>Diskon (Rp)</span><div class="rp"><input class="input num" id="iDiskon" inputmode="decimal" placeholder="0"></div></label>
        </div>
        <div id="iPrev" class="hint">Pilih sumber dokumen untuk melihat rinciannya.</div>
        <div class="sub-h">Ditagihkan kepada</div>
        <div class="f2">
          <label class="f w2"><span>Bill To</span><input class="input" id="iBill"></label>
          <label class="f w2"><span>Alamat penagihan</span><textarea class="input" id="iAlamat" rows="2"></textarea></label>
          <label class="f"><span>Up</span><input class="input" id="iUp"></label>
          <label class="f"><span>Catatan (tampil di dokumen)</span><input class="input" id="iCat"></label>
        </div>`,
      onOpen: d => {
        const jenis = () => $('#iJenis', d).value;
        const renderSrc = () => {
          const j = jenis();
          let h = '';
          if (j === 'INVOICE') {
            const list = src.dn.filter(x => !x.dp);
            h = `<label class="f"><span>Surat Jalan yang ditagih *</span><select class="input" id="iDN">${list.length
              ? '<option value="">— Pilih Surat Jalan —</option>' + list.map(x => `<option value="${esc(x.noDN)}">${esc(x.noDN)} · ${esc(dmy(x.tanggal))} · PO ${esc(x.noPO)} · ${esc(custName(x.idPelanggan))} · ${qtyText(x.qty)} barang</option>`).join('')
              : '<option value="">Semua Surat Jalan sudah ditagih</option>'}</select></label>
              ${src.dn.some(x => x.dp) ? '<p class="hint">Surat Jalan dari PO yang memakai DP tidak muncul di sini; tagihannya lewat Invoice Pelunasan.</p>' : ''}`;
          } else if (j === 'PROFORMA') {
            h = `<div class="f2"><label class="f"><span>Proforma untuk *</span><select class="input" id="iUntuk">
                  <option value="DP">Uang muka (DP)</option><option value="PELUNASAN">Pelunasan</option><option value="PENUH">Tagihan penuh</option></select></label>
                <label class="f"><span>PO *</span><select class="input" id="iPO"></select></label></div>
                <div class="f2" id="iDpBox"><label class="f"><span>Uang muka (%)</span><input class="input num" id="iPct" inputmode="decimal" placeholder="mis. 30"></label>
                <label class="f"><span>atau nominal (Rp)</span><div class="rp"><input class="input num" id="iNom" inputmode="decimal" placeholder="0"></div></label></div>`;
          } else if (j === 'DP') {
            h = `<label class="f"><span>PO *</span><select class="input" id="iPO">${poOpt(p => free(p) && !p.bill.pelunasan, p => p.bill.dp ? ' · sudah ada DP' : '')}</select></label>
                <div class="f2" id="iDpBox"><label class="f"><span>Uang muka (%)</span><input class="input num" id="iPct" inputmode="decimal" placeholder="mis. 30"></label>
                <label class="f"><span>atau nominal (Rp)</span><div class="rp"><input class="input num" id="iNom" inputmode="decimal" placeholder="0"></div></label></div>`;
          } else {
            h = `<label class="f"><span>PO *</span><select class="input" id="iPO">${poOpt(p => p.bill.dp > 0 && !p.bill.pelunasan, p => ' · DP ' + rupiah(p.bill.dpDpp))}</select></label>`;
          }
          $('#iSrc', d).innerHTML = h;
          if (j === 'PROFORMA') fillProformaPO();
          $('#iDiskonF', d).hidden = j === 'DP';
          draft = null; names = []; $('#iPrev', d).innerHTML = '<span class="hint">Pilih sumber dokumen untuk melihat rinciannya.</span>'; $('#iNo', d).value = '';
          if (preset && j === preset.jenis) { const sel = $(preset.jenis === 'INVOICE' ? '#iDN' : '#iPO', d); if (sel) { sel.value = preset.ref; preset = null; refresh(); } }
        };
        const fillProformaPO = () => {
          const u = $('#iUntuk', d).value;
          $('#iPO', d).innerHTML = u === 'PENUH' ? poOpt(p => free(p) && !p.bill.dp)
            : u === 'DP' ? poOpt(p => free(p) && !p.bill.pelunasan, p => p.bill.dp ? ' · sudah ada DP' : '')
            : poOpt(p => p.bill.dp > 0 && !p.bill.pelunasan, p => ' · DP ' + rupiah(p.bill.dpDpp));
          $('#iDpBox', d).hidden = u !== 'DP';
        };
        const payload = () => {
          const j = jenis(), v = id => { const el = $('#' + id, d); return el ? el.value.trim() : ''; };
          const body = { jenis: j, tanggal: v('iTgl'), diskon: String(parsePrice(v('iDiskon')) || ''), nama: names };
          if (j === 'INVOICE') body.noDN = v('iDN'); else body.noPO = v('iPO');
          if (j === 'PROFORMA') body.untuk = v('iUntuk');
          if ($('#iPct', d) && !$('#iDpBox', d).hidden) { body.dpPersen = v('iPct').replace(',', '.'); body.dpNominal = String(parsePrice(v('iNom')) || ''); }
          return body;
        };
        const refresh = () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const body = payload();
            if (!(body.noDN || body.noPO) || !validDMY(body.tanggal)) return;
            const isDp = body.jenis === 'DP' || (body.jenis === 'PROFORMA' && body.untuk === 'DP');
            if (isDp && !body.dpPersen && !body.dpNominal) { $('#iPrev', d).innerHTML = '<span class="hint">Isi persentase atau nominal uang muka.</span>'; return; }
            const my = ++seq;
            try {
              const dr = await api('invDraft', body);
              if (my !== seq) return;
              const first = !draft;
              draft = dr; names = dr.lines.map(l => l.nama);
              $('#iPrev', d).className = ''; $('#iPrev', d).innerHTML = previewHTML(dr);
              $('#iNo', d).value = dr.nomorBerikutnya || '';
              if (first || !$('#iBill', d).value) { $('#iBill', d).value = dr.billNama || ''; $('#iAlamat', d).value = dr.billAlamat || ''; $('#iUp', d).value = dr.up || ''; }
            } catch (e) { if (my === seq) { draft = null; $('#iPrev', d).className = 'note'; $('#iPrev', d).textContent = e.message; } }
          }, 250);
        };
        $('#iJenis', d).onchange = renderSrc;
        d.addEventListener('change', e => {
          if (e.target.id === 'iUntuk') { fillProformaPO(); draft = null; }
          if (e.target.id === 'iDN' || e.target.id === 'iPO') { draft = null; $('#iBill', d).value = ''; }
          if (['iDN', 'iPO', 'iUntuk', 'iTgl'].includes(e.target.id) || e.target.classList.contains('date-native')) refresh();
        });
        d.addEventListener('input', e => {
          if (e.target.classList.contains('i-nm')) { names[+e.target.dataset.i] = e.target.value; return; }
          if (e.target.id === 'iPct' && e.target.value) $('#iNom', d).value = '';
          if (e.target.id === 'iNom' && e.target.value) $('#iPct', d).value = '';
          if (['iDiskon', 'iPct', 'iNom', 'iTgl'].includes(e.target.id)) refresh();
        });
        if (preset) $('#iJenis', d).value = preset.jenis;
        renderSrc();
      },
      collect: d => {
        if (!draft) throw new Error('Lengkapi sumber dokumen sampai rinciannya tampil.');
        const v = id => $('#' + id, d).value.trim();
        if (!validDMY(v('iTgl'))) { $('#iTgl', d).classList.add('invalid'); throw new Error('Tanggal tidak valid. Format: DD/MM/YYYY.'); }
        const j = v('iJenis');
        const body = { jenis: j, tanggal: v('iTgl'), diskon: String(parsePrice(v('iDiskon')) || ''), nama: names,
                       billNama: v('iBill'), billAlamat: v('iAlamat'), up: v('iUp'), catatan: v('iCat') };
        if (j === 'INVOICE') body.noDN = v('iDN'); else body.noPO = v('iPO');
        if (j === 'PROFORMA') body.untuk = v('iUntuk');
        if ($('#iPct', d) && !$('#iDpBox', d).hidden) { body.dpPersen = v('iPct').replace(',', '.'); body.dpNominal = String(parsePrice(v('iNom')) || ''); }
        return body;
      },
      action: body => api('createInvoice', body)
    });
    if (!res) return;
    afterCreate(res);
  }
  function afterCreate(res) {
    toast(res.message, 'ok');
    ui.query = ''; $('#invSearch').value = '';
    loadInv();
    modal({
      title: 'Dokumen terbit', text: res.no, icon: 'fa-circle-check', tone: 'ok', noConfirm: true, cancelText: 'Tutup',
      html: '<button type="button" class="btn primary block" data-p><i class="fa-solid fa-print"></i> Cetak / Simpan PDF</button>',
      onOpen: (d, finish) => { $('[data-p]', d).onclick = () => { printInv(res.no); finish(null); }; }
    });
  }

  /** Proforma sudah dibayar -> terbitkan Invoice / Invoice DP / Invoice Pelunasan dengan tanggal pembayaran. */
  async function convert(no) {
    const v = (ui.list || []).find(x => x.no === no);
    const target = { PENUH: 'Invoice', DP: 'Invoice DP', PELUNASAN: 'Invoice Pelunasan' }[v.untuk] || 'Invoice';
    const res = await modal({
      title: `Terbitkan ${target}`, text: `dari Proforma ${no}`, icon: 'fa-file-circle-check', confirmText: `Terbitkan ${target}`,
      html: `<div class="f"><span>Tanggal invoice (tanggal pembayaran) *</span>${dateField('cTgl', todayDMY())}</div>
             <p class="hint">Isi dan nilai disalin dari proforma. Nomor memakai urutan Invoice.</p>`,
      collect: d => { const t = $('#cTgl', d).value; if (!validDMY(t)) throw new Error('Tanggal tidak valid.'); return t; },
      action: tgl => api('createInvoice', { refProforma: no, tanggal: tgl })
    });
    if (res) afterCreate(res);
  }
  async function setFaktur(no) {
    const v = (ui.list || []).find(x => x.no === no);
    const res = await modal({
      title: 'Nomor faktur pajak', text: no, icon: 'fa-hashtag', confirmText: 'Simpan',
      html: `<label class="f"><span>Nomor faktur dari Coretax</span><input class="input mono" id="fNo" value="${esc(v.noFaktur)}" placeholder="kosongkan untuk menghapus"></label>
             ${v.jenis === 'DP' ? '<p class="hint">Nomor faktur DP dipakai saat membuat faktur pelunasan di Coretax.</p>' : ''}`,
      collect: d => $('#fNo', d).value.trim(),
      action: f => api('setFaktur', no, f)
    });
    if (res) { toast(res.message, 'ok'); loadInv(); }
  }
  async function cancelInv(no) {
    const res = await modal({
      title: `Batalkan ${no}?`, text: 'Dokumen tetap tersimpan dengan tanda DIBATALKAN dan nomornya tidak dipakai ulang.', icon: 'fa-ban', tone: 'bad', danger: true,
      confirmText: 'Batalkan', html: '<label class="f"><span>Alasan pembatalan *</span><input class="input" id="bAl"></label>',
      collect: d => { const v = $('#bAl', d).value.trim(); if (!v) throw new Error('Isi alasan pembatalan.'); return v; },
      action: a => api('cancelInvoice', no, a)
    });
    if (res) { toast(res.message, 'ok'); loadInv(); }
  }
  // v0.8.3: hapus permanen — nomornya dipakai lagi oleh dokumen berikutnya.
  async function deleteInv(no) {
    const v = (ui.list || []).find(x => x.no === no) || {};
    const res = await modal({
      title: `Hapus ${no} permanen?`, icon: 'fa-trash', tone: 'bad', danger: true, confirmText: 'Hapus permanen',
      text: 'Dokumen dihapus dari daftar dan nomornya akan dipakai lagi oleh dokumen berikutnya. Tindakan ini tidak bisa dibatalkan.',
      html: `${v.xml ? '<div class="note"><b>Invoice ini sudah pernah diekspor ke XML Coretax.</b> Pastikan fakturnya di Coretax juga sudah dibatalkan / tidak dipakai.</div>' : ''}
        <label class="f"><span>Alasan penghapusan *</span><input class="input" id="hAl" placeholder="mis. salah input, dibuat ulang"></label>
        <p class="hint">Isi dokumen tetap dicatat di riwayat penghapusan (ikut di Backup).</p>`,
      collect: d => { const a = $('#hAl', d).value.trim(); if (a.length < 3) throw new Error('Isi alasan penghapusan.'); return a; },
      action: a => api('deleteInvoice', no, a)
    });
    if (res) { toast(res.message, 'ok'); loadInv(); }
  }
  /** Pelunasan tidak diekspor ke XML: tampilkan angka yang perlu disalin ke Coretax (faktur pelunasan dibuat manual). */
  async function coretaxInfo(no) {
    const r = await run(null, () => api('getInvoice', no));
    if (!r) return;
    const v = r.inv;
    modal({
      title: 'Data faktur pelunasan untuk Coretax', text: no, icon: 'fa-receipt', noConfirm: true, cancelText: 'Tutup', wide: true,
      html: `<p class="hint">Di Coretax buat faktur baru, centang <b>Pelunasan</b>, masukkan nomor faktur uang muka, lalu sesuaikan nilainya dengan angka di bawah.</p>
        <div class="facts">
          ${v.dpInfo.map(x => `<div class="fact w2"><small>Faktur uang muka (${esc(x.no)})</small><b class="mono">${esc(x.noFaktur || 'belum diisi — isi lewat tombol # pada Invoice DP')}</b></div>`).join('')}
          <div class="fact"><small>Tanggal</small><b>${esc(dmy(v.tanggal))}</b></div>
          <div class="fact"><small>Referensi</small><b class="mono">#${esc(v.no)}##${esc(v.noPO)}</b></div>
          <div class="fact"><small>Harga jual total</small><b>${rupiah(v.subtotal)}</b></div>
          <div class="fact"><small>Uang muka dipotong (DPP)</small><b>${rupiah(v.potongDp)}</b></div>
          <div class="fact"><small>DPP pelunasan</small><b>${rupiah(v.dpp)}</b></div>
          <div class="fact"><small>DPP nilai lain (${esc(v.rasioDpp)})</small><b>${rupiah(v.dppLain)}</b></div>
          <div class="fact w2"><small>PPN ${esc(v.tarifPpn)}%</small><b>${rupiah(v.ppn)}</b></div>
        </div>
        <div class="list" style="padding:0">${v.lines.map(l => `<div class="li"><div class="t"><b>${esc(l.nama)}</b><small>${rp2(l.qty)} ${esc(uom(l.satuan))} × ${rp2(l.harga)} · kode ${esc(l.kode)} · ${esc(l.satuan)}</small></div></div>`).join('')}</div>`
    });
  }

  /* =====================================================================
     CETAK INVOICE (A4 tegak, mengikuti format invoice lama)
     ===================================================================== */
  const INV_CSS = `
    @page { size: A4 portrait; margin: 0; }
    .inv { width: 210mm; min-height: 297mm; padding: 10mm 14mm 10mm; font: 9.6pt/1.3 Arial, Helvetica, sans-serif; color: #111; position: relative; box-sizing: border-box;
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .inv * { box-sizing: border-box; }
    .inv .kop { width: 100%; display: block; margin-bottom: 3mm; }
    .inv h1 { text-align: center; font-weight: 400; font-size: 22pt; margin: 2mm 0 5mm; letter-spacing: .2mm; }
    .inv .hd { display: grid; grid-template-columns: 1.25fr 1fr; gap: 6mm; font-size: 10pt; }
    .inv .bill b { font-size: 10.5pt; }
    .inv .bill p { margin: 1mm 0 0 0; white-space: pre-line; }
    .inv .kv2 { display: grid; grid-template-columns: 26mm 4mm 1fr; row-gap: 1.6mm; }
    .inv .row2 { display: grid; grid-template-columns: 1.25fr 1fr; gap: 6mm; margin-top: 4mm; font-size: 10pt; }
    .inv table { width: 100%; border-collapse: collapse; margin-top: 1.5mm; font-size: 9.6pt; }
    .inv th { border: .3mm solid #222; font-weight: 400; padding: 1mm 1.5mm; }
    .inv td { border-left: .3mm solid #222; border-right: .3mm solid #222; padding: .8mm 1.5mm; vertical-align: top; }
    .inv tbody tr:last-child td { border-bottom: .3mm solid #222; }
    .inv td.r, .inv th.r { text-align: right; } .inv td.c { text-align: center; }
    .inv .fill td { height: var(--fill, 0); }
    .inv .bot { display: grid; grid-template-columns: 1fr 68mm; gap: 6mm; margin-top: 1mm; }
    .inv .says { display: grid; grid-template-columns: 13mm 1fr; font-size: 10pt; }
    .inv .tot { border-collapse: collapse; width: 100%; margin-top: 0; }
    .inv .tot td { border: .3mm solid #222; padding: .7mm 1.5mm; text-align: right; }
    .inv .tot tr.g td { font-weight: 700; }
    .inv .att { font-size: 7.6pt; margin-top: 3mm; }
    .inv .att b { font-size: 8.4pt; }
    .inv .att ul { margin: 1.5mm 0 0; padding-left: 4mm; }
    .inv .att li { margin-bottom: 2.5mm; }
    .inv .att .bk { display: grid; grid-template-columns: 22mm 1fr; padding-left: 6mm; }
    /* v0.8.5: Hormat Kami, tanda tangan & nama direktur rata kanan dengan tabel total di atasnya */
    .inv .sign { text-align: right; font-size: 10pt; padding-right: 1.5mm; }
    .inv .sign img { height: 27mm; display: block; margin: 2mm 0 2mm auto; max-width: 55mm; object-fit: contain; object-position: right center; }
    .inv .sign .sp { height: 27mm; }
    .inv .note { margin-top: 3mm; font-size: 8.4pt; color: #444; }
    .inv .void { position: absolute; left: 0; right: 0; top: 120mm; text-align: center; font: 900 50pt Arial; color: rgba(217,45,32,.2); transform: rotate(-22deg); }` + COA_PRINT.KOP_CSS;

  function invPage(r) {
    const v = r.inv, p = r.perusahaan || {}, b = r.bank || {}, t = r.ttd || {};
    const ttdImg = r.ttdImg || '';   // tanpa gambar tanda tangan: ruang kosong untuk tanda tangan basah
    const pel = v.jenis === 'PELUNASAN' || (v.jenis === 'PROFORMA' && v.untuk === 'PELUNASAN');
    const fillMm = Math.max(10, 82 - v.lines.length * 9);
    const last5 = String(v.no).replace(/\D/g, '').slice(-5);
    const totRows = [['Sub Total', rp0(v.subtotal)], ['Discount', rp0(v.diskon)]];
    if (pel) totRows.push(['Uang Muka', '(' + rp0(v.potongDp) + ')']);
    totRows.push(['DPP LAINNYA', rp0(v.dppLain)], ['VAT', rp0(v.ppn)]);
    const dnRow = v.noDN.length ? v.noDN.join(', ') : (v.jenis === 'PROFORMA' ? '-' : '-');
    const notes = [];
    if (v.jenis === 'PROFORMA') notes.push('Proforma invoice ini bukan faktur pajak dan bukan bukti pembayaran. Invoice resmi diterbitkan setelah pembayaran diterima.');
    if (pel && v.dpInfo && v.dpInfo.length) notes.push('Dipotong uang muka: ' + v.dpInfo.map(x => `${x.no} (${rp0(x.dpp)})`).join(', ') + '.');
    if (v.catatan) notes.push(v.catatan);
    return `<div class="inv">
      ${COA_PRINT.kop(r)}
      ${v.status === 'Batal' ? '<div class="void">DIBATALKAN</div>' : ''}
      <h1>${docTitle(v)}</h1>
      <div class="hd">
        <div class="bill"><div style="display:grid;grid-template-columns:15mm 1fr"><span>Bill To :</span><b>${esc(v.billNama)}</b></div><p>${esc(v.billAlamat)}</p></div>
        <div class="kv2">
          <span>${v.jenis === 'PROFORMA' ? 'Proforma No.' : 'Invoice No.'}</span><span>:</span><span>${esc(v.no)}</span>
          <span>${v.jenis === 'PROFORMA' ? 'Date' : 'Invoice Date'}</span><span>:</span><span>${esc(longDate(v.tanggal))}</span>
          <span>PO No.</span><span>:</span><span>${esc(v.noPO)}</span>
        </div>
      </div>
      <div class="row2"><div style="display:grid;grid-template-columns:15mm 1fr"><span>Up :</span><span>${esc(v.up || '-')}</span></div>
        <div class="kv2"><span>DN No.</span><span>:</span><span>${esc(dnRow)}</span></div></div>
      <table><thead><tr><th style="width:9mm">No.</th><th>Description</th><th style="width:12mm">Qty</th><th style="width:13mm">UoM</th><th style="width:27mm">Unit Price</th><th style="width:30mm">Amount</th></tr></thead>
        <tbody>${v.lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.nama)}</td><td class="r">${rp2(l.qty)}</td><td>${esc(uom(l.satuan))}</td><td class="r">${rp0(l.harga)}</td><td class="r">${rp0(l.jumlah)}</td></tr>`).join('')}
          <tr class="fill" style="--fill:${fillMm}mm"><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
      <div class="bot">
        <div><div class="says"><span>Says :</span><span>${esc(terbilang(v.total))}</span></div>
          <div class="att"><b>Perhatian !!!</b><ul>
            <li>Pembayaran dapat di transfer ke rekening :
              <div class="bk"><span>Nama Bank</span><span>: ${esc(b.bank || '')}</span><span>Swift Code</span><span>: ${esc(b.swift || '')}</span>
                <span>Kantor Cabang</span><span>: ${esc(b.cabang || '')}</span><span>No. Rekening</span><span>: ${esc(b.norek || '')}</span>
                <span>Atas Nama</span><span>: ${esc(b.atasNama || '')}</span></div></li>
            <li>Untuk memudahkan mengidentifikasi pembayaran, harap menyantumkan No. Invoice (5 Digit angka terakhir: ${esc(last5)}) pada bukti transfer dan bukti transfer dapat di emailkan ke :<br><b>${esc(b.emailBukti || '')}</b></li>
          </ul></div>
          ${notes.length ? `<div class="note">${notes.map(esc).join('<br>')}</div>` : ''}
        </div>
        <div>
          <table class="tot">${totRows.map(x => `<tr><td>${x[0]} :</td><td style="width:30mm">${x[1]}</td></tr>`).join('')}
            <tr class="g"><td>Total ${v.jenis === 'PROFORMA' ? 'Proforma' : 'Invoice'} :</td><td>${rp0(v.total)}</td></tr></table>
          <div class="sign" style="margin-top:6mm">Hormat Kami,${v.jenis === 'PROFORMA' || !ttdImg ? '<div class="sp"></div>' : `<img src="${esc(ttdImg)}" alt="">`}
            <div>${esc(t.nama || '')}</div><div>${esc(t.jabatan || '')}</div></div>
        </div>
      </div>
    </div>`;
  }
  async function printInv(no) {
    let w = null;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (w) w.document.write('<p style="font:16px Arial;padding:24px">Menyiapkan dokumen…</p>');
    try {
      const r = await api('getInvoice', no);
      COA_PRINT.open(docTitle(r.inv) + ' ' + r.inv.no, [invPage(r)], INV_CSS, { win: w });
    } catch (e) { if (w) w.close(); if (e.code !== 'AUTH') toast(e.message, 'bad'); }
  }

  /* =====================================================================
     EXPORT XML CORETAX (format TaxInvoiceBulk, sama dengan converter e-Faktur lama)
     ===================================================================== */
  const x = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const num = n => { const v = Math.round(Number(n || 0) * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2); };
  const tag = (name, val, ind) => `${ind}<${name}${val === '' || val == null ? '/>' : `>${x(val)}</${name}>`}`;
  function buildXML(data) {
    const L = ['<?xml version="1.0" encoding="utf-8"?>',
      '<TaxInvoiceBulk xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      tag('TIN', data.tin, '  '), '  <ListOfTaxInvoice>'];
    data.invoices.forEach(i => {
      const a = '      ';
      L.push('    <TaxInvoice>', tag('TaxInvoiceDate', i.tanggal, a), tag('TaxInvoiceOpt', 'Normal', a), tag('TrxCode', data.trxCode, a),
        tag('AddInfo', '', a), tag('CustomDoc', '', a), tag('CustomDocMonthYear', '', a), tag('RefDesc', i.refDesc, a), tag('FacilityStamp', '', a),
        tag('SellerIDTKU', data.sellerIdtku, a), tag('BuyerTin', i.buyerTin, a), tag('BuyerDocument', 'TIN', a), tag('BuyerCountry', 'IDN', a),
        tag('BuyerDocumentNumber', '-', a), tag('BuyerName', i.buyerName, a), tag('BuyerAdress', String(i.buyerAddress || '').replace(/\s*\n\s*/g, ' '), a),
        tag('BuyerEmail', i.buyerEmail || '', a), tag('BuyerIDTKU', i.buyerIdtku, a), `${a}<ListOfGoodService>`);
      i.lines.forEach(l => {
        const g = '          ';
        L.push('        <GoodService>', tag('Opt', l.opt || 'A', g), tag('Code', l.kode, g), tag('Name', l.nama, g), tag('Unit', l.satuan, g),
          tag('Price', num(l.harga), g), tag('Qty', num(l.qty), g), tag('TotalDiscount', num(l.diskon), g), tag('TaxBase', num(l.dpp), g),
          tag('OtherTaxBase', num(l.dppLain), g), tag('VATRate', num(i.tarifPpn), g), tag('VAT', num(l.ppn), g), tag('STLGRate', '0', g), tag('STLG', '0', g),
          '        </GoodService>');
      });
      L.push(`${a}</ListOfGoodService>`, '    </TaxInvoice>');
    });
    L.push('  </ListOfTaxInvoice>', '</TaxInvoiceBulk>');
    return L.join('\r\n') + '\r\n';
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  async function coretaxExport() {
    const now = new Date(), p2 = n => String(n).padStart(2, '0');
    const first = `01/${p2(now.getMonth() + 1)}/${now.getFullYear()}`;
    let rows = [];
    const res = await modal({
      title: 'Export XML Coretax', icon: 'fa-file-code', wide: true, sticky: true, confirmText: 'Download XML',
      html: `<div class="f2"><div class="f"><span>Dari tanggal</span>${dateField('xD1', first)}</div><div class="f"><span>Sampai tanggal</span>${dateField('xD2', todayDMY())}</div></div>
        <div id="xList" class="list" style="padding:0"></div>
        <p class="hint">Yang bisa diekspor: Invoice dan Invoice DP. Invoice Pelunasan dibuat manual di Coretax (tombol "Coretax" pada pelunasan).
          Setelah impor Invoice DP, centang <b>uang muka</b> di Coretax seperti biasa.</p>`,
      onOpen: d => {
        const load = async () => {
          const a = $('#xD1', d).value, b = $('#xD2', d).value;
          if (!validDMY(a) || !validDMY(b)) return;
          $('#xList', d).innerHTML = '<div class="skel"></div>';
          try { rows = await api('coretaxList', a, b); } catch (e) { $('#xList', d).textContent = e.message; return; }
          $('#xList', d).innerHTML = rows.length ? rows.map((r, i) => `
            <label class="li" style="cursor:pointer"><input type="checkbox" class="x-c" data-i="${i}" ${r.siap && !r.xml ? 'checked' : ''} ${r.siap ? '' : 'disabled'} style="width:18px;height:18px">
              <div class="t"><b class="mono">${esc(r.no)}</b><small>${esc(r.jenis === 'DP' ? 'Invoice DP' : 'Invoice')} · ${esc(dmy(r.tanggal))} · ${esc(r.pelanggan)} · DPP ${rupiah(r.dpp)}</small></div>
              ${!r.siap ? '<span class="tag warn">NPWP / alamat NPWP belum lengkap</span>' : r.xml ? '<span class="tag">Sudah pernah diekspor</span>' : ''}</label>`).join('')
            : '<div class="empty"><b>Tidak ada invoice di rentang tanggal ini</b></div>';
        };
        d.addEventListener('change', e => { if (e.target.id === 'xD1' || e.target.id === 'xD2' || e.target.classList.contains('date-native')) load(); });
        d.addEventListener('input', e => { if ((e.target.id === 'xD1' || e.target.id === 'xD2') && validDMY(e.target.value)) load(); });
        load();
      },
      collect: d => {
        const nos = $$('.x-c:checked', d).map(c => rows[+c.dataset.i].no);
        if (!nos.length) throw new Error('Centang minimal satu invoice.');
        return nos;
      },
      action: async nos => {
        const data = await api('coretax', nos, true);
        const n = new Date();
        download(`Faktur Pajak_Invoice_${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}.xml`, buildXML(data));
        return data;
      }
    });
    if (res) { toast(`${res.invoices.length} faktur diekspor ke XML.`, 'ok'); loadInv(); }
  }

  /* =====================================================================
     HALAMAN & EVENT
     ===================================================================== */
  const PAGE_HTML = `
    <section id="page-inv" class="page" hidden>
      <div class="page-bar">
        <div class="search" style="max-width:360px"><i class="fa-solid fa-magnifying-glass"></i><input class="input" id="invSearch" type="search" placeholder="Cari nomor, PO, Surat Jalan, pelanggan, faktur…"></div>
        <div class="row">
          <button class="btn icon" id="btnReloadInv" title="Muat ulang" aria-label="Muat ulang"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn" id="btnCoretax" hidden><i class="fa-solid fa-file-code"></i> Export Coretax</button>
          <button class="btn primary" id="btnNewInv" hidden><i class="fa-solid fa-plus"></i> Buat dokumen</button>
        </div>
      </div>
      <div class="chips" id="invChips"></div>
      <div class="card list" id="invList"></div>
      <p class="hint">Alur DP: Proforma DP → (dibayar) Terbitkan → Invoice DP → kirim barang → Proforma / Invoice Pelunasan. Tanpa DP: Surat Jalan → Invoice.</p>
    </section>`;

  function bind() {
    $('.pages').insertAdjacentHTML('beforeend', PAGE_HTML);
    $('#btnNewInv').onclick = () => newInv();
    $('#btnCoretax').onclick = coretaxExport;
    $('#btnReloadInv').onclick = e => loadInv(e.currentTarget);
    $('#invSearch').oninput = e => { clearTimeout(ui.timer); ui.timer = setTimeout(() => { ui.query = e.target.value.trim(); loadInv(); }, 350); };
    $('#invChips').onclick = e => { const b = e.target.closest('[data-ij]'); if (b) { ui.jenis = b.dataset.ij; loadInv(); } };
    $('#invList').onclick = e => {
      const b = e.target.closest('[data-iact]'); if (!b) return;
      const no = b.closest('[data-inv]').dataset.inv;
      ({ print: printInv, convert, faktur: setFaktur, batal: cancelInv, hapus: deleteInv, info: coretaxInfo })[b.dataset.iact](no);
    };
  }

  window.COA_INV = { terbilang, buildXML, invPage, INV_CSS, newInv, print: printInv };
  (window.COA_MODULES = window.COA_MODULES || []).push({
    bind,
    pages: [{ id: 'inv', group: 'Penagihan', order: 0, perm: 'inv.lihat', label: 'Invoice', icon: 'fa-file-invoice-dollar', title: 'Invoice & Proforma',
              sub: 'Proforma, invoice dari Surat Jalan, uang muka (DP), pelunasan, dan export XML Coretax.', onShow: () => loadInv() }]
  });
})();
