const $ = id => document.getElementById(id);
const KOMPONEN = ['Whole Blood','PRC','TC','FFP','Cryoprecipitate','Lainnya'];
const KET = ['Normal','Tidak Normal','Ada Perubahan Warna','Ada Gumpalan','Ada Endapan','Hemolisis Terlihat','Lainnya'];
const DEF = { url:'', standar:0.8, pemeriksa:['Pemeriksa 1','Pemeriksa 2','Pemeriksa 3'], jenis:['Single','Double','Triple','Quadruple'], penanggungJawabMutu:'' };
let cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem('cfg') || '{}'));
let rows = [], editQC = null, editMK = null, lastReport = null;

// ---------- util ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num = n => (n === '' || n == null || isNaN(n)) ? '-' : Number(n).toFixed(2).replace('.', ',');
const tgl = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }) : '-';
const toast = m => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2800); };
async function api(action, data) {
  if (!cfg.url) { toast('Isi URL Web App di menu Pengaturan'); throw new Error('no url'); }
  const r = await fetch(cfg.url, { method:'POST', body: JSON.stringify({ action, data: data || {} }) });
  const j = await r.json();
  if (!j.ok) { toast('Error: ' + j.error); throw new Error(j.error); }
  return j.data;
}
const opts = (arr, first) => (first !== undefined ? `<option value="">${first}</option>` : '') + arr.map(a => `<option>${esc(a)}</option>`).join('');
const mkStatus = mk => !mk ? null : (mk.keterangan === 'Normal' && mk.hemolisisMak === 'Tidak Ada') ? 'NORMAL' : 'TIDAK NORMAL';
function showModal(html, buttons) {
  $('modalBody').innerHTML = html; $('modalActions').innerHTML = '';
  buttons.forEach(([label, cls, fn]) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label;
    b.onclick = () => { $('modal').classList.remove('show'); fn && fn(); }; $('modalActions').appendChild(b); });
  $('modal').classList.add('show');
}

// ---------- navigasi ----------
function go(v) {
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.id === 'v-' + v));
  document.querySelectorAll('#nav button').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('active', on); if (on) $('title').textContent = b.textContent; });
}
$('nav').onclick = e => { if (e.target.dataset.view) go(e.target.dataset.view); };

// ---------- init form ----------
function fillSelects() {
  $('qcKomponen').innerHTML = opts(KOMPONEN); $('mkKomponen').innerHTML = opts(KOMPONEN);
  $('mkJenis').innerHTML = opts(cfg.jenis); $('mkKet').innerHTML = opts(KET);
  $('mkPemeriksa').innerHTML = opts(cfg.pemeriksa, '-- pilih --');
  $('rPemeriksa').innerHTML = opts(cfg.pemeriksa, 'Semua'); $('rKomponen').innerHTML = opts(KOMPONEN, 'Semua');
  $('qcStandar').value = String(cfg.standar).replace('.', ',');
  $('sUrl').value = cfg.url; $('sStandar').value = cfg.standar;
  $('sPemeriksa').value = cfg.pemeriksa.join('\n');
  $('sJenis').value = cfg.jenis.join('\n');
  $('sPenanggung').value = cfg.penanggungJawabMutu || '';
}
function pills(el, name, vals) { el.innerHTML = vals.map(v => `<label><input type="radio" name="${name}" value="${v}"><span>${v}</span></label>`).join(''); }
pills($('mkGol'), 'gol', ['A','B','AB','O']); pills($('mkRh'), 'rh', ['Positif','Negatif']);
const radio = n => (document.querySelector(`input[name=${n}]:checked`) || {}).value || '';
const setRadio = (n, v) => document.querySelectorAll(`input[name=${n}]`).forEach(r => r.checked = r.value === v);
document.querySelectorAll('.dt').forEach(i => i.onchange = () => i.nextElementSibling.textContent = i.value ? tgl(i.value) : '');
const today = () => new Date().toISOString().slice(0, 10);

