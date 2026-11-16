(function () {
  const translations = {
    en: {
      'adminLogin.tagline': 'Administrator access',
      'adminLogin.title': 'Admin sign in',
      'adminLogin.username': 'Username',
      'adminLogin.password': 'Password',
      'adminLogin.submit': 'Sign in',
      'adminLogin.babyLink': 'Baby login',
      'error.invalid': 'Invalid credentials.',
      'error.network': 'Connection failed. Try again.'
    },
    ar: {
      'adminLogin.tagline': 'دخول المشرف',
      'adminLogin.title': 'تسجيل دخول المشرف',
      'adminLogin.username': 'اسم المستخدم',
      'adminLogin.password': 'كلمة المرور',
      'adminLogin.submit': 'دخول',
      'adminLogin.babyLink': 'دخول الأم',
      'error.invalid': 'بيانات الدخول غير صحيحة.',
      'error.network': 'فشل الاتصال. حاولي مرة أخرى.'
    }
  };

  const form = document.getElementById('adminLoginForm');
  const errorEl = document.getElementById('adminLoginError');
  const usernameInput = document.getElementById('adminUsername');
  const passwordInput = document.getElementById('adminPassword');
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

  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isPassword = target.getAttribute('type') === 'password';
      target.setAttribute('type', isPassword ? 'text' : 'password');
      btn.querySelector('.eye-icon').textContent = isPassword ? '🙈' : '👁';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });

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
      if (data.role !== 'admin') {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        errorEl.textContent = translations[lang]['error.invalid'];
        return;
      }
      window.location.href = '/dashboard';
    } catch {
      errorEl.textContent = translations[lang]['error.network'];
    } finally {
      submitBtn.disabled = false;
    }
  });

  applyLang(lang);
})();
