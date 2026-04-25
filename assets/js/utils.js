export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

export function formatCurrency(amount, currency = 'USD', locale = 'es-AR') {
  const value = Number(amount || 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value, locale = 'es-AR') {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

export function slugify(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function nl2list(value = '') {
  return String(value)
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function commaList(value = '') {
  return String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function pairsFromTextarea(value = '') {
  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [question, ...rest] = line.split('|');
      return {
        question: (question || '').trim(),
        answer: rest.join('|').trim(),
      };
    })
    .filter((item) => item.question && item.answer);
}

export function starsMarkup(rating = 0) {
  const rounded = Math.round(Number(rating || 0));
  return `
    <span class="stars" aria-label="Valoración ${rounded} de 5">
      ${Array.from({ length: 5 }, (_, i) => `<span>${i < rounded ? '★' : '☆'}</span>`).join('')}
    </span>
  `;
}

export function toast(message, tone = 'info') {
  let stack = qs('#toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  stack.appendChild(el);

  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

export function badgeClass(role = '') {
  const map = {
    traveler: 'neutral',
    provider_pending: 'warning',
    provider: 'success',
    admin: 'info',
    super_admin: 'danger',
    draft: 'neutral',
    published: 'success',
    pending: 'warning',
    cancelled: 'danger',
    confirmed: 'success',
  };
  return map[role] || 'neutral';
}

export function roleLabel(role = '') {
  const map = {
    traveler: 'Usuario',
    provider_pending: 'Proveedor pendiente',
    provider: 'Proveedor',
    admin: 'Admin',
    super_admin: 'Super admin',
  };
  return map[role] || role;
}

export function bookingStatusLabel(status = '') {
  const map = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    completed: 'Completada',
  };
  return map[status] || status;
}

export function listingTypeLabel(type = '') {
  return type === 'accommodation' ? 'Alojamiento' : 'Experiencia';
}

export function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

export function setLoading(button, isLoading, label = 'Guardar') {
  if (!button) return;
  button.disabled = isLoading;
  button.dataset.originalLabel ||= button.textContent;
  button.textContent = isLoading ? 'Procesando...' : button.dataset.originalLabel || label;
}

export function cardEmpty(message) {
  return `<article class="empty-card">${escapeHtml(message)}</article>`;
}