// ---------- QC ----------
function hitungQC() {
  const hb = parseFloat($('qcHb').value), hct = parseFloat($('qcHct').value), low = parseFloat($('qcHbLow').value), b = $('qcKesimpulan');
  if (!(hb > 0) || isNaN(hct) || isNaN(low)) { $('qcHemolisis').value = ''; b.textContent = '-'; b.className = 'badge'; return null; }
  const h = Math.round((100 - hct) * low / hb * 1000) / 1000, lulus = h <= cfg.standar;
  $('qcHemolisis').value = String(h).replace('.', ',');
  b.textContent = lulus ? 'LULUS' : 'TIDAK LULUS'; b.className = 'badge ' + (lulus ? 'ok' : 'bad');
  return h;
}
['qcHb','qcHct','qcHbLow'].forEach(i => $(i).oninput = hitungQC);
function resetQC() {
  editQC = null; $('qcFormTitle').textContent = 'Input QC Hemolisis';
  ['qcNoKantong','qcHb','qcHct','qcHbLow'].forEach(i => $(i).value = ''); $('qcTanggal').value = today(); $('qcTanggal').onchange(); hitungQC();
}
$('qcReset').onclick = resetQC;
$('qcSave').onclick = () => {
  const rec = { tanggal: $('qcTanggal').value, noKantong: $('qcNoKantong').value.trim().toUpperCase(), komponen: $('qcKomponen').value,
    hb: $('qcHb').value, hct: $('qcHct').value, hbLow: $('qcHbLow').value, standar: cfg.standar };
  if (!rec.tanggal || !rec.noKantong || hitungQC() === null) return toast('Lengkapi tanggal, No Kantong, Hb, Hct, Hb Low');
  checkDup('qc', rec, editQC, async () => {
    if (editQC) rec.no = editQC;
    await api(editQC ? 'updateQCData' : 'saveQCData', rec);
    toast('QC tersimpan'); resetQC(); await load(); go('data');
  });
};
function fillQC(q) {
  editQC = q.no; $('qcFormTitle').textContent = 'Edit QC Hemolisis (No ' + q.no + ')';
  $('qcTanggal').value = q.tanggal; $('qcTanggal').onchange(); $('qcNoKantong').value = q.noKantong; $('qcKomponen').value = q.komponen;
  $('qcHb').value = q.hb; $('qcHct').value = q.hct; $('qcHbLow').value = q.hbLow; hitungQC(); go('qc');
}

// ---------- Makroskopis ----------
$('mkKet').onchange = () => $('mkKetLainWrap').classList.toggle('hide', $('mkKet').value !== 'Lainnya');
function resetMK() {
  editMK = null; $('mkFormTitle').textContent = 'Pemeriksaan Makroskopis'; $('mkNo').value = 'Otomatis';
  ['mkNoKantong','mkPenimbangan','mkMean','mkMeanHem','mkKetLain','mkTglBuat','mkTglExp'].forEach(i => $(i).value = '');
  $('mkTanggal').value = today(); document.querySelectorAll('.dt').forEach(i => i.onchange());
  setRadio('gol', ''); setRadio('rh', ''); $('mkKet').value = 'Normal'; $('mkKet').onchange(); $('mkHem').value = 'Tidak Ada'; $('mkPemeriksa').value = '';
}
$('mkReset').onclick = resetMK;
$('mkSave').onclick = () => {
  let ket = $('mkKet').value; if (ket === 'Lainnya') ket = 'Lainnya: ' + $('mkKetLain').value.trim();
  const rec = { tanggal: $('mkTanggal').value, komponen: $('mkKomponen').value, noKantong: $('mkNoKantong').value.trim().toUpperCase(),
    jenisKantong: $('mkJenis').value, golongan: radio('gol'), rhesus: radio('rh'), tglBuat: $('mkTglBuat').value, tglExp: $('mkTglExp').value,
    penimbangan: $('mkPenimbangan').value, meanPenimbangan: $('mkMean').value, keterangan: ket,
    hemolisisMak: $('mkHem').value, meanHemMak: $('mkMeanHem').value, pemeriksa: $('mkPemeriksa').value };
  if (!rec.tanggal || !rec.noKantong || !rec.golongan || !rec.rhesus || !rec.pemeriksa) return toast('Lengkapi tanggal, No Kantong, golongan, rhesus, pemeriksa');
  checkDup('mk', rec, editMK, async () => {
    if (editMK) rec.no = editMK;
    await api(editMK ? 'updateMakroskopisData' : 'saveMakroskopisData', rec);
    toast('Makroskopis tersimpan'); resetMK(); await load(); go('data');
  });
};
function fillMK(m) {
  editMK = m.no; $('mkFormTitle').textContent = 'Edit Makroskopis (No ' + m.no + ')'; $('mkNo').value = m.no;
  $('mkTanggal').value = m.tanggal; $('mkKomponen').value = m.komponen; $('mkNoKantong').value = m.noKantong; $('mkJenis').value = m.jenisKantong;
  setRadio('gol', m.golongan); setRadio('rh', m.rhesus); $('mkTglBuat').value = m.tglBuat; $('mkTglExp').value = m.tglExp;
  $('mkPenimbangan').value = m.penimbangan; $('mkMean').value = m.meanPenimbangan; $('mkMeanHem').value = m.meanHemMak;
  const lain = String(m.keterangan).startsWith('Lainnya');
  $('mkKet').value = lain ? 'Lainnya' : m.keterangan; $('mkKet').onchange(); $('mkKetLain').value = lain ? String(m.keterangan).replace(/^Lainnya:\s*/, '') : '';
  $('mkHem').value = m.hemolisisMak || 'Tidak Ada'; $('mkPemeriksa').value = m.pemeriksa;
  document.querySelectorAll('.dt').forEach(i => i.onchange()); go('mk');
}

