import { supabase, APP_CONFIG } from './supabase-client.js';
import { qs, qsa, toast, roleLabel } from './utils.js';

let cachedProfile = null;

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getProfile(force = false) {
  if (cachedProfile && !force) return cachedProfile;
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  cachedProfile = data;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  cachedProfile = null;
  window.location.href = './index.html';
}

export async function requireAuth(roles = []) {
  const session = await getSession();
  if (!session) {
    window.location.href = './login.html?next=' + encodeURIComponent(window.location.pathname.split('/').pop());
    throw new Error('No autenticado');
  }

  const profile = await getProfile(true);
  if (!profile?.is_active) {
    await signOut();
    throw new Error('Usuario inactivo');
  }

  if (roles.length && !roles.includes(profile.role)) {
    toast(`Tu rol actual es ${roleLabel(profile.role)} y no tiene acceso a esta vista.`, 'warning');
    window.location.href = './index.html';
    throw new Error('Acceso denegado');
  }

  return { session, profile };
}

export async function updateOwnProfile(payload) {
  const user = await getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', user.id);

  if (error) throw error;
  cachedProfile = null;
  return getProfile(true);
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  toast('Contraseña actualizada.', 'success');
}

export async function recoverPassword(email) {
  const redirectTo = `${APP_CONFIG.SITE_URL}/reset-password.html`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function initShell() {
  const navActions = qs('[data-nav-actions]');
  const mobileQuick = qs('[data-mobile-quick]');
  const badge = qs('[data-user-badge]');

  try {
    const session = await getSession();
    if (!session) {
      if (navActions) {
        navActions.innerHTML = `
          <a class="btn btn-ghost" href="./login.html">Ingresar</a>
          <a class="btn btn-primary" href="./login.html#register">Crear cuenta</a>
        `;
      }
      if (mobileQuick) {
        mobileQuick.innerHTML = `
          <a href="./login.html">Ingresar</a>
          <a href="./index.html#catalog">Explorar</a>
        `;
      }
      return null;
    }

    const profile = await getProfile();
    if (!profile?.is_active) {
      await signOut();
      return null;
    }

    const roleActions = [];
    if (['provider', 'provider_pending', 'admin', 'super_admin'].includes(profile.role)) {
      roleActions.push(`<a class="btn btn-ghost" href="./provider.html">Proveedor</a>`);
    }
    if (['admin', 'super_admin'].includes(profile.role)) {
      roleActions.push(`<a class="btn btn-ghost" href="./admin.html">Admin</a>`);
    }

    if (navActions) {
      navActions.innerHTML = `
        ${roleActions.join('')}
        <a class="btn btn-ghost" href="./account.html">Mi cuenta</a>
        <button class="btn btn-primary" data-signout-btn>Cerrar sesión</button>
      `;
    }

    if (mobileQuick) {
      mobileQuick.innerHTML = `
        <a href="./index.html#catalog">Explorar</a>
        <a href="./account.html">Cuenta</a>
        ${['provider', 'provider_pending', 'admin', 'super_admin'].includes(profile.role) ? '<a href="./provider.html">Proveedor</a>' : ''}
        ${['admin', 'super_admin'].includes(profile.role) ? '<a href="./admin.html">Admin</a>' : ''}
      `;
    }

    if (badge) {
      badge.textContent = `${profile.full_name || profile.email} · ${roleLabel(profile.role)}`;
    }

    const signOutBtn = qs('[data-signout-btn]');
    if (signOutBtn) signOutBtn.addEventListener('click', signOut);

    return profile;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function initAuthForms() {
  const loginForm = qs('#login-form');
  const registerForm = qs('#register-form');
  const forgotForm = qs('#forgot-form');
  const changePasswordForm = qs('#reset-password-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = qs('[name="email"]', loginForm).value.trim();
      const password = qs('[name="password"]', loginForm).value.trim();

      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast('Ingreso correcto.', 'success');
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = next ? `./${next}` : './account.html';
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo iniciar sesión.', 'danger');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fullName = qs('[name="full_name"]', registerForm).value.trim();
      const email = qs('[name="email"]', registerForm).value.trim();
      const phone = qs('[name="phone"]', registerForm).value.trim();
      const password = qs('[name="password"]', registerForm).value.trim();
      const password2 = qs('[name="password_confirm"]', registerForm).value.trim();
      const requestedRole = qs('[name="requested_role"]', registerForm).value;

      if (password.length < 8) {
        toast('La contraseña debe tener al menos 8 caracteres.', 'warning');
        return;
      }

      if (password !== password2) {
        toast('Las contraseñas no coinciden.', 'warning');
        return;
      }

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${APP_CONFIG.SITE_URL}/login.html`,
            data: {
              full_name: fullName,
              phone,
              requested_role: requestedRole,
            },
          },
        });

        if (error) throw error;

        if (!data.session) {
          toast('Cuenta creada. Revisá tu email para confirmar el acceso.', 'success');
        } else {
          toast('Cuenta creada y sesión iniciada.', 'success');
          window.location.href = './account.html';
          return;
        }

        registerForm.reset();
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo crear la cuenta.', 'danger');
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = qs('[name="email"]', forgotForm).value.trim();
      try {
        await recoverPassword(email);
        toast('Te enviamos el email para restablecer la contraseña.', 'success');
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo enviar el email.', 'danger');
      }
    });
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = qs('[name="password"]', changePasswordForm).value.trim();
      const password2 = qs('[name="password_confirm"]', changePasswordForm).value.trim();

      if (password.length < 8) {
        toast('La contraseña debe tener al menos 8 caracteres.', 'warning');
        return;
      }
      if (password !== password2) {
        toast('Las contraseñas no coinciden.', 'warning');
        return;
      }

      try {
        await updatePassword(password);
        changePasswordForm.reset();
        setTimeout(() => {
          window.location.href = './account.html';
        }, 800);
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo actualizar la contraseña.', 'danger');
      }
    });
  }
}

export function bindAuthTabs() {
  qsa('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.authTab;
      qsa('[data-auth-tab]').forEach((el) => el.classList.toggle('is-active', el === button));
      qsa('[data-auth-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.authPanel !== target;
      });
    });
  });

  if (window.location.hash === '#register') {
    qs('[data-auth-tab="register"]')?.click();
  }
}

export function watchRecoveryEvents() {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      toast('Ya podés definir tu nueva contraseña.', 'info');
    }
  });
}
