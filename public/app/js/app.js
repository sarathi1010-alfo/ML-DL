/* ============================================================
   app.js — MediLingua bootstrap: theme toggle, sidebar, topbar,
   status bar, global state, router wiring, init.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const Router = window.Router;

  // Single sidebar section per spec: 9 nav items + login (hidden when authed)
  const NAV = [
    { section: 'Learning Suite', items: [
      { path: '/dashboard',   label: 'Dashboard',            icon: 'dashboard' },
      { path: '/proficiency', label: 'Proficiency Assessment', icon: 'gauge' },
      { path: '/tracker',     label: 'Learning Tracker',     icon: 'tracker' },
      { path: '/analyzer',    label: 'Communication Analyzer', icon: 'analyzer' },
      { path: '/scenario',    label: 'Scenario Practice',    icon: 'scenario' },
      { path: '/studio',      label: 'Content Studio',       icon: 'studio' },
      { path: '/tutor',       label: 'AI Tutor',             icon: 'tutor' },
    ]},
    { section: 'System', items: [
      { path: '/monitoring',  label: 'Model Monitoring',     icon: 'monitor' },
      { path: '/settings',    label: 'Settings',             icon: 'settings' },
    ]}
  ];

  /* ---------- Theme ---------- */
  function getTheme() {
    return localStorage.getItem('medilingua_theme') || 'dark';
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('medilingua_theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      const icons = btn.querySelectorAll('svg.icon');
      icons.forEach((ic, i) => {
        const isSun = i === 0;
        ic.style.display = (theme === 'dark' && isSun) || (theme === 'light' && !isSun) ? '' : 'none';
      });
    });
    setTimeout(() => window.Charts && Charts.rerenderAll(), 80);
  }
  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }
  window.App = window.App || {};
  window.App.getTheme = getTheme;
  window.App.setTheme = setTheme;
  window.App.toggleTheme = toggleTheme;

  /* ---------- Build sidebar ---------- */
  function buildSidebar() {
    const sidebar = U.el('aside', { class: 'sidebar' });
    // Brand
    sidebar.appendChild(U.el('div', { class: 'brand' }, [
      U.el('img', { src: '/app/assets/logo.svg', class: 'brand-logo', alt: 'MediLingua logo' }),
      U.el('div', { class: 'brand-text' }, [
        U.el('div', { class: 'brand-name', text: 'MediLingua' }),
        U.el('div', { class: 'brand-sub', text: 'Medical Language Learning' })
      ])
    ]));

    // Nav
    const nav = U.el('nav', { class: 'nav-section' });
    NAV.forEach(group => {
      nav.appendChild(U.el('div', { class: 'nav-label', text: group.section }));
      group.items.forEach(item => {
        const node = U.el('a', {
          class: 'nav-item',
          href: '#' + item.path,
          dataset: { route: item.path }
        }, [
          U.icon(item.icon, 18, 2),
          U.el('span', { class: 'nav-text', text: item.label })
        ]);
        if (item.badge) node.appendChild(U.el('span', { class: 'nav-badge', text: item.badge }));
        nav.appendChild(node);
      });
    });
    sidebar.appendChild(nav);

    // User mini
    const user = API.getUser();
    const foot = U.el('div', { class: 'sidebar-foot' }, [
      U.el('div', { class: 'user-mini', onClick: () => Router.navigate('/settings') }, [
        U.el('div', { class: 'avatar accent sm', text: (user && (user.username || user.email || 'U')[0].toUpperCase()) || 'U' }),
        U.el('div', { style: { flex: '1', minWidth: '0' } }, [
          U.el('div', { style: { fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, text: (user && user.username) || 'Demo Learner' }),
          U.el('div', { class: 'text-xs text-muted', text: (user && user.role) || 'demo' })
        ]),
        U.icon('chevronRight', 16, 2)
      ])
    ]);
    sidebar.appendChild(foot);

    return sidebar;
  }

  /* ---------- Build topbar ---------- */
  function buildTopbar() {
    const topbar = U.el('header', { class: 'topbar' });
    const ham = U.el('div', { class: 'hamburger', onClick: toggleSidebar }, [U.icon('menu', 20)]);
    topbar.appendChild(ham);
    topbar.appendChild(U.el('div', { class: 'page-title', text: 'Dashboard' }));

    const search = U.el('div', { class: 'topbar-search' }, [
      U.el('div', { class: 'input-group' }, [
        U.el('div', { class: 'lead' }, [U.icon('search', 16, 2)]),
        U.el('input', { class: 'input', type: 'search', placeholder: 'Search modules, terms, scenarios…' })
      ])
    ]);
    topbar.appendChild(search);

    const actions = U.el('div', { class: 'topbar-actions' });

    const themeBtn = U.el('div', { class: 'icon-btn theme-toggle always-show', onClick: toggleTheme, title: 'Toggle theme', dataset: { menu: 'theme' } }, [
      U.icon('sun', 18, 2),
      U.icon('moon', 18, 2)
    ]);
    actions.appendChild(themeBtn);

    const notif = U.el('div', { class: 'icon-btn always-show', title: 'Notifications', dataset: { menu: 'notif' }, onClick: (e) => { e.stopPropagation(); toggleDropdown(notif); } }, [U.icon('bell', 18, 2)]);
    notif.appendChild(U.el('span', { class: 'dot-indicator' }));
    actions.appendChild(notif);

    const userWrap = U.el('div', { class: 'icon-btn always-show', dataset: { menu: 'user' }, onClick: (e) => { e.stopPropagation(); toggleDropdown(userWrap); } }, [
      U.el('div', { class: 'avatar sm', text: (API.getUser() && (API.getUser().username || 'U')[0].toUpperCase()) || 'U' })
    ]);
    actions.appendChild(userWrap);

    topbar.appendChild(actions);

    return topbar;
  }

  function toggleDropdown(host) {
    document.querySelectorAll('.dropdown').forEach(d => { if (d._host !== host) d.remove(); });
    if (host.querySelector('.dropdown')) { host.querySelector('.dropdown').remove(); return; }

    const menu = host.dataset.menu;
    let dropdown;
    if (menu === 'user') dropdown = buildUserDropdown();
    else if (menu === 'notif') dropdown = buildNotifDropdown();
    if (dropdown) {
      dropdown._host = host;
      dropdown.style.position = 'absolute';
      dropdown.style.top = 'calc(100% + 6px)';
      dropdown.style.right = '0';
      host.style.position = 'relative';
      host.appendChild(dropdown);
    }
  }

  function buildUserDropdown() {
    const user = API.getUser();
    const d = U.el('div', { class: 'dropdown', style: { minWidth: '240px' } });
    d.appendChild(U.el('div', { class: 'dropdown-head' }, [
      U.el('div', { style: { fontWeight: 600 }, text: (user && user.username) || 'Demo Learner' }),
      U.el('div', { class: 'text-xs text-muted', text: (user && user.email) || 'demo@medilingua.local' })
    ]));
    const items = [
      { icon: 'user', label: 'Profile', action: () => Router.navigate('/settings') },
      { icon: 'settings', label: 'Settings', action: () => Router.navigate('/settings') },
    ];
    items.forEach(it => {
      d.appendChild(U.el('div', { class: 'dropdown-item', onClick: () => { d.remove(); it.action(); } }, [U.icon(it.icon, 16, 2), it.label]));
    });
    d.appendChild(U.el('div', { class: 'dropdown-foot' }));
    d.appendChild(U.el('div', { class: 'dropdown-item', onClick: () => { d.remove(); signOut(); } }, [
      U.icon('logout', 16, 2), U.el('span', { text: 'Sign out', style: { color: 'var(--danger)' } })
    ]));
    return d;
  }

  function buildNotifDropdown() {
    const d = U.el('div', { class: 'dropdown', style: { minWidth: '300px' } });
    d.appendChild(U.el('div', { class: 'dropdown-head' }, [U.el('div', { style: { fontWeight: 600 }, text: 'Recent activity' })]));
    const events = [
      { icon: 'check', color: 'var(--success)', text: 'All models healthy', time: 'just now' },
      { icon: 'pulse', color: 'var(--accent)', text: 'New study streak: 7 days', time: '2m ago' },
      { icon: 'tutor', color: 'var(--info)', text: 'AI Tutor designed a new path', time: '8m ago' },
      { icon: 'award', color: 'var(--warning)', text: 'Communication score improved 6 pts', time: '1h ago' },
    ];
    events.forEach(e => {
      d.appendChild(U.el('div', { class: 'dropdown-item' }, [
        U.el('div', { style: { width: '28px', height: '28px', borderRadius: '8px', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: e.color } }, [U.icon(e.icon, 14, 2)]),
        U.el('div', { style: { flex: '1', minWidth: '0' } }, [
          U.el('div', { style: { fontSize: '13px' }, text: e.text }),
          U.el('div', { class: 'text-xs text-muted', text: e.time })
        ])
      ]));
    });
    return d;
  }

  function signOut() {
    API.clearAuth();
    C.toastInfo('Signed out.');
    setTimeout(() => Router.navigate('/login'), 200);
  }

  function toggleSidebar() {
    const shell = document.querySelector('.app-shell');
    const backdrop = document.querySelector('.sidebar-backdrop');
    shell.classList.toggle('sidebar-open');
    if (backdrop) backdrop.classList.toggle('show', shell.classList.contains('sidebar-open'));
  }

  /* ---------- Status bar ---------- */
  function buildStatusBar() {
    const bar = U.el('footer', { class: 'statusbar' }, [
      U.el('div', { class: 'status-group' }, [
        U.el('span', { class: 'dot dot-success pulse', id: 'sb-backend-dot' }),
        U.el('span', { id: 'sb-backend', text: 'Backend: connecting…' })
      ]),
      U.el('div', { class: 'status-divider hide-mobile' }),
      U.el('div', { class: 'status-group hide-mobile' }, [
        U.el('span', { class: 'dot dot-info', id: 'sb-llm-dot' }),
        U.el('span', { id: 'sb-llm', text: 'LLM: —' })
      ]),
      U.el('div', { class: 'status-divider hide-mobile' }),
      U.el('div', { class: 'status-group hide-mobile' }, [
        U.el('span', { id: 'sb-models', text: 'Models: —' })
      ]),
      U.el('div', { class: 'status-right' }, [
        U.el('span', { class: 'hide-mobile', id: 'sb-uptime', text: '' }),
        U.el('div', { class: 'status-divider' }),
        U.el('span', { text: 'v1.0.0' })
      ])
    ]);
    return bar;
  }

  async function probeBackend() {
    const result = await API.probeHealth();
    const dot = document.getElementById('sb-backend-dot');
    const txt = document.getElementById('sb-backend');
    const llmDot = document.getElementById('sb-llm-dot');
    const llmTxt = document.getElementById('sb-llm');
    const modelsTxt = document.getElementById('sb-models');
    const uptimeTxt = document.getElementById('sb-uptime');
    if (result.ok) {
      dot.className = 'dot dot-success pulse';
      txt.textContent = 'Backend: connected';
      const d = result.data || {};
      if (d.llm_service) {
        llmDot.className = 'dot dot-success';
        llmTxt.textContent = 'LLM: ' + (d.llm_service === 'connected' ? 'Ready' : d.llm_service);
      } else {
        llmDot.className = 'dot dot-danger';
        llmTxt.textContent = 'LLM: offline';
      }
      if (d.models) {
        const loaded = Object.values(d.models).filter(v => /loaded|ready/.test(String(v))).length;
        const total = Object.keys(d.models).length;
        modelsTxt.textContent = `Models: ${loaded}/${total} ready`;
      }
      if (d.uptime_seconds != null) uptimeTxt.textContent = 'uptime ' + U.fmtUptime(d.uptime_seconds);
    } else {
      dot.className = 'dot dot-danger pulse';
      txt.textContent = 'Backend: offline (demo data)';
      llmDot.className = 'dot dot-warning';
      llmTxt.textContent = 'LLM: simulated';
      modelsTxt.textContent = 'Models: demo';
      uptimeTxt.textContent = '';
    }
  }

  /* ---------- Build shell ---------- */
  function buildShell() {
    const shell = U.el('div', { class: 'app-shell' });
    shell.appendChild(buildSidebar());
    shell.appendChild(buildTopbar());
    const content = U.el('main', { class: 'content' }, [
      U.el('div', { class: 'content-inner', id: 'view' })
    ]);
    shell.appendChild(content);
    shell.appendChild(buildStatusBar());

    const backdrop = U.el('div', { class: 'sidebar-backdrop', onClick: toggleSidebar });
    shell.appendChild(backdrop);

    document.body.appendChild(shell);
  }

  /* ---------- Boot ---------- */
  async function boot() {
    buildShell();
    setTheme(getTheme());

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown') && !e.target.closest('.icon-btn')) {
        document.querySelectorAll('.dropdown').forEach(d => d.remove());
      }
    });

    const views = window.Views || {};
    Object.keys(views).forEach(path => {
      Router.register(path, { path, title: views[path].title, render: views[path].render });
    });

    probeBackend();
    setInterval(probeBackend, 30000);

    Router.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