// ---------- validasi duplikat ----------
function checkDup(type, rec, selfNo, proceed) {
  const dup = rows.map(r => r[type]).find(x => x && x.noKantong === rec.noKantong && x.tanggal === rec.tanggal && String(x.no) !== String(selfNo));
  if (!dup) return proceed();
  showModal('<h3>Data duplikat</h3><p>Data pemeriksaan untuk No Kantong ini pada tanggal tersebut sudah tersedia.</p>',
    [['Batal', 'ghost'], ['Edit Data', 'ghost', () => type === 'qc' ? fillQC(dup) : fillMK(dup)], ['Tetap Simpan', '', proceed]]);
}

// ---------- load & tampil ----------
async function load() {
  if (!cfg.url) { rows = []; render(); return; }
  rows = await api('getCombinedData'); render();
}
$('btnReload').onclick = () => load().then(() => toast('Data dimuat'));
function render() { renderDash(); renderTable(); }
function bars(el, items) {
  const max = Math.max(1, ...items.map(i => i[1]));
  $(el).innerHTML = items.length ? items.map(i => `<div class="row"><span class="lbl">${esc(i[0])}</span><div class="bar ${i[2] || ''}" style="width:${i[1] / max * 60}%"></div><b>${i[1]}</b></div>`).join('') : '<p class="muted">Belum ada data</p>';
}
function renderDash() {
  const qc = rows.filter(r => r.qc), mk = rows.filter(r => r.mk);
  const lulus = qc.filter(r => r.qc.kesimpulan === 'LULUS').length, normal = mk.filter(r => mkStatus(r.mk) === 'NORMAL').length;
  const st = [['Total QC', qc.length], ['Total Makroskopis', mk.length], ['Total Lulus', lulus], ['Total Tidak Lulus', qc.length - lulus], ['Produk Normal', normal], ['Produk Tidak Normal', mk.length - normal]];
  $('stats').innerHTML = st.map(s => `<div class="stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  const bln = {}; rows.forEach(r => { const m = String(r.tanggal).slice(0, 7); if (m) bln[m] = (bln[m] || 0) + 1; });
  bars('ch1', Object.keys(bln).sort().slice(-6).map(m => [m, bln[m]]));
  bars('ch2', [['Lulus', lulus, 'g'], ['Tidak Lulus', qc.length - lulus]]);
  bars('ch3', [['Normal', normal, 'g'], ['Tidak Normal', mk.length - normal]]);
}
function filtered() {
  const q = $('fSearch').value.toLowerCase(), f = $('fFrom').value, t = $('fTo').value, m = $('fMonth').value;
  return rows.filter(r => {
    if (f && r.tanggal < f) return false; if (t && r.tanggal > t) return false; if (m && r.tanggal.slice(0, 7) !== m) return false;
    const hay = [r.noKantong, r.tanggal, tgl(r.tanggal), r.komponen, r.mk && r.mk.golongan, r.mk && r.mk.pemeriksa, r.qc && r.qc.kesimpulan].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
}
function renderTable() {
  const list = filtered();
  $('dataTable').querySelector('tbody').innerHTML = list.length ? list.map((r, i) => {
    const q = r.qc, m = r.mk, ms = mkStatus(m);
    return `<tr><td>${i + 1}</td><td>${tgl(r.tanggal)}</td><td>${esc(r.noKantong)}</td><td>${esc(r.komponen)}</td>
    <td>${m ? esc(m.golongan) + (m.rhesus === 'Positif' ? '+' : '-') : '-'}</td><td>${q ? num(q.hemolisis) + '%' : '-'}</td>
    <td class="${q ? (q.kesimpulan === 'LULUS' ? 'ok' : 'bad') : ''}"><b>${q ? q.kesimpulan : '-'}</b></td>
    <td class="${ms === 'NORMAL' ? 'ok' : 'bad'}">${ms || '-'}</td><td>${m ? esc(m.keterangan) : '-'}</td><td>${m ? esc(m.pemeriksa) : '-'}</td>
    <td class="act"><button class="btn sm ghost" data-a="view" data-k="${esc(r.noKantong)}">Lihat</button><button class="btn sm ghost" data-a="edit" data-k="${esc(r.noKantong)}">Edit</button>
    <button class="btn sm danger" data-a="del" data-k="${esc(r.noKantong)}">Hapus</button><button class="btn sm ghost" data-a="print" data-k="${esc(r.noKantong)}">Print</button></td></tr>`;
  }).join('') : '<tr><td colspan="11" class="muted">Belum ada data</td></tr>';
}
['fSearch','fFrom','fTo','fMonth'].forEach(i => $(i).oninput = renderTable);
$('fClear').onclick = () => { ['fSearch','fFrom','fTo','fMonth'].forEach(i => $(i).value = ''); renderTable(); };
$('dataTable').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  const r = rows.find(x => x.noKantong === b.dataset.k); if (!r) return;
  if (b.dataset.a === 'view') showModal(`<div class="rep">${detailHTML(r)}</div>`, [['Tutup', 'ghost']]);
  if (b.dataset.a === 'print') doPrint(detailHTML(r));
  if (b.dataset.a === 'edit') showModal(`<h3>Edit ${esc(r.noKantong)}</h3><p>Pilih data yang akan diedit.</p>`,
    [['Batal', 'ghost'], ['Edit QC', '', () => r.qc ? fillQC(r.qc) : (resetQC(), $('qcNoKantong').value = r.noKantong, go('qc'))],
     ['Edit Makroskopis', '', () => r.mk ? fillMK(r.mk) : (resetMK(), $('mkNoKantong').value = r.noKantong, go('mk'))]]);
  if (b.dataset.a === 'del') showModal(`<h3>Hapus ${esc(r.noKantong)}?</h3><p>Data QC dan Makroskopis untuk No Kantong ini akan dihapus.</p>`,
    [['Batal', 'ghost'], ['Hapus', 'danger', async () => {
      if (r.qc) await api('deleteQCData', { no: r.qc.no }); if (r.mk) await api('deleteMakroskopisData', { no: r.mk.no });
      toast('Data dihapus'); load(); }]]);
};

// ---------- laporan ----------
const head = periode => `<h2>UDD PMI KOTA BANDA ACEH</h2><h3>HASIL PEMERIKSAAN QC PRODUK DARAH<br>DAN PEMERIKSAAN MAKROSKOPIS</h3>${periode ? `<p style="text-align:center;font-size:12px">Periode: ${periode}</p>` : ''}<hr>`;
const sign = `<div class="sign"><div>Tanggal cetak: ${tgl(today())}</div><div style="text-align:center">Pemeriksa<br>${cfg.penanggungJawabMutu ? cfg.penanggungJawabMutu : ''}<br>( .............................. )</div></div>`;
function detailHTML(r) {
  const q = r.qc, m = r.mk, ms = mkStatus(m), kv = (a, b) => `<tr><th style="width:38%">${a}</th><td>${b}</td></tr>`;
  return `<div class="rep pb">${head('')}
  <h4>A. IDENTITAS PRODUK</h4><table>${kv('No Kantong', esc(r.noKantong))}${kv('Tanggal Pemeriksaan', tgl(r.tanggal))}${kv('Komponen Darah', esc(r.komponen))}
  ${m ? kv('Jenis Kantong', esc(m.jenisKantong)) + kv('Golongan Darah', esc(m.golongan)) + kv('Rhesus', esc(m.rhesus)) + kv('Tanggal Pembuatan', tgl(m.tglBuat)) + kv('Tanggal Kadaluarsa', tgl(m.tglExp)) : ''}</table>
  <h4>B. PEMERIKSAAN MAKROSKOPIS</h4>${m ? `<table>${kv('Penimbangan', num(m.penimbangan) + ' g')}${kv('Mean Penimbangan', num(m.meanPenimbangan) + ' g')}${kv('Keterangan', esc(m.keterangan))}${kv('Hemolisis Makroskopis', esc(m.hemolisisMak))}${kv('Mean Hemolisis Makroskopis', num(m.meanHemMak))}${kv('Pemeriksa', esc(m.pemeriksa))}</table>` : '<p>Data pemeriksaan makroskopis belum tersedia.</p>'}
  <h4>C. HASIL QC HEMOLISIS</h4>${q ? `<table>${kv('Nilai Hb', num(q.hb) + ' g/dL')}${kv('Ht', num(q.hct) + ' %')}${kv('Hb Low', num(q.hbLow) + ' g/dL')}${kv('Nilai Hemolisis (%)', num(q.hemolisis) + ' %')}${kv('Standar', '&le; ' + num(q.standar) + ' %')}${kv('Kesimpulan', '<b>' + q.kesimpulan + '</b>')}</table>` : '<p>Data QC Hemolisis belum tersedia.</p>'}
  <h4>D. KESIMPULAN</h4>${q ? `<div class="big">${q.kesimpulan}</div>` : ''}
  ${ms ? `<p><b>Hasil Makroskopis: ${ms}</b>${m.keterangan && m.keterangan !== 'Normal' ? ' &mdash; ' + esc(m.keterangan) : ''}</p>` : ''}${sign}</div>`;
}
function rekapHTML(d, periode) {
  const s = d.summary;
  const body = d.rows.map((r, i) => { const q = r.qc, m = r.mk;
    return `<tr><td>${i + 1}</td><td>${tgl(r.tanggal)}</td><td>${esc(r.komponen)}</td><td>${esc(r.noKantong)}</td><td>${q ? num(q.hb) : '-'}</td><td>${q ? num(q.hct) : '-'}</td><td>${q ? num(q.hbLow) : '-'}</td><td>${q ? num(q.hemolisis) : '-'}</td><td>${q ? q.kesimpulan : '-'}</td><td>${mkStatus(m) || '-'}</td><td>${m ? esc(m.keterangan) : '-'}</td><td>${m ? esc(m.pemeriksa) : '-'}</td></tr>`; }).join('');
  return `<div class="rep">${head(periode)}<table><thead><tr><th>No</th><th>Tanggal</th><th>Komponen</th><th>No Kantong</th><th>Hb</th><th>Hct</th><th>Hb Low</th><th>Hemolisis (%)</th><th>QC</th><th>Makroskopis</th><th>Keterangan</th><th>Pemeriksa</th></tr></thead>
  <tbody>${body || '<tr><td colspan="12">Tidak ada data pada periode ini.</td></tr>'}</tbody></table>
  <table style="width:auto"><tr><th>TOTAL PEMERIKSAAN</th><td>${s.total}</td></tr><tr><th>TOTAL LULUS</th><td>${s.lulus}</td></tr><tr><th>TOTAL TIDAK LULUS</th><td>${s.tidakLulus}</td></tr><tr><th>RATA-RATA HEMOLISIS</th><td>${num(s.rataHemolisis)} %</td></tr></table>${sign}</div>`;
}
function reportFilter() { return { from: $('rFrom').value, to: $('rTo').value, month: $('rMonth').value, komponen: $('rKomponen').value, noKantong: $('rNoKantong').value, pemeriksa: $('rPemeriksa').value }; }
function periodeText(f) { return f.month ? f.month : (f.from || f.to) ? `${tgl(f.from)} &ndash; ${tgl(f.to)}` : 'Semua periode'; }
async function buildReport() { const f = reportFilter(); lastReport = await api('getReportData', f); lastReport.f = f; $('preview').innerHTML = rekapHTML(lastReport, periodeText(f)); return lastReport; }
$('rShow').onclick = buildReport;
$('rPrint').onclick = async () => { const d = await buildReport(); doPrint(rekapHTML(d, periodeText(d.f))); };
$('rPrintDetail').onclick = async () => {
  const d = await buildReport(); if (!d.rows.length) return toast('Tidak ada data');
  doPrint(d.rows.map(detailHTML).join(''));
};
function doPrint(html) {
  $('pageStyle').textContent = `@page{size:A4 ${$('rOrient').value};margin:12mm}`;
  $('printArea').innerHTML = html; window.print();
}

// ---------- pengaturan ----------
$('sSave').onclick = () => {
  const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
  cfg = { url: $('sUrl').value.trim(), standar: parseFloat($('sStandar').value) || 0.8, pemeriksa: lines('sPemeriksa'), jenis: lines('sJenis'), penanggungJawabMutu: lines('sPenanggung') };
  localStorage.setItem('cfg', JSON.stringify(cfg)); fillSelects(); hitungQC(); toast('Pengaturan tersimpan'); load();
};

// ---------- start ----------
fillSelects(); resetQC(); resetMK(); load().catch(() => {});
