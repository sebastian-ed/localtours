import { supabase } from './supabase-client.js';
import { initShell, requireAuth } from './auth.js';
import {
  qs,
  qsa,
  toast,
  formatCurrency,
  formatDate,
  listingTypeLabel,
  bookingStatusLabel,
  badgeClass,
  nl2list,
  commaList,
  pairsFromTextarea,
  slugify,
  setLoading,
  cardEmpty,
} from './utils.js';

let currentProfile = null;
let editingListingId = null;
let categories = [];
let providerOptions = [];
let myListings = [];

function setViewState() {
  qs('#provider-role-badge').innerHTML = `<span class="status-badge ${badgeClass(currentProfile.role)}">${currentProfile.role}</span>`;

  if (currentProfile.role === 'provider_pending') {
    qs('#provider-gate').hidden = false;
    qs('#provider-app').hidden = true;
  } else {
    qs('#provider-gate').hidden = true;
    qs('#provider-app').hidden = false;
  }
}

function renderStats() {
  const published = myListings.filter((x) => x.published).length;
  const draft = myListings.filter((x) => !x.published).length;
  qs('#provider-stat-products').textContent = myListings.length;
  qs('#provider-stat-published').textContent = published;
  qs('#provider-stat-draft').textContent = draft;
}

function renderCategoriesSelect() {
  const select = qs('#listing-categories');
  if (!select) return;
  select.innerHTML = categories.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
}

function renderProviderOwners() {
  const wrapper = qs('#owner-provider-field');
  const select = qs('#listing-owner-provider');
  if (!wrapper || !select) return;

  if (['admin', 'super_admin'].includes(currentProfile.role)) {
    wrapper.hidden = false;
    select.innerHTML = providerOptions.map((item) => `<option value="${item.id}">${item.company_name || item.full_name || item.email}</option>`).join('');
    if (!select.value) select.value = currentProfile.id;
  } else {
    wrapper.hidden = true;
  }
}

function listingRow(item) {
  return `
    <tr>
      <td>${item.title}</td>
      <td>${listingTypeLabel(item.listing_type)}</td>
      <td>${item.city || '—'}</td>
      <td>${formatCurrency(item.sale_price || item.price, item.currency)}</td>
      <td><span class="status-badge ${badgeClass(item.published ? 'published' : 'draft')}">${item.published ? 'Publicado' : 'Borrador'}</span></td>
      <td class="table-actions">
        <button class="btn btn-small btn-ghost" data-edit-listing="${item.id}">Editar</button>
        <button class="btn btn-small btn-danger" data-delete-listing="${item.id}">Eliminar</button>
      </td>
    </tr>
  `;
}

function renderListings() {
  const tbody = qs('#provider-listings-body');
  tbody.innerHTML = myListings.length
    ? myListings.map(listingRow).join('')
    : `<tr><td colspan="6"><div class="empty-inline">Todavía no cargaste productos.</div></td></tr>`;

  qsa('[data-edit-listing]').forEach((button) => {
    button.addEventListener('click', () => openForEdit(button.dataset.editListing));
  });

  qsa('[data-delete-listing]').forEach((button) => {
    button.addEventListener('click', () => deleteListing(button.dataset.deleteListing));
  });

  renderStats();
}

