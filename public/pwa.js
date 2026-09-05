(() => {
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  const syncInstallButtons = () => {
    document.querySelectorAll('[data-install-pwa]').forEach(btn => {
      const showIOSHint = isIOS() && !isStandalone();
      btn.hidden = isStandalone() || (!deferredPrompt && !showIOSHint);
      btn.dataset.iosInstall = showIOSHint ? '1' : '0';
    });
  };

  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => reg.update()).catch(() => {});
    });
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    syncInstallButtons();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    syncInstallButtons();
  });

  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => window.scrollTo({ left: 0, top: window.scrollY, behavior: 'auto' }));
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-install-pwa]');
    if (!button) return;
    event.preventDefault();

    if (button.dataset.iosInstall === '1') {
      alert('На iPhone/iPad: відкрий меню «Поділитися» у Safari та обери «На початковий екран».');
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    syncInstallButtons();
  });

  new MutationObserver(syncInstallButtons).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', syncInstallButtons);
})();
