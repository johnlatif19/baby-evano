(function () {
  const t = {
    en: {
      'nav.logout': 'Logout',
      'hero.greeting': 'Welcome back,',
      'hero.sub': 'A quiet space to care for Evano today.',
      'baby.line': "Today's gentle rhythm",
      'overview.title': 'Today at a glance',
      'quick.title': 'Quick log',
      'quick.sleep': 'Sleep',
      'quick.feeding': 'Feeding',
      'quick.diaper': 'Diaper',
      'med.title': "Marina's Medication",
      'med.iron': 'Iron',
      'med.calcium': 'Calcium',
      'med.taken': 'Mark as taken',
      'med.correct': 'Correct',
      'med.notRecorded': 'Not recorded',
      'med.recorded': 'Taken',
      'med.corrected': 'Corrected',
      'med.note': 'This section records only what Marina enters. It never prescribes or suggests doses.',
      'oc.sleep': 'Sleep',
      'oc.feeding': 'Feeding',
      'oc.diaper': 'Diaper',
      'oc.empty': 'No entries yet',
      'oc.minutes': 'min',
      'oc.feeds': 'feeds',
      'oc.changes': 'changes',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Confirm',
      'confirm.correct': 'Mark this as corrected and undo the last entry?',
      'toast.saved': 'Saved',
      'toast.corrected': 'Corrected',
      'toast.error': 'Something went wrong. Try again.',
      'prompt.sleep': 'How many minutes did Evano sleep?',
      'prompt.feeding': 'How many ml did Evano drink? (leave blank for nursing)',
      'confirm.diaper': 'Log a diaper change?'
    },
    ar: {
      'nav.logout': 'تسجيل الخروج',
      'hero.greeting': 'أهلاً بعودتك،',
      'hero.sub': 'مساحة هادئة للعناية بإيفانو اليوم.',
      'baby.line': 'إيقاع اليوم اللطيف',
      'overview.title': 'نظرة على اليوم',
      'quick.title': 'تسجيل سريع',
      'quick.sleep': 'نوم',
      'quick.feeding': 'رضاعة',
      'quick.diaper': 'حفاض',
      'med.title': 'أدوية مارينا',
      'med.iron': 'حديد',
      'med.calcium': 'كالسيوم',
      'med.taken': 'تسجيل الكمية',
      'med.correct': 'تصحيح',
      'med.notRecorded': 'لم يُسجل',
      'med.recorded': 'تم',
      'med.corrected': 'مُصحح',
      'med.note': 'هذا القسم يسجل فقط ما تدخله مارينا. لا يصف جرعات ولا يقترح مواعيد.',
      'oc.sleep': 'نوم',
      'oc.feeding': 'رضاعة',
      'oc.diaper': 'حفاض',
      'oc.empty': 'لا توجد سجلات بعد',
      'oc.minutes': 'دقيقة',
      'oc.feeds': 'رضعات',
      'oc.changes': 'تغييرات',
      'dialog.cancel': 'إلغاء',
      'dialog.confirm': 'تأكيد',
      'confirm.correct': 'هل تريدين تصحيح آخر تسجيل وإلغاءه؟',
      'toast.saved': 'تم الحفظ',
      'toast.corrected': 'تم التصحيح',
      'toast.error': 'حدث خطأ. حاولي مرة أخرى.',
      'prompt.sleep': 'كم دقيقة نام إيفانو؟',
      'prompt.feeding': 'كم مل شرب إيفانو؟ (اتركيه فارغًا للرضاعة الطبيعية)',
      'confirm.diaper': 'تسجيل تغيير حفاض؟'
    }
  };

  let lang = localStorage.getItem('evanoLang') || 'en';
  let overview = { sleep: [], feeding: [], diaper: [], medication: [] };

  const toastEl = document.getElementById('toast');
  const dialog = document.getElementById('confirmDialog');
  const confirmText = document.getElementById('confirmText');
  const confirmOk = document.getElementById('confirmOk');
  const confirmCancel = document.getElementById('confirmCancel');
  let dialogResolver = null;

  function showToast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  function askConfirm(message) {
    confirmText.textContent = message;
    dialog.showModal();
    return new Promise(resolve => { dialogResolver = resolve; });
  }

  confirmOk.addEventListener('click', () => { dialog.close(); dialogResolver && dialogResolver(true); dialogResolver = null; });
  confirmCancel.addEventListener('click', () => { dialog.close(); dialogResolver && dialogResolver(false); dialogResolver = null; });

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
    if (res.status === 401) { window.location.href = '/login'; throw new Error('auth'); }
    if (res.status === 403) { window.location.href = '/login'; throw new Error('role'); }
    return res;
  }

  async function loadOverview() {
    const res = await api('/api/baby/overview');
    if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
    overview = await res.json();
    render();
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  function render() {
    const sleepMin = overview.sleep.reduce((s, x) => s + (x.minutes || 0), 0);
    const feedCount = overview.feeding.length;
    const diaperCount = overview.diaper.length;

    document.getElementById('babyStats').innerHTML = `
      <div class="baby-stat"><strong>${sleepMin}</strong><span>${t[lang]['oc.minutes']}</span></div>
      <div class="baby-stat"><strong>${feedCount}</strong><span>${t[lang]['oc.feeds']}</span></div>
      <div class="baby-stat"><strong>${diaperCount}</strong><span>${t[lang]['oc.changes']}</span></div>
    `;

    document.getElementById('overviewGrid').innerHTML = `
      <div class="overview-card">
        <div class="oc-label">${t[lang]['oc.sleep']}</div>
        <div class="oc-value">${sleepMin} ${t[lang]['oc.minutes']}</div>
        ${overview.sleep.length ? '' : `<div class="oc-empty">${t[lang]['oc.empty']}</div>`}
      </div>
      <div class="overview-card">
        <div class="oc-label">${t[lang]['oc.feeding']}</div>
        <div class="oc-value">${feedCount}</div>
        ${overview.feeding.length ? '' : `<div class="oc-empty">${t[lang]['oc.empty']}</div>`}
      </div>
      <div class="overview-card">
        <div class="oc-label">${t[lang]['oc.diaper']}</div>
        <div class="oc-value">${diaperCount}</div>
        ${overview.diaper.length ? '' : `<div class="oc-empty">${t[lang]['oc.empty']}</div>`}
      </div>
    `;

    ['iron', 'calcium'].forEach(med => {
      const card = document.querySelector(`.med-card[data-medication="${med}"]`);
      const statusEl = card.querySelector(`[data-status="${med}"]`);
      const timeEl = card.querySelector(`[data-time="${med}"]`);
      const todayMeds = overview.medication.filter(m => m.medication === med);
      const latest = todayMeds[0];
      if (latest && latest.status === 'taken') {
        card.setAttribute('data-taken', 'true');
        statusEl.setAttribute('data-taken', 'true');
        statusEl.textContent = t[lang]['med.recorded'];
        timeEl.textContent = formatTime(latest.recordedAt);
      } else if (latest && latest.status === 'corrected') {
        card.setAttribute('data-taken', 'false');
        statusEl.removeAttribute('data-taken');
        statusEl.textContent = t[lang]['med.corrected'];
        timeEl.textContent = formatTime(latest.recordedAt);
      } else {
        card.setAttribute('data-taken', 'false');
        statusEl.removeAttribute('data-taken');
        statusEl.textContent = '—';
        timeEl.textContent = t[lang]['med.notRecorded'];
      }
    });
  }

  document.querySelectorAll('[data-action="take"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await api('/api/medication', {
          method: 'POST',
          body: JSON.stringify({ medication: btn.dataset.med })
        });
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.saved']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
      finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('[data-action="correct"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const med = btn.dataset.med;
      const todayMeds = overview.medication.filter(m => m.medication === med && m.status === 'taken');
      if (!todayMeds.length) { showToast(t[lang]['med.notRecorded'], true); return; }
      const ok = await askConfirm(t[lang]['confirm.correct']);
      if (!ok) return;
      btn.disabled = true;
      try {
        const res = await api('/api/medication/correct', {
          method: 'POST',
          body: JSON.stringify({ medication: med, logId: todayMeds[0].id })
        });
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.corrected']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
      finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('[data-log="sleep"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = window.prompt(t[lang]['prompt.sleep']);
      if (input == null) return;
      const minutes = Number(input);
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      try {
        const res = await api('/api/sleep', { method: 'POST', body: JSON.stringify({ minutes }) });
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.saved']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
    });
  });

  document.querySelectorAll('[data-log="feeding"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const input = window.prompt(t[lang]['prompt.feeding']);
      if (input == null) return;
      const amountMl = input.trim() === '' ? 0 : Number(input);
      if (amountMl !== 0 && (!Number.isFinite(amountMl) || amountMl <= 0)) return;
      try {
        const res = await api('/api/feeding', {
          method: 'POST',
          body: JSON.stringify({ type: amountMl > 0 ? 'bottle' : 'breast', amountMl })
        });
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.saved']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
    });
  });

  document.querySelectorAll('[data-log="diaper"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await askConfirm(t[lang]['confirm.diaper']);
      if (!ok) return;
      try {
        const res = await api('/api/diaper', { method: 'POST', body: JSON.stringify({ kind: 'wet' }) });
        if (!res.ok) { showToast(t[lang]['toast.error'], true); return; }
        showToast(t[lang]['toast.saved']);
        await loadOverview();
      } catch { showToast(t[lang]['toast.error'], true); }
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/login';
  });

  api('/api/auth/session').then(res => {
    if (!res.ok) { window.location.href = '/login'; return; }
    return res.json().then(data => {
      if (data.role !== 'baby') { window.location.href = '/login-dashboard'; return; }
      applyLang(lang);
      loadOverview();
    });
  }).catch(() => {});
})();
