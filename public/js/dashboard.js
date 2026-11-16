(function () {
  const t = {
    en: {
      'nav.logout': 'Logout',
      'admin.greeting': 'Administrator overview',
      'admin.title': "Evano's day",
      'admin.sub': "Read-only live view of Marina's entries.",
      'stat.sleep': 'Sleep today',
      'stat.feeds': 'Feeds today',
      'stat.diapers': 'Diapers today',
      'admin.medTitle': 'Medication monitoring',
      'admin.lastDate': 'Last date:',
      'admin.lastTime': 'Last time:',
      'admin.resetToday': 'Reset today',
      'admin.historyTitle': 'Medication history',
      'admin.empty': 'No records yet.',
      'med.iron': 'Iron',
      'med.calcium': 'Calcium',
      'table.med': 'Medication',
      'table.status': 'Status',
      'table.date': 'Date',
      'table.time': 'Time',
      'status.taken': 'Taken',
      'status.reset': 'Reset',
      'status.corrected': 'Corrected',
      'status.reset_marker': 'Reset marker',
      'status.notRecorded': 'Not recorded',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Confirm',
      'confirm.reset': 'Reset the recorded {med} entry for today? This preserves history but marks today as not recorded.',
      'toast.reset': 'Reset — you can log again tomorrow.',
      'toast.error': 'Something went wrong.',
      'toast.noRecord': 'No record for today.'
    },
    ar: {
      'nav.logout': 'تسجيل الخروج',
      'admin.greeting': 'نظرة المشرف',
      'admin.title': 'يوم إيفانو',
      'admin.sub': 'عرض حي للقراءة فقط لما تدخله مارينا.',
      'stat.sleep': 'نوم اليوم',
      'stat.feeds': 'رضعات اليوم',
      'stat.diapers': 'حفاضات اليوم',
      'admin.medTitle': 'مراقبة الأدوية',
      'admin.lastDate': 'آخر تاريخ:',
      'admin.lastTime': 'آخر وقت:',
      'admin.resetToday': 'إعادة تعيين اليوم',
      'admin.historyTitle': 'سجل الأدوية',
      'admin.empty': 'لا توجد سجلات بعد.',
      'med.iron': 'حديد',
      'med.calcium': 'كالسيوم',
      'table.med': 'الدواء',
      'table.status': 'الحالة',
      'table.date': 'التاريخ',
      'table.time': 'الوقت',
      'status.taken': 'تم',
      'status.reset': 'أُعيد تعيينه',
      'status.corrected': 'مُصحح',
      'status.reset_marker': 'علامة إعادة تعيين',
      'status.notRecorded': 'لم يُسجل',
      'dialog.cancel': 'إلغاء',
      'dialog.confirm': 'تأكيد',
      'confirm.reset': 'إعادة تعيين تسجيل {med} لليوم؟ سيتم الاحتفاظ بالسجل ولكن سيُعتبر اليوم غير مسجل.',
      'toast.reset': 'تمت إعادة التعيين — يمكنك التسجيل غدًا.',
      'toast.error': 'حدث خطأ.',
      'toast.noRecord': 'لا يوجد سجل لهذا اليوم.'
    }
  };

  let lang = localStorage.getItem('evanoLang') || 'en';
  let data = { today: { sleep: [], feeding: [], diaper: [], medication: [] }, history: { medication: [] } };

  const toastEl = document.getElementById('toast');
  const resetDialog = document.getElementById('resetDialog');
  const resetText = document.getElementById('resetText');
  const resetOk = document.getElementById('resetOk');
  const resetCancel = document.getElementById('resetCancel');
  let resetResolver = null;

  function showToast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function askReset(med) {
    const medLabel = t[lang]['med.' + med] || med;
    resetText.textContent = t[lang]['confirm.reset'].replace('{med}', medLabel);
    resetDialog.showModal();
    return new Promise(resolve => { resetResolver = resolve; });
  }

  resetOk.addEventListener('click', () => { resetDialog.close(); resetResolver && resetResolver(true); resetResolver = null; });
  resetCancel.addEventListener('click', () => { resetDialog.close(); resetResolver && resetResolver(false); resetResolver = null; });

  function applyLang(next) {
    lang = next;
    localStorage.setItem('evanoLang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[lang][key]) el.textContent = t[lang][key];
    });
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    render();
  }

  document.querySelectorAll('.lang-btn').forEach(btn =>
    btn.addEventListener('click', () => applyLang(btn.dataset.lang))
  );

  async function api(path, options) {
    const res = await fetch(path, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, options || {}));
    if (res.status === 401) { window.location.href = '/login-dashboard'; throw new Error('auth'); }
    if (res.status === 403) { window.location.href = '/login-dashboard'; throw new Error('role'); }
    return res;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try { return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB'); }
    catch { return '—'; }
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try { return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  }

  function render() {
    const sleepMin = data.today.sleep.reduce((s, x) => s + (x.minutes || 0), 0);
    document.getElementById('adminSleep').textContent = sleepMin + ' min';
    document.getElementById('adminFeeds').textContent = data.today.feeding.length;
    document.getElementById('adminDiapers').textContent = data.today.diaper.length;

    ['iron', 'calcium'].forEach(med => {
      const todayTaken = data.today.medication.find(m => m.medication === med && m.status === 'taken');
      const allForMed = data.history.medication.filter(m => m.medication === med);
      const last = allForMed[0];
      const statusEl = document.getElementById(med + 'Status');
      const dateEl = document.getElementById(med + 'Date');
      const timeEl = document.getElementById(med + 'Time');
      if (todayTaken) {
        statusEl.textContent = t[lang]['status.taken'];
        statusEl.setAttribute('data-taken', 'true');
      } else {
        statusEl.textContent = t[lang]['status.notRecorded'];
        statusEl.removeAttribute('data-taken');
      }
      dateEl.textContent = last ? fmtDate(last.recordedAt) : '—';
      timeEl.textContent = last ? fmtTime(last.recordedAt) : '—';
    });

    const body = document.getElementById('historyBody');
    const empty = document.getElementById('historyEmpty');
    const rows = data.history.medication.filter(m => m.status !== 'reset_marker').slice(0, 30);
    if (!rows.length) {
      body.innerHTML = '';
      empty.classList.add('show');
      return;
    }
    empty.classList.remove('show');
    body.innerHTML = rows.map(r => {
      const medName = t[lang]['med.' + (r.medication || 'iron')] || r.medication;
      const statusLabel = t[lang]['status.' + r.status] || r.status;
      const cls = r.status === 'taken' ? 'taken' : r.status === 'reset' ? 'reset' : r.status === 'corrected' ? 'corrected' : '';
      return `<tr>
        <td>${medName}</td>
        <td><span class="status-pill ${cls}">${statusLabel}</span></td>
        <td>${fmtDate(r.recordedAt)}</td>
        <td>${fmtTime(r.recordedAt)}</td>
      </tr>`;
    }).join('');
  }

  async function loadOverview() {
    const res = await api('/api/admin/overview');
    if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
    data = await res.json();
    render();
  }

  document.querySelectorAll('.btn-reset[data-reset]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const med = btn.dataset.reset;
      if (!med || !['iron', 'calcium'].includes(med)) return;
      const ok = await askReset(med);
      if (!ok) return;
      btn.disabled = true;
      try {
        const res = await api('/api/admin/medication/reset', {
          method: 'POST',
          body: JSON.stringify({ medication: med })
        });
        if (res.status === 404) { showToast(t[lang]['toast.noRecord'], true); return; }
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.reset']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
      finally { btn.disabled = false; }
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/login-dashboard';
  });

  api('/api/auth/session').then(res => {
    if (!res.ok) { window.location.href = '/login-dashboard'; return; }
    return res.json().then(s => {
      if (s.role !== 'admin') { window.location.href = '/login'; return; }
      applyLang(lang);
      loadOverview();
    });
  }).catch(() => {});
})();
