import { supabase, FUNCTIONS_BASE } from './supabase-client.js';
import { initShell, requireAuth } from './auth.js';
import {
  qs,
  qsa,
  toast,
  formatCurrency,
  formatDate,
  badgeClass,
  roleLabel,
  listingTypeLabel,
  cardEmpty,
} from './utils.js';

let currentProfile = null;
let allListings = [];

async function callAdminUsers(method = 'GET', body = null, params = '') {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No autenticado');

  const response = await fetch(`${FUNCTIONS_BASE}/admin-users${params}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Error en admin-users');
  return json;
}

function bindTabs() {
  qsa('[data-admin-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.adminTab;
      qsa('[data-admin-tab]').forEach((el) => el.classList.toggle('is-active', el === button));
      qsa('[data-admin-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.adminPanel !== target;
      });
    });
  });
}

async function loadOverview() {
  const [{ count: profilesCount }, { count: listingsCount }, { count: bookingsCount }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('listings').select('*', { count: 'exact', head: true }),
    supabase.from('bookings').select('*', { count: 'exact', head: true }),
  ]);

  qs('#admin-stat-users').textContent = profilesCount || 0;
  qs('#admin-stat-products').textContent = listingsCount || 0;
  qs('#admin-stat-bookings').textContent = bookingsCount || 0;
}

async function loadListings() {
  const box = qs('#admin-listings-box');
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  allListings = data || [];

  const providerIds = [...new Set(allListings.map((item) => item.owner_provider_id).filter(Boolean))];
  const providerMap = new Map();

  if (providerIds.length) {
    const { data: providers } = await supabase
      .from('profiles')
      .select('id,full_name,company_name')
      .in('id', providerIds);

    (providers || []).forEach((provider) => providerMap.set(provider.id, provider));
  }

  box.innerHTML = allListings.length
    ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Proveedor</th>
              <th>Ciudad</th>
              <th>Precio</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${allListings.map((item) => {
              const provider = providerMap.get(item.owner_provider_id) || {};
              return `
                <tr>
                  <td>${item.title}</td>
                  <td>${listingTypeLabel(item.listing_type)}</td>
                  <td>${provider.company_name || provider.full_name || '—'}</td>
                  <td>${item.city || '—'}</td>
                  <td>${formatCurrency(item.sale_price || item.price, item.currency)}</td>
                  <td><span class="status-badge ${badgeClass(item.published ? 'published' : 'draft')}">${item.published ? 'Publicado' : 'Borrador'}</span></td>
                  <td class="table-actions">
                    <button class="btn btn-small btn-ghost" data-toggle-published="${item.id}|${item.published ? '0' : '1'}">${item.published ? 'Despublicar' : 'Publicar'}</button>
                    <button class="btn btn-small btn-danger" data-delete-listing="${item.id}">Eliminar</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `
    : cardEmpty('No hay productos cargados.');

  qsa('[data-toggle-published]').forEach((button) => {
    button.addEventListener('click', async () => {
      const [id, value] = button.dataset.togglePublished.split('|');
      await supabase.from('listings').update({ published: value === '1' }).eq('id', id);
      toast('Estado actualizado.', 'success');
      loadListings();
    });
  });

  qsa('[data-delete-listing]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('¿Eliminar este producto?')) return;
      const { error } = await supabase.from('listings').delete().eq('id', button.dataset.deleteListing);
      if (error) {
        toast(error.message || 'No se pudo eliminar.', 'danger');
        return;
      }
      toast('Producto eliminado.', 'success');
      loadListings();
    });
  });
}

async function loadBookings() {
  const box = qs('#admin-bookings-box');
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  const listingIds = [...new Set((data || []).map((item) => item.listing_id).filter(Boolean))];
  const providerIds = [...new Set((data || []).map((item) => item.provider_id).filter(Boolean))];
  const listingMap = new Map();
  const providerMap = new Map();

  if (listingIds.length) {
    const { data: listings } = await supabase.from('listings').select('id,title,currency').in('id', listingIds);
    (listings || []).forEach((item) => listingMap.set(item.id, item));
  }

  if (providerIds.length) {
    const { data: providers } = await supabase.from('profiles').select('id,company_name,full_name').in('id', providerIds);
    (providers || []).forEach((item) => providerMap.set(item.id, item));
  }

  box.innerHTML = data?.length
    ? data.map((item) => {
      const listing = listingMap.get(item.listing_id) || {};
      const provider = providerMap.get(item.provider_id) || {};
      return `
        <article class="provider-booking-card">
          <div class="booking-head">
            <div>
              <strong>${listing.title || 'Reserva'}</strong>
              <div>${provider.company_name || provider.full_name || 'Proveedor'} · ${formatDate(item.travel_date)}</div>
            </div>
            <span class="status-badge ${badgeClass(item.status)}">${item.status}</span>
          </div>
          <div class="booking-grid">
            <span><strong>Cliente:</strong> ${item.customer_name || item.customer_email || '—'}</span>
            <span><strong>Total:</strong> ${formatCurrency(item.total_amount, listing.currency || 'USD')}</span>
            <span><strong>Creada:</strong> ${formatDate(item.created_at)}</span>
          </div>
        </article>
      `;
    }).join('')
    : cardEmpty('Todavía no hay reservas.');
}

async function loadUsers() {
  const box = qs('#admin-users-box');
  if (currentProfile.role !== 'super_admin') {
    box.innerHTML = cardEmpty('La gestión de usuarios está reservada al super admin.');
    return;
  }

  const result = await callAdminUsers('GET');
  const users = result.users || [];

  box.innerHTML = users.length
    ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Activo</th>
              <th>Creado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${users.map((user) => `
              <tr>
                <td>${user.profile?.full_name || user.profile?.company_name || '—'}</td>
                <td>${user.email}</td>
                <td>
                  <select data-user-role="${user.id}">
                    ${['traveler', 'provider_pending', 'provider', 'admin', 'super_admin'].map((role) => `
                      <option value="${role}" ${user.profile?.role === role ? 'selected' : ''}>${roleLabel(role)}</option>
                    `).join('')}
                  </select>
                </td>
                <td>
                  <input type="checkbox" data-user-active="${user.id}" ${user.profile?.is_active ? 'checked' : ''}>
                </td>
                <td>${formatDate(user.created_at)}</td>
                <td class="table-actions">
                  <button class="btn btn-small btn-ghost" data-save-user="${user.id}">Guardar</button>
                  <button class="btn btn-small btn-danger" data-delete-user="${user.id}">Eliminar</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : cardEmpty('No hay usuarios para mostrar.');

  qsa('[data-save-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const userId = button.dataset.saveUser;
      const role = qs(`[data-user-role="${userId}"]`).value;
      const isActive = qs(`[data-user-active="${userId}"]`).checked;

      try {
        await callAdminUsers('PATCH', { userId, role, isActive });
        toast('Usuario actualizado.', 'success');
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo actualizar el usuario.', 'danger');
      }
    });
  });

  qsa('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('¿Eliminar este usuario?')) return;
      try {
        await callAdminUsers('DELETE', { userId: button.dataset.deleteUser });
        toast('Usuario eliminado.', 'success');
        loadUsers();
        loadOverview();
      } catch (error) {
        console.error(error);
        toast(error.message || 'No se pudo eliminar el usuario.', 'danger');
      }
    });
  });
}