async function loadProviderListings() {
  let query = supabase
    .from('listings')
    .select('*')
    .order('updated_at', { ascending: false });

  if (currentProfile.role === 'provider') {
    query = query.eq('owner_provider_id', currentProfile.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  myListings = data || [];

  if (myListings.length) {
    const { data: links } = await supabase
      .from('listing_categories')
      .select('listing_id,category_id')
      .in('listing_id', myListings.map((item) => item.id));

    const byListing = new Map();
    (links || []).forEach((link) => {
      const arr = byListing.get(link.listing_id) || [];
      arr.push({ category_id: link.category_id });
      byListing.set(link.listing_id, arr);
    });

    myListings = myListings.map((item) => ({
      ...item,
      listing_categories: byListing.get(item.id) || [],
    }));
  }

  renderListings();
}

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  categories = data || [];
  renderCategoriesSelect();
}

async function loadProviderOptions() {
  if (!['admin', 'super_admin'].includes(currentProfile.role)) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,company_name,email,role,is_active')
    .in('role', ['provider', 'admin', 'super_admin'])
    .eq('is_active', true)
    .order('company_name', { ascending: true });

  if (error) throw error;
  providerOptions = data || [];
  renderProviderOwners();
}

async function loadBookings() {
  const box = qs('#provider-bookings-box');
  let query = supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (currentProfile.role === 'provider') query = query.eq('provider_id', currentProfile.id);

  const { data, error } = await query;
  if (error) throw error;

  const listingIds = [...new Set((data || []).map((item) => item.listing_id).filter(Boolean))];
  const listingMap = new Map();

  if (listingIds.length) {
    const { data: listings } = await supabase.from('listings').select('id,title,listing_type,currency').in('id', listingIds);
    (listings || []).forEach((item) => listingMap.set(item.id, item));
  }

  box.innerHTML = data?.length
    ? data.map((item) => {
      const listing = listingMap.get(item.listing_id) || {};
      return `
        <article class="provider-booking-card">
          <div class="booking-head">
            <div>
              <strong>${listing.title || 'Reserva'}</strong>
              <div>${item.customer_name || item.customer_email || 'Cliente'} · ${formatDate(item.travel_date)} ${item.travel_time ? item.travel_time.slice(0, 5) : ''}</div>
            </div>
            <span class="status-badge ${badgeClass(item.status)}">${bookingStatusLabel(item.status)}</span>
          </div>
          <div class="booking-grid">
            <span><strong>Viajeros:</strong> ${item.guests}</span>
            <span><strong>Total:</strong> ${formatCurrency(item.total_amount, listing.currency || 'USD')}</span>
            <span><strong>Estado:</strong> ${bookingStatusLabel(item.status)}</span>
          </div>
          <div class="table-actions">
            <button class="btn btn-small btn-ghost" data-booking-status="${item.id}|confirmed">Confirmar</button>
            <button class="btn btn-small btn-ghost" data-booking-status="${item.id}|completed">Completar</button>
            <button class="btn btn-small btn-danger" data-booking-status="${item.id}|cancelled">Cancelar</button>
          </div>
        </article>
      `;
    }).join('')
    : cardEmpty('Todavía no hay reservas.');

  qsa('[data-booking-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const [id, status] = button.dataset.bookingStatus.split('|');
      await updateBookingStatus(id, status);
    });
  });
}

async function updateBookingStatus(id, status) {
  try {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
    if (error) throw error;
    toast('Reserva actualizada.', 'success');
    loadBookings();
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo actualizar la reserva.', 'danger');
  }
}

function resetForm() {
  editingListingId = null;
  qs('#listing-form-title').textContent = 'Nuevo producto';
  qs('#listing-form').reset();
  qsa('#listing-categories option').forEach((option) => (option.selected = false));
  qs('#listing-id').value = '';
}

