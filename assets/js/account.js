import { supabase } from './supabase-client.js';
import { initShell, requireAuth, updateOwnProfile, updatePassword } from './auth.js';
import {
  qs,
  formatCurrency,
  formatDate,
  formatTime,
  toast,
  bookingStatusLabel,
  roleLabel,
  listingTypeLabel,
  badgeClass,
  cardEmpty,
} from './utils.js';

let currentProfile = null;

function renderProfile(profile) {
  currentProfile = profile;
  qs('#account-name').textContent = profile.full_name || profile.company_name || profile.email;
  qs('#account-role').innerHTML = `<span class="status-badge ${badgeClass(profile.role)}">${roleLabel(profile.role)}</span>`;
  qs('#profile-full-name').value = profile.full_name || '';
  qs('#profile-company-name').value = profile.company_name || '';
  qs('#profile-phone').value = profile.phone || '';
  qs('#profile-whatsapp').value = profile.whatsapp || '';
  qs('#profile-website').value = profile.website || '';
  qs('#profile-city').value = profile.city || '';
  qs('#profile-bio').value = profile.bio || '';
  qs('#profile-email').value = profile.email || '';
}

async function loadBookings() {
  const box = qs('#bookings-box');
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const listingIds = [...new Set((data || []).map((item) => item.listing_id).filter(Boolean))];
  const listingMap = new Map();

  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select('id,title,listing_type,city,currency,cover_image_url')
      .in('id', listingIds);

    (listings || []).forEach((item) => listingMap.set(item.id, item));
  }

  box.innerHTML = data?.length
    ? data.map((item) => {
      const listing = listingMap.get(item.listing_id) || {};
      return `
        <article class="booking-card">
          <img src="${listing.cover_image_url || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80'}" alt="${listing.title || 'Reserva'}">
          <div class="booking-card-content">
            <div class="booking-head">
              <div>
                <strong>${listing.title || 'Reserva'}</strong>
                <div>${listingTypeLabel(listing.listing_type || 'experience')} · ${listing.city || '—'}</div>
              </div>
              <span class="status-badge ${badgeClass(item.status)}">${bookingStatusLabel(item.status)}</span>
            </div>
            <div class="booking-grid">
              <span><strong>Fecha:</strong> ${formatDate(item.travel_date)}</span>
              <span><strong>Hora:</strong> ${formatTime(item.travel_time)}</span>
              <span><strong>Viajeros:</strong> ${item.guests}</span>
              <span><strong>Total:</strong> ${formatCurrency(item.total_amount, listing.currency || 'USD')}</span>
            </div>
          </div>
        </article>
      `;
    }).join('')
    : cardEmpty('Todavía no tenés reservas.');
}

async function loadFavorites() {
  const box = qs('#favorites-box');
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const listingIds = [...new Set((data || []).map((item) => item.listing_id).filter(Boolean))];
  const listingMap = new Map();

  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select('id,title,summary,listing_type,city,cover_image_url,price,sale_price,currency')
      .in('id', listingIds);

    (listings || []).forEach((item) => listingMap.set(item.id, item));
  }

  box.innerHTML = data?.length
    ? data.map((item) => {
      const listing = listingMap.get(item.listing_id) || {};
      return `
        <a class="favorite-card" href="./detail.html?id=${listing.id}">
          <img src="${listing.cover_image_url || 'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&w=1200&q=80'}" alt="${listing.title || 'Guardado'}">
          <div>
            <strong>${listing.title || 'Producto guardado'}</strong>
            <p>${listing.summary || ''}</p>
            <small>${listing.city || '—'} · ${formatCurrency(listing.sale_price || listing.price, listing.currency || 'USD')}</small>
          </div>
        </a>
      `;
    }).join('')
    : cardEmpty('No guardaste productos todavía.');
}

async function bindForms() {
  qs('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const payload = {
        full_name: qs('#profile-full-name', form).value.trim(),
        company_name: qs('#profile-company-name', form).value.trim(),
        phone: qs('#profile-phone', form).value.trim(),
        whatsapp: qs('#profile-whatsapp', form).value.trim(),
        website: qs('#profile-website', form).value.trim(),
        city: qs('#profile-city', form).value.trim(),
        bio: qs('#profile-bio', form).value.trim(),
      };
      const profile = await updateOwnProfile(payload);
      renderProfile(profile);
      toast('Perfil actualizado.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo actualizar el perfil.', 'danger');
    }
  });

  qs('#password-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const password = qs('[name="password"]', form).value.trim();
    const password2 = qs('[name="password_confirm"]', form).value.trim();

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
      form.reset();
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo cambiar la contraseña.', 'danger');
    }
  });
}

async function init() {
  await initShell();
  const { profile } = await requireAuth();
  renderProfile(profile);
  await Promise.all([loadBookings(), loadFavorites()]);
  bindForms();
}

init().catch((error) => {
  console.error(error);
  qs('#account-page').innerHTML = '<section class="section"><div class="container"><article class="empty-card">No se pudo cargar tu cuenta.</article></div></section>';
});
