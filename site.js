(() => {
  const root = document.documentElement;
  const queryLang = new URL(location.href).searchParams.get('lang');
  let savedLang;
  try { savedLang = localStorage.getItem('portfolio-language'); } catch {}
  function setLanguage(lang) {
    root.dataset.lang = root.lang = lang;
    try { localStorage.setItem('portfolio-language', lang); } catch {}
    const currentUrl = new URL(location.href);
    currentUrl.searchParams.set('lang', lang);
    try { history.replaceState(null, '', currentUrl); } catch {}
    document.querySelectorAll('[data-set-lang]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.setLang === lang)));
    document.querySelectorAll('a[href]').forEach(link => {
      const raw = link.getAttribute('href');
      if (!/^[a-z-]+\.html(?:[?#].*)?$/.test(raw)) return;
      const url = new URL(raw, location.href);
      url.searchParams.set('lang', lang);
      link.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
    });
    document.querySelectorAll('[data-download]').forEach(link =>
      link.href = 'downloads/' + link.dataset.download + '-' + lang + '.pdf');
    document.dispatchEvent(new Event('portfolio-language'));
  }
  document.querySelectorAll('[data-set-lang]').forEach(button =>
    button.addEventListener('click', () => setLanguage(button.dataset.setLang)));
  setLanguage((queryLang === 'en' || queryLang === 'ko' ? queryLang : savedLang) === 'en' ? 'en' : 'ko');

  const images = Array.from(document.querySelectorAll('.reading-images img'));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (images.length) {
    let scheduled = false;
    function updateImages() {
      for (const img of images) {
        const rect = img.parentElement.getBoundingClientRect();
        const delta = (innerHeight / 2 - (rect.top + rect.height / 2)) * .027;
        img.style.setProperty('--offset', Math.max(-12, Math.min(12, delta)) + 'px');
      }
      scheduled = false;
    }
    function schedule() {
      if (scheduled || motion.matches) return;
      scheduled = true;
      requestAnimationFrame(updateImages);
    }
    addEventListener('scroll', schedule, {passive: true});
    addEventListener('resize', schedule);
    addEventListener('load', schedule);
    schedule();
  }
})();
