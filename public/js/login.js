(function () {
  const translations = {
    en: {
      'login.tagline': 'Gentle care, softly tracked.',
      'login.welcome': 'Welcome back, Marina',
      'login.username': 'Username',
      'login.password': 'Password',
      'login.submit': 'Sign in',
      'login.adminLink': 'Admin access',
      'error.invalid': 'Invalid username or password.',
      'error.network': 'Connection failed. Try again.'
    },
    ar: {
      'login.tagline': 'عناية لطيفة، متابعة هادئة.',
      'login.welcome': 'أهلاً بعودتك، مارينا',
      'login.username': 'اسم المستخدم',
      'login.password': 'كلمة المرور',
      'login.submit': 'دخول',
      'login.adminLink': 'دخول المشرف',
      'error.invalid': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
      'error.network': 'فشل الاتصال. حاولي مرة أخرى.'
    }
  };

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const submitBtn = form.querySelector('button[type="submit"]');
  const langButtons = document.querySelectorAll('.lang-btn');

  let lang = localStorage.getItem('evanoLang') || 'en';

  function applyLang(next) {
    lang = next;
    localStorage.setItem('evanoLang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang][key]) el.textContent = translations[lang][key];
    });
    langButtons.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    errorEl.textContent = '';
  }

  langButtons.forEach(btn => btn.addEventListener('click', () => applyLang(btn.dataset.lang)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      errorEl.textContent = translations[lang]['error.invalid'];
      return;
    }
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        errorEl.textContent = translations[lang]['error.invalid'];
        return;
      }
      const data = await res.json();
      if (data.role !== 'baby') {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        errorEl.textContent = translations[lang]['error.invalid'];
        return;
      }
      window.location.href = '/index';
    } catch {
      errorEl.textContent = translations[lang]['error.network'];
    } finally {
      submitBtn.disabled = false;
    }
  });

  applyLang(lang);
})();
