import { supabase } from './supabase-client.js';
import { initShell } from './auth.js';
import {
  qs,
  formatCurrency,
  starsMarkup,
  escapeHtml,
  getQueryParams,
  listingTypeLabel,
  cardEmpty,
} from './utils.js';

let catalog = [];

function listingCard(item) {
  const price = item.sale_price || item.price;
  const basePrice = item.sale_price ? `<span class="strike">${formatCurrency(item.price, item.currency)}</span>` : '';
  const categories = (item.category_names || []).slice(0, 3).map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join('');

  return `
    <article class="listing-card">
      <a class="listing-card-media" href="./detail.html?id=${item.id}">
        <img src="${item.cover_image_url || 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80'}" alt="${escapeHtml(item.title)}">
        <span class="pill pill-dark">${listingTypeLabel(item.listing_type)}</span>
      </a>

      <div class="listing-card-body">
        <div class="listing-meta-row">
          <span>${escapeHtml(item.city || '')}${item.country ? `, ${escapeHtml(item.country)}` : ''}</span>
          <span>${escapeHtml(item.duration_label || 'Flexible')}</span>
        </div>

        <h3><a href="./detail.html?id=${item.id}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary || '')}</p>

        <div class="chip-row">${categories}</div>

        <div class="listing-rating">
          ${starsMarkup(item.rating_avg || 0)}
          <strong>${Number(item.rating_avg || 0).toFixed(1)}</strong>
          <span>(${item.rating_count || 0} reseñas)</span>
        </div>

        <div class="listing-usp-row">
          <span>${escapeHtml(item.cancellation_type || 'Política según proveedor')}</span>
          <span>${item.instant_confirmation ? 'Confirmación inmediata' : 'Confirmación manual'}</span>
        </div>

        <div class="listing-price-row">
          <div>
            <small>Desde</small>
            <div class="price-block">${basePrice}<strong>${formatCurrency(price, item.currency)}</strong></div>
          </div>
          <a class="btn btn-primary" href="./detail.html?id=${item.id}">Ver detalle</a>
        </div>
      </div>
    </article>
  `;
}

function fillFilterOptions(items) {
  const citySelect = qs('#city-filter');
  const categorySelect = qs('#category-filter');
  const cities = [...new Set(items.map((x) => x.city).filter(Boolean))].sort();
  const categories = [...new Set(items.flatMap((x) => x.category_names || []))].sort();

  if (citySelect) {
    citySelect.innerHTML = `<option value="">Todas las ciudades</option>` +
      cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join('');
  }

  if (categorySelect) {
    categorySelect.innerHTML = `<option value="">Todas las categorías</option>` +
      categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  }
}

function applyFilters() {
  const text = qs('#search-filter')?.value.trim().toLowerCase() || '';
  const city = qs('#city-filter')?.value || '';
  const type = qs('#type-filter')?.value || '';
  const category = qs('#category-filter')?.value || '';
  const sort = qs('#sort-filter')?.value || 'featured';

  let items = [...catalog];

  if (text) {
    items = items.filter((item) =>
      [item.title, item.summary, item.city, item.country, ...(item.category_names || [])]
        .join(' ')
        .toLowerCase()
        .includes(text)
    );
  }

  if (city) items = items.filter((item) => item.city === city);
  if (type) items = items.filter((item) => item.listing_type === type);
  if (category) items = items.filter((item) => (item.category_names || []).includes(category));

  if (sort === 'price_asc') items.sort((a, b) => (a.sale_price || a.price || 0) - (b.sale_price || b.price || 0));
  if (sort === 'price_desc') items.sort((a, b) => (b.sale_price || b.price || 0) - (a.sale_price || a.price || 0));
  if (sort === 'rating') items.sort((a, b) => (b.rating_avg || 0) - (a.rating_avg || 0));
  if (sort === 'featured') items.sort((a, b) => Number(b.featured) - Number(a.featured));

  renderCatalog(items);
}

function renderCatalog(items) {
  const grid = qs('#catalog-grid');
  const count = qs('#catalog-count');
  if (!grid) return;

  count.textContent = `${items.length} resultado${items.length === 1 ? '' : 's'}`;
  grid.innerHTML = items.length ? items.map(listingCard).join('') : cardEmpty('No encontramos resultados con esos filtros.');
}

function syncHeroSearch() {
  const form = qs('#hero-search-form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const destination = qs('[name="destination"]', form).value.trim();
    const travelDate = qs('[name="travel_date"]', form).value;
    const guests = qs('[name="guests"]', form).value;

    localStorage.setItem('lt-search-context', JSON.stringify({ destination, travelDate, guests }));

    if (qs('#search-filter')) qs('#search-filter').value = destination;
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
    applyFilters();
  });
}

async function loadCatalog() {
  const { data, error } = await supabase
    .from('listing_catalog')
    .select('*')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  catalog = data || [];
  fillFilterOptions(catalog);

  const params = getQueryParams();
  const q = params.get('q');
  if (q && qs('#search-filter')) qs('#search-filter').value = q;

  renderCatalog(catalog);
  applyFilters();
}

async function loadFeatured() {
  const heroGrid = qs('#featured-grid');
  if (!heroGrid) return;

  const featured = catalog.filter((x) => x.featured).slice(0, 3);
  heroGrid.innerHTML = featured.length
    ? featured.map((item) => `
      <a class="featured-panel" href="./detail.html?id=${item.id}">
        <img src="${item.cover_image_url || 'https://images.unsplash.com/photo-1496417263034-38ec4f0b665a?auto=format&fit=crop&w=1200&q=80'}" alt="${escapeHtml(item.title)}">
        <div class="featured-panel-content">
          <span class="pill">${listingTypeLabel(item.listing_type)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.city || '')}${item.country ? `, ${escapeHtml(item.country)}` : ''}</p>
        </div>
      </a>
    `).join('')
    : '';
}

async function init() {
  await initShell();
  await loadCatalog();
  await loadFeatured();

  syncHeroSearch();

  ['#search-filter', '#city-filter', '#type-filter', '#category-filter', '#sort-filter']
    .map((selector) => qs(selector))
    .filter(Boolean)
    .forEach((input) => input.addEventListener('input', applyFilters));
}

init().catch((error) => {
  console.error(error);
  qs('#catalog-grid').innerHTML = `<article class="empty-card">No se pudo cargar el catálogo. Revisá tu configuración de Supabase.</article>`;
});
