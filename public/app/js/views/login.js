/* ============================================================
   views/login.js — MediLingua login (overlay)
   ============================================================ */
(function () {
  const U = window.U;
  const API = window.API;
  const C = window.C;
  const Router = window.Router;

  function maybeRedirect() {
    if (API.isLoggedIn()) {
      Router.navigate('/dashboard');
      return true;
    }
    return false;
  }

  function render(container) {
    if (maybeRedirect()) return;

    const view = U.el('div', { class: 'login-view' }, [
      U.el('div', { class: 'login-aurora' }),
      U.el('div', { class: 'login-grid' }),
      U.el('div', { class: 'login-card' }, [
        U.el('div', { class: 'login-brand' }, [
          U.el('img', { src: '/app/assets/logo.svg', class: 'logo', alt: 'MediLingua logo' }),
          U.el('h1', { text: 'MediLingua' }),
          U.el('p', { text: 'Personalized Language Learning for Medical Professionals' })
        ]),
        buildForm()
      ])
    ]);
    container.appendChild(view);

    function buildForm() {
      const form = U.el('form', { class: 'col', style: { gap: 'var(--space-4)' }, onsubmit: (e) => { e.preventDefault(); submit(); } });
      const userInput = U.el('input', { class: 'input', name: 'username', placeholder: 'admin', autocomplete: 'username' });
      const passInput = U.el('input', { class: 'input', type: 'password', name: 'password', placeholder: 'admin123', autocomplete: 'current-password' });
      const submitBtn = U.el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, [
        U.icon('logout', 18, 2), U.el('span', { text: 'Sign in' })
      ]);

      form.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'field-label', text: 'Username' }), userInput
      ]));
      form.appendChild(U.el('div', { class: 'field' }, [
        U.el('label', { class: 'field-label', text: 'Password' }), passInput
      ]));
      form.appendChild(submitBtn);
      form.appendChild(U.el('div', { class: 'row-between' }, [
        U.el('span', { class: 'text-xs text-muted', text: 'Demo: admin / admin123' }),
        U.el('a', { class: 'link text-sm', onClick: () => { userInput.value = 'admin'; passInput.value = 'admin123'; } }, [U.el('span', { text: 'Use demo access' })])
      ]));

      let loading = false;
      async function submit() {
        if (loading) return;
        const username = userInput.value.trim() || 'admin';
        const password = passInput.value || 'admin123';
        loading = true;
        submitBtn.disabled = true;
        U.clear(submitBtn);
        submitBtn.appendChild(C.spinner('on-primary'));
        submitBtn.appendChild(U.el('span', { text: 'Signing in…' }));
        try {
          const res = await API.post('/auth/login', { username, password });
          if (res.access_token) {
            API.setToken(res.access_token);
            API.setUser(res.user || { username, role: 'admin' });
            C.toastSuccess('Welcome to MediLingua, ' + (res.user?.username || username));
            Router.navigate('/dashboard');
          } else {
            throw { message: 'No access token returned' };
          }
        } catch (e) {
          C.toastError(e.message || 'Login failed. Try admin / admin123.');
        } finally {
          loading = false;
          submitBtn.disabled = false;
          U.clear(submitBtn);
          submitBtn.appendChild(U.icon('logout', 18, 2));
          submitBtn.appendChild(U.el('span', { text: 'Sign in' }));
        }
      }
      return form;
    }

    return { dispose() {} };
  }

  window.Views = window.Views || {};
  window.Views['/login'] = { title: 'Sign in', render };
})();
