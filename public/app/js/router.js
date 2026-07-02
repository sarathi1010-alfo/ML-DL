/* ============================================================
   router.js — hash-based router.
   Routes map path -> { title, render(container) }.
   Exposes window.Router
   ============================================================ */
(function () {
  const Router = {};
  const routes = {};
  let currentView = null;

  Router.register = (path, def) => { routes[path] = def; };
  Router.get = (path) => routes[path];
  Router.list = () => Object.keys(routes);

  function parseHash() {
    let h = (location.hash || '#/dashboard').replace(/^#/, '');
    if (!h.startsWith('/')) h = '/' + h;
    const [path, query] = h.split('?');
    return { path: path || '/dashboard', query: new URLSearchParams(query || '') };
  }

  function navigate(path) {
    if (!path.startsWith('#')) path = '#' + (path.startsWith('/') ? path : '/' + path);
    location.hash = path;
  }

  async function render() {
    const { path } = parseHash();
    const route = routes[path] || routes['/dashboard'];
    const container = document.getElementById('view');
    if (!container) return;

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.route === (route.path || path));
    });

    // Update page title
    const titleEl = document.querySelector('.topbar .page-title');
    if (titleEl) titleEl.textContent = route.title || 'AI Platform';

    // Brief skeleton then render
    window.U.clear(container);
    const skel = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } }, [
      U.el('div', { class: 'skeleton', style: { height: '28px', width: '40%' } }),
      U.el('div', { class: 'grid grid-4' }, [C.skeletonStat(), C.skeletonStat(), C.skeletonStat(), C.skeletonStat()]),
      U.el('div', { class: 'grid grid-2' }, [C.skeletonCard(), C.skeletonCard()])
    ]);
    container.appendChild(skel);

    try {
      // dispose previous view if it has cleanup
      if (currentView && currentView.dispose) {
        try { currentView.dispose(); } catch (e) {}
      }
      const view = await route.render(container);
      currentView = view || null;
    } catch (e) {
      console.error('View render error:', e);
      window.U.clear(container);
      container.appendChild(C.errorState(
        (e && e.message) || 'Failed to render view.',
        () => render()
      ));
    }

    // Close mobile sidebar on nav
    document.querySelector('.app-shell')?.classList.remove('sidebar-open');
    document.querySelector('.sidebar-backdrop')?.classList.remove('show');

    // scroll content to top
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  function start() {
    window.addEventListener('hashchange', render);
    // Initial route
    if (!location.hash) location.hash = '#/dashboard';
    render();
  }

  Router.navigate = navigate;
  Router.start = start;
  Router.parseHash = parseHash;
  Router.current = () => parseHash();

  window.Router = Router;
})();
