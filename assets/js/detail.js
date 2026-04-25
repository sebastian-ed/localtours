import { supabase } from './supabase-client.js';
import { initShell, getSession, getProfile } from './auth.js';
import {
  qs,
  getQueryParams,
  toast,
  formatCurrency,
  starsMarkup,
  escapeHtml,
  listingTypeLabel,
  formatDate,
  cardEmpty,
} from './utils.js';

let currentListing = null;

function renderGallery(media = []) {
  const main = qs('#detail-gallery');
  const items = media.length ? media : [{ url: currentListing.cover_image_url }];
  main.innerHTML = items.map((item, index) => `
    <div class="gallery-item ${index === 0 ? 'is-main' : ''}">
      <img src="${item.url}" alt="${escapeHtml(currentListing.title)}">
    </div>
  `).join('');
}

function renderFaqs(faqs = []) {
  const box = qs('#faqs-box');
  if (!box) return;
  box.innerHTML = faqs.length
    ? faqs.map((item) => `
      <details class="faq-item">
        <summary>${escapeHtml(item.question)}</summary>
        <p>${escapeHtml(item.answer)}</p>
      </details>
    `).join('')
    : cardEmpty('Todavía no hay preguntas frecuentes cargadas.');
}

function renderReviews(reviews = []) {
  const box = qs('#reviews-box');
  if (!box) return;
  box.innerHTML = reviews.length
    ? reviews.map((review) => `
      <article class="review-card">
        <div class="review-head">
          <div>
            <strong>${escapeHtml(review.title || 'Reseña')}</strong>
            <div>${starsMarkup(review.rating)} <span>${formatDate(review.created_at)}</span></div>
          </div>
          <span>${escapeHtml(review.full_name || review.email || 'Usuario')}</span>
        </div>
        <p>${escapeHtml(review.body || '')}</p>
      </article>
    `).join('')
    : cardEmpty('Todavía no hay reseñas aprobadas.');
}

