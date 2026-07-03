/* ============================================================
   views/settings.js — MediLingua Settings & Profile
   Theme toggle, profile (from /auth/me), API config, clear local
   data, about section.
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;

  async function render(container) {
    U.clear(container);
    const root = U.el('div', { class: 'view-enter', style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' } });
    container.appendChild(root);

    root.appendChild(U.el('div', { class: 'view-header' }, [
      U.el('div', { class: 'view-title-block' }, [
        U.el('div', { class: 'caption', text: 'Account · Preferences' }),
        U.el('div', { class: 'view-title', text: 'Settings' })
      ])
    ]));

    /* ---------- Profile ---------- */
    const profileCard = C.card({});
    profileCard.appendChild(C.cardHead('Profile', { subtitle: 'your MediLingua account' }));
    const profileHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    profileCard.appendChild(profileHost);
    root.appendChild(profileCard);

    profileHost.appendChild(C.loadingBlock('Loading profile…'));
    let user = API.getUser();
    try {
      const me = await API.get('/auth/me');
      if (me && me.username) { user = me; API.setUser(me); }
    } catch (e) { /* fall back to cached user */ }
    U.clear(profileHost);
    profileHost.appendChild(U.el('div', { class: 'row gap-4' }, [
      U.el('div', { class: 'avatar lg accent', text: (user && (user.username || 'U')[0].toUpperCase()) || 'U' }),
      U.el('div', { class: 'col', style: { gap: '2px' } }, [
        U.el('div', { style: { fontSize: 'var(--font-size-lg)', fontWeight: 700 }, text: (user && user.username) || 'Demo Learner' }),
        U.el('div', { class: 'text-sm text-muted', text: (user && user.email) || 'demo@medilingua.local' }),
        U.el('div', { class: 'row gap-2', style: { marginTop: '4px' } }, [
          C.badge((user && user.role) || 'demo', 'accent'),
          user && user.specialty && C.badge(user.specialty, 'success')
        ])
      ])
    ]));

    /* ---------- Appearance ---------- */
    const themeCard = C.card({});
    themeCard.appendChild(C.cardHead('Appearance', { subtitle: 'customize how MediLingua looks' }));
    const themeHost = U.el('div', { style: { marginTop: 'var(--space-3)' } });
    themeCard.appendChild(themeHost);
    root.appendChild(themeCard);

    function renderThemeRow() {
      U.clear(themeHost);
      const theme = (window.App && window.App.getTheme) ? window.App.getTheme() : (document.documentElement.getAttribute('data-theme') || 'dark');
      const toggle = U.el('div', { class: 'toggle', role: 'switch', 'aria-checked': String(theme === 'light'), tabindex: '0' });
      const doToggle = () => {
        if (window.App && window.App.toggleTheme) window.App.toggleTheme();
        else {
          const cur = document.documentElement.getAttribute('data-theme') || 'dark';
          document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
          try { localStorage.setItem('medilingua_theme', cur === 'dark' ? 'light' : 'dark'); } catch (e) {}
        }
        renderThemeRow();
      };
      toggle.addEventListener('click', doToggle);
      toggle.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doToggle(); } });
      themeHost.appendChild(U.el('div', { class: 'settings-row' }, [
        U.el('div', {}, [
          U.el('div', { class: 'sr-label', text: 'Theme' }),
          U.el('div', { class: 'sr-desc', text: 'Switch between dark and light appearance.' })
        ]),
        U.el('div', { class: 'row gap-3' }, [
          U.el('span', { class: 'text-sm text-muted', text: 'Dark' }),
          toggle,
          U.el('span', { class: 'text-sm text-muted', text: 'Light' })
        ])
      ]));

      // Auto-refresh toggle
      const auto = localStorage.getItem('medilingua_autorefresh') !== 'off';
      const autoToggle = U.el('div', { class: 'toggle', role: 'switch', 'aria-checked': String(auto), tabindex: '0' });
      function setAuto(v) {
        localStorage.setItem('medilingua_autorefresh', v ? 'on' : 'off');
        autoToggle.setAttribute('aria-checked', String(v));
      }
      autoToggle.addEventListener('click', () => setAuto(autoToggle.getAttribute('aria-checked') !== 'true'));
      autoToggle.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAuto(autoToggle.getAttribute('aria-checked') !== 'true'); } });
      themeHost.appendChild(U.el('div', { class: 'settings-row' }, [
        U.el('div', {}, [
          U.el('div', { class: 'sr-label', text: 'Auto-refresh monitoring' }),
          U.el('div', { class: 'sr-desc', text: 'Refresh monitoring metrics every 15 seconds.' })
        ]),
        autoToggle
      ]));
    }
    renderThemeRow();

    /* ---------- API config ---------- */
    const apiCard = C.card({});
    apiCard.appendChild(C.cardHead('API Configuration', { subtitle: 'read-only backend details' }));
    apiCard.appendChild(U.el('div', { style: { marginTop: 'var(--space-3)' } }, [
      settingsRow('Base URL', '/papi/v1'),
      settingsRow('Proxy', 'Next.js route handler → FastAPI :8000'),
      settingsRow('Version', 'v1.0.0'),
      settingsRow('Auth Token', API.isLoggedIn() ? 'Bearer ••••••••' : 'Not signed in (demo mode)')
    ]));
    root.appendChild(apiCard);

    /* ---------- Local data ---------- */
    const dataCard = C.card({});
    dataCard.appendChild(C.cardHead('Local Data', { subtitle: 'manage browser-side data' }));
    const clearBtn = U.el('button', { class: 'btn btn-danger' }, [U.icon('trash', 16, 2), 'Clear local data']);
    clearBtn.addEventListener('click', () => {
      C.confirm({
        title: 'Clear local data?',
        message: 'This will sign you out and remove all locally cached preferences. Reload to continue.',
        confirmText: 'Clear & sign out',
        danger: true,
        onConfirm: () => {
          API.clearAuth();
          localStorage.removeItem('medilingua_theme');
          localStorage.removeItem('medilingua_autorefresh');
          C.toastSuccess('Local data cleared.');
          setTimeout(() => location.reload(), 600);
        }
      });
    });
    dataCard.appendChild(U.el('div', { style: { marginTop: 'var(--space-3)' } }, [
      U.el('div', { class: 'text-sm text-muted mb-3', text: 'Removes the auth token and cached preferences from this browser.' }),
      clearBtn
    ]));
    root.appendChild(dataCard);

    /* ---------- About ---------- */
    const aboutCard = C.card({});
    aboutCard.appendChild(C.cardHead('About', { subtitle: 'tech stack & version' }));
    aboutCard.appendChild(U.el('div', { style: { marginTop: 'var(--space-3)' } }, [
      settingsRow('Platform', 'MediLingua — Medical Language Learning'),
      settingsRow('Tagline', 'Personalized Language Learning for Medical Professionals'),
      settingsRow('Version', 'v1.0.0'),
      settingsRow('Frontend', 'HTML5 + CSS3 + Vanilla JavaScript'),
      settingsRow('Backend', 'FastAPI · Python 3.12'),
      settingsRow('Models', 'RandomForest + XGB · Attention-LSTM · spaCy · TinyLlama · GPT-4o-mini · ReAct'),
      settingsRow('LLM Service', 'Node + z-ai-web-dev-sdk (port 3003)')
    ]));
    root.appendChild(aboutCard);

    function settingsRow(label, value) {
      return U.el('div', { class: 'settings-row' }, [
        U.el('div', { class: 'sr-label', text: label }),
        U.el('div', { class: 'text-mono text-sm text-muted', text: value })
      ]);
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/settings'] = { title: 'Settings', render };
})();