async function loadCategories() {
  const box = qs('#admin-categories-box');
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;

  box.innerHTML = `
    <form id="category-form" class="inline-form">
      <input type="text" name="name" placeholder="Nueva categoría" required>
      <button class="btn btn-primary" type="submit">Agregar</button>
    </form>
    <div class="tag-cloud">
      ${(data || []).map((item) => `<button class="chip chip-clickable" data-delete-category="${item.id}">${item.name} ×</button>`).join('')}
    </div>
  `;

  qs('#category-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = qs('[name="name"]', event.currentTarget).value.trim();
    if (!name) return;
    const { error } = await supabase.from('categories').insert({ name });
    if (error) {
      toast(error.message || 'No se pudo crear la categoría.', 'danger');
      return;
    }
    toast('Categoría creada.', 'success');
    loadCategories();
  });

  qsa('[data-delete-category]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { error } = await supabase.from('categories').delete().eq('id', button.dataset.deleteCategory);
      if (error) {
        toast(error.message || 'No se pudo eliminar.', 'danger');
        return;
      }
      toast('Categoría eliminada.', 'success');
      loadCategories();
    });
  });
}

async function init() {
  await initShell();
  const { profile } = await requireAuth(['admin', 'super_admin']);
  currentProfile = profile;
  bindTabs();
  await Promise.all([loadOverview(), loadListings(), loadBookings(), loadUsers(), loadCategories()]);
}

init().catch((error) => {
  console.error(error);
  qs('#admin-page').innerHTML = '<section class="section"><div class="container"><article class="empty-card">No se pudo cargar el panel admin.</article></div></section>';
});