function renderProvider() {
  const providerBox = qs('#provider-box');
  if (!providerBox || !currentListing) return;

  providerBox.innerHTML = `
    <div class="provider-card">
      <img class="provider-avatar" src="${currentListing.provider_avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentListing.company_name || currentListing.provider_name || 'Proveedor')}" alt="Proveedor">
      <div>
        <strong>${escapeHtml(currentListing.company_name || currentListing.provider_name || 'Proveedor')}</strong>
        <p>${escapeHtml(currentListing.provider_bio || 'Experiencias operadas por proveedor local validado.')}</p>
        <div class="inline-links">
          ${currentListing.provider_whatsapp ? `<a href="https://wa.me/${String(currentListing.provider_whatsapp).replace(/\D/g, '')}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
          ${currentListing.provider_website ? `<a href="${currentListing.provider_website}" target="_blank" rel="noreferrer">Sitio web</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderDetail(listing) {
  currentListing = listing;
  document.title = `${listing.title} · LocalTours Pro`;

  qs('#detail-title').textContent = listing.title;
  qs('#detail-summary').textContent = listing.summary || '';
  qs('#detail-location').textContent = `${listing.city || ''}${listing.country ? `, ${listing.country}` : ''}`;
  qs('#detail-rating').innerHTML = `${starsMarkup(listing.rating_avg || 0)} <strong>${Number(listing.rating_avg || 0).toFixed(1)}</strong> <span>(${listing.rating_count || 0} reseñas)</span>`;
  qs('#detail-pill').textContent = listingTypeLabel(listing.listing_type);
  qs('#detail-description').textContent = listing.description || 'Sin descripción disponible.';
  qs('#detail-duration').textContent = listing.duration_label || 'Flexible';
  qs('#detail-cancellation').textContent = listing.cancellation_type || 'Según proveedor';
  qs('#detail-capacity').textContent = listing.capacity ? `${listing.capacity} personas` : 'Consultar';
  qs('#detail-languages').textContent = (listing.languages || []).join(', ') || 'A confirmar';
  qs('#detail-price').innerHTML = `
    ${listing.sale_price ? `<span class="strike">${formatCurrency(listing.price, listing.currency)}</span>` : ''}
    <strong>${formatCurrency(listing.sale_price || listing.price, listing.currency)}</strong>
  `;

  qs('#detail-highlights').innerHTML = (listing.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Información pendiente</li>';
  qs('#detail-includes').innerHTML = (listing.includes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Información pendiente</li>';
  qs('#detail-excludes').innerHTML = (listing.excludes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Información pendiente</li>';
  qs('#detail-itinerary').innerHTML = (listing.itinerary || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Itinerario a confirmar</li>';

  const categoriesBox = qs('#detail-categories');
  categoriesBox.innerHTML = (listing.category_names || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('');

  renderProvider();

  const searchContext = JSON.parse(localStorage.getItem('lt-search-context') || '{}');
  if (searchContext.travelDate) qs('[name="travel_date"]', qs('#booking-form')).value = searchContext.travelDate;
  if (searchContext.guests) qs('[name="guests"]', qs('#booking-form')).value = searchContext.guests;
}

async function loadListing() {
  const id = getQueryParams().get('id');
  if (!id) throw new Error('Falta el id del producto');

  const { data, error } = await supabase
    .from('listing_detail_view')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  renderDetail(data);

  const [{ data: media }, { data: reviews }] = await Promise.all([
    supabase.from('listing_media').select('id,url,sort_order').eq('listing_id', id).order('sort_order'),
    supabase.from('review_public_view').select('*').eq('listing_id', id).order('created_at', { ascending: false }),
  ]);

  renderGallery(media || []);
  renderFaqs(data.faqs || []);
  renderReviews(reviews || []);
}

async function handleBooking(event) {
  event.preventDefault();

  try {
    const session = await getSession();
    if (!session) {
      window.location.href = './login.html?next=detail.html%3Fid=' + encodeURIComponent(currentListing.id);
      return;
    }

    const profile = await getProfile();
    const form = event.currentTarget;

    const guests = Number(qs('[name="guests"]', form).value || 1);
    const travelDate = qs('[name="travel_date"]', form).value;
    const travelTime = qs('[name="travel_time"]', form).value;
    const notes = qs('[name="notes"]', form).value.trim();

    if (!travelDate) {
      toast('Seleccioná una fecha.', 'warning');
      return;
    }

    const price = Number(currentListing.sale_price || currentListing.price || 0);

    const { error } = await supabase.from('bookings').insert({
      listing_id: currentListing.id,
      user_id: profile.id,
      travel_date: travelDate,
      travel_time: travelTime || null,
      guests,
      customer_name: profile.full_name || profile.company_name || profile.email,
      customer_email: profile.email,
      customer_phone: profile.phone || profile.whatsapp || null,
      notes,
      total_amount: price * guests,
    });

    if (error) throw error;

    toast('Reserva enviada. La vas a ver en tu cuenta.', 'success');
    form.reset();
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo registrar la reserva.', 'danger');
  }
}

async function toggleFavorite() {
  try {
    const session = await getSession();
    if (!session) {
      window.location.href = './login.html?next=detail.html%3Fid=' + encodeURIComponent(currentListing.id);
      return;
    }

    const profile = await getProfile();
    const button = qs('#favorite-btn');
    const currentState = button.dataset.active === 'true';

    if (currentState) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', profile.id)
        .eq('listing_id', currentListing.id);
      if (error) throw error;
      button.dataset.active = 'false';
      button.textContent = 'Guardar';
      toast('Quitado de guardados.', 'info');
    } else {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: profile.id, listing_id: currentListing.id });
      if (error && !error.message.includes('duplicate')) throw error;
      button.dataset.active = 'true';
      button.textContent = 'Guardado';
      toast('Agregado a guardados.', 'success');
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'No se pudo actualizar favoritos.', 'danger');
  }
}

async function hydrateFavoriteState() {
  const session = await getSession();
  if (!session || !currentListing) return;

  const profile = await getProfile();
  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', profile.id)
    .eq('listing_id', currentListing.id)
    .maybeSingle();

  const button = qs('#favorite-btn');
  if (data) {
    button.dataset.active = 'true';
    button.textContent = 'Guardado';
  }
}

async function init() {
  await initShell();
  await loadListing();
  await hydrateFavoriteState();

  qs('#booking-form')?.addEventListener('submit', handleBooking);
  qs('#favorite-btn')?.addEventListener('click', toggleFavorite);
}

init().catch((error) => {
  console.error(error);
  qs('#detail-page').innerHTML = '<section class="section"><div class="container"><article class="empty-card">No se pudo cargar el detalle.</article></div></section>';
});