async function openForEdit(id) {
  const item = myListings.find((x) => x.id === id);
  if (!item) return;
  editingListingId = id;

  qs('#listing-form-title').textContent = `Editar: ${item.title}`;
  qs('#listing-id').value = item.id;
  qs('#listing-type').value = item.listing_type;
  qs('#listing-title').value = item.title || '';
  if (qs('#listing-owner-provider')) qs('#listing-owner-provider').value = item.owner_provider_id || currentProfile.id;
  qs('#listing-city').value = item.city || '';
  qs('#listing-country').value = item.country || '';
  qs('#listing-summary').value = item.summary || '';
  qs('#listing-description').value = item.description || '';
  qs('#listing-price').value = item.price || '';
  qs('#listing-sale-price').value = item.sale_price || '';
  qs('#listing-currency').value = item.currency || 'USD';
  qs('#listing-duration').value = item.duration_label || '';
  qs('#listing-capacity').value = item.capacity || 1;
  qs('#listing-cover-image').value = item.cover_image_url || '';
  qs('#listing-meeting-point').value = item.meeting_point || '';
  qs('#listing-cancellation').value = item.cancellation_type || '';
  qs('#listing-languages').value = (item.languages || []).join(', ');
  qs('#listing-highlights').value = (item.highlights || []).join('\n');
  qs('#listing-includes').value = (item.includes || []).join('\n');
  qs('#listing-excludes').value = (item.excludes || []).join('\n');
  qs('#listing-itinerary').value = (item.itinerary || []).join('\n');
  qs('#listing-faqs').value = (item.faqs || []).map((faq) => `${faq.question} | ${faq.answer}`).join('\n');
  qs('#listing-featured').checked = !!item.featured;
  qs('#listing-published').checked = !!item.published;

  const currentIds = new Set((item.listing_categories || []).map((x) => x.category_id));
  qsa('#listing-categories option').forEach((option) => {
    option.selected = currentIds.has(option.value);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function uploadFiles(files) {
  const uploadedUrls = [];
  for (const file of files) {
    const cleanName = `${crypto.randomUUID()}-${file.name.replace(/\s+/g, '-').toLowerCase()}`;
    const path = `${currentProfile.id}/${cleanName}`;
    const { error } = await supabase.storage
      .from('listing-media')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;
    const { data } = supabase.storage.from('listing-media').getPublicUrl(path);
    uploadedUrls.push(data.publicUrl);
  }
  return uploadedUrls;
}

async function syncListingMedia(listingId, urls = []) {
  if (!urls.length) return;
  const payload = urls.map((url, index) => ({
    listing_id: listingId,
    url,
    sort_order: index + 1,
  }));
  const { error } = await supabase.from('listing_media').insert(payload);
  if (error) throw error;
}

async function syncCategories(listingId, categoryIds) {
  await supabase.from('listing_categories').delete().eq('listing_id', listingId);
  if (!categoryIds.length) return;

  const payload = categoryIds.map((categoryId) => ({ listing_id: listingId, category_id: categoryId }));
  const { error } = await supabase.from('listing_categories').insert(payload);
  if (error) throw error;
}

async function saveListing(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = qs('button[type="submit"]', form);
  setLoading(button, true);

  try {
    const categoryIds = [...qs('#listing-categories').selectedOptions].map((option) => option.value);
    const uploadInput = qs('#listing-files');
    const files = uploadInput.files ? [...uploadInput.files] : [];
    const uploadedUrls = files.length ? await uploadFiles(files) : [];

    const title = qs('#listing-title').value.trim();
    const payload = {
      owner_provider_id: ['admin', 'super_admin'].includes(currentProfile.role)
        ? (qs('#listing-owner-provider')?.value || currentProfile.id)
        : currentProfile.id,
      listing_type: qs('#listing-type').value,
      title,
      slug: slugify(title) || `listing-${crypto.randomUUID().slice(0, 8)}`,
      city: qs('#listing-city').value.trim(),
      country: qs('#listing-country').value.trim(),
      summary: qs('#listing-summary').value.trim(),
      description: qs('#listing-description').value.trim(),
      price: Number(qs('#listing-price').value || 0),
      sale_price: qs('#listing-sale-price').value ? Number(qs('#listing-sale-price').value) : null,
      currency: qs('#listing-currency').value,
      duration_label: qs('#listing-duration').value.trim(),
      capacity: Number(qs('#listing-capacity').value || 1),
      cover_image_url: qs('#listing-cover-image').value.trim() || uploadedUrls[0] || null,
      meeting_point: qs('#listing-meeting-point').value.trim(),
      cancellation_type: qs('#listing-cancellation').value.trim(),
      languages: commaList(qs('#listing-languages').value),
      highlights: nl2list(qs('#listing-highlights').value),
      includes: nl2list(qs('#listing-includes').value),
      excludes: nl2list(qs('#listing-excludes').value),
      itinerary: nl2list(qs('#listing-itinerary').value),
      faqs: pairsFromTextarea(qs('#listing-faqs').value),
      featured: qs('#listing-featured').checked,
      published: qs('#listing-published').checked,
    };

    let listingId = editingListingId;

    if (editingListingId) {
      const { error } = await supabase.from('listings').update(payload).eq('id', editingListingId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('listings').insert(payload).select('id').single();
      if (error) throw error;
      listingId = data.id;
    }

    await syncCategories(listingId, categoryIds);
    await syncListingMedia(listingId, uploadedUrls);

    toast('Producto guardado.', 'success');
    resetForm();
    await loadProviderListings();
    await loadBookings();
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo guardar el producto.', 'danger');
  } finally {
    setLoading(button, false);
  }
}

async function deleteListing(id) {
  const ok = window.confirm('¿Eliminar este producto?');
  if (!ok) return;

  try {
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) throw error;
    toast('Producto eliminado.', 'success');
    await loadProviderListings();
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo eliminar.', 'danger');
  }
}

function bindTabs() {
  qsa('[data-provider-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.providerTab;
      qsa('[data-provider-tab]').forEach((el) => el.classList.toggle('is-active', el === button));
      qsa('[data-provider-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.providerPanel !== target;
      });
    });
  });
}

async function init() {
  await initShell();
  const { profile } = await requireAuth(['provider_pending', 'provider', 'admin', 'super_admin']);
  currentProfile = profile;
  setViewState();
  bindTabs();

  if (currentProfile.role !== 'provider_pending') {
    await Promise.all([loadCategories(), loadProviderOptions(), loadProviderListings(), loadBookings()]);
    qs('#listing-form')?.addEventListener('submit', saveListing);
    qs('#listing-reset-btn')?.addEventListener('click', resetForm);
  }
}

init().catch((error) => {
  console.error(error);
  qs('#provider-page').innerHTML = '<section class="section"><div class="container"><article class="empty-card">No se pudo cargar el panel de proveedor.</article></div></section>';
});
