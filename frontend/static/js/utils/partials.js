(function () {
  function markActiveNav(container, target) {
    if (!target) return;
    const links = container.querySelectorAll('[data-nav-target]');
    links.forEach((link) => {
      const isActive = link.dataset.navTarget === target;
      link.classList.toggle('active', isActive);
      if (isActive && link.classList.contains('dropdown-item')) {
        const toggle = link.closest('.dropdown')?.querySelector('.dropdown-toggle');
        toggle?.classList.add('active');
      }
    });
  }

  async function loadPartials() {
    const targets = document.querySelectorAll('[data-include]');
    await Promise.all(
      Array.from(targets).map(async (el) => {
        const file = el.getAttribute('data-include');
        if (!file) return;
        try {
          const response = await fetch(file);
          if (!response.ok) throw new Error('No se pudo cargar ' + file);
          const html = await response.text();
          el.innerHTML = html;
          if (file.includes('header')) {
            if (typeof attachLogoutHandler === 'function') {
              attachLogoutHandler();
            }
            markActiveNav(el, el.dataset.navActive);
          }
        } catch (err) {
          console.error('Error cargando parcial', file, err);
        }
      })
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPartials);
  } else {
    loadPartials();
  }
})();
