// Hash router for the board, bounty, leaderboard, and profile surfaces.
import {
  getBounties,
  getBounty,
  getLeaderboard,
  getProfile,
} from './api.js';
import { board, bounty, errorView, leaderboard, loading, profile } from './views.js';

const app = document.getElementById('app');
const nav = document.querySelector('[data-site-nav]');
let renderToken = 0;
let cleanupBoard = null;

const routes = [
  { name: 'leaderboard', pattern: /^#\/bounty\/([^/]+)\/leaderboard\/?$/ },
  { name: 'bounty', pattern: /^#\/bounty\/([^/]+)\/?$/ },
  { name: 'profile', pattern: /^#\/account\/([^/]+)\/?$/ },
];

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function route() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '#' || hash === '') return { name: 'board', params: [] };
  for (const candidate of routes) {
    const match = hash.match(candidate.pattern);
    if (match) return { name: candidate.name, params: match.slice(1).map(decode) };
  }
  return { name: 'notfound', params: [] };
}

function setActiveNav(name) {
  if (!nav) return;
  for (const link of nav.querySelectorAll('a')) {
    const active = link.dataset.route === name;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function settle() {
  window.scrollTo(0, 0);
  window.__shotReady = true;
}

function attachAvatarFallback() {
  const image = app.querySelector('[data-avatar-image]');
  if (image) image.addEventListener('error', () => image.remove(), { once: true });
}

function renderBoard(data, state = {}) {
  app.innerHTML = board(data);
  const grid = app.querySelector('[data-bounty-grid]');
  const input = app.querySelector('[data-board-search]');
  const select = app.querySelector('[data-board-sort]');
  const countLabel = app.querySelector('[data-board-count]');
  const empty = app.querySelector('[data-board-empty]');
  const clear = app.querySelector('[data-board-clear]');
  const emptyTitle = app.querySelector('[data-board-empty-title]');
  const emptyCopy = app.querySelector('[data-board-empty-copy]');
  if (!grid || !input || !select) return;

  const original = [...grid.querySelectorAll('[data-bounty-card]')];
  if (state.query) input.value = state.query;
  if (state.sort) select.value = state.sort;

  function apply() {
    const query = input.value.trim().toLowerCase();
    const visible = original.filter((card) => (card.dataset.title || '').includes(query));
    const sort = select.value;

    visible.sort((left, right) => {
      if (sort === 'pot') return Number(right.dataset.pot) - Number(left.dataset.pot);
      if (sort === 'entries') return Number(right.dataset.entries) - Number(left.dataset.entries);
      const leftDeadline = Number(left.dataset.deadline) || Number.POSITIVE_INFINITY;
      const rightDeadline = Number(right.dataset.deadline) || Number.POSITIVE_INFINITY;
      return leftDeadline - rightDeadline;
    });

    for (const card of original) {
      const match = visible.includes(card);
      card.hidden = !match;
      if (match) grid.append(card);
    }
    if (countLabel) {
      const noun = visible.length === 1 ? 'bounty' : 'bounties';
      countLabel.textContent = visible.length === original.length
        ? `${visible.length.toLocaleString('en-US')} ${noun}`
        : `${visible.length.toLocaleString('en-US')} of ${original.length.toLocaleString('en-US')} ${noun}`;
    }
    const noBoardItems = original.length === 0;
    if (emptyTitle) emptyTitle.textContent = noBoardItems ? 'No open bounties right now' : 'No bounties match that search';
    if (emptyCopy) {
      emptyCopy.textContent = noBoardItems
        ? 'New briefs land regularly. Check back soon for the next one.'
        : 'Try a shorter phrase, or clear the search to see every open bounty.';
    }
    if (clear) clear.hidden = noBoardItems || !query;
    if (empty) empty.hidden = visible.length !== 0;
  }

  input.addEventListener('input', apply);
  select.addEventListener('change', apply);
  const clearSearch = () => {
    input.value = '';
    apply();
    input.focus();
  };
  if (clear) clear.addEventListener('click', clearSearch);
  apply();
  cleanupBoard = () => {
    input.removeEventListener('input', apply);
    select.removeEventListener('change', apply);
    if (clear) clear.removeEventListener('click', clearSearch);
  };
}

async function showBoard(token) {
  app.innerHTML = loading('board');
  document.title = 'Open bounties · make.fun';
  setActiveNav('board');
  const data = await getBounties({
    onUpdate: (fresh) => {
      if (token !== renderToken || !document.querySelector('[data-bounty-grid]')) return;
      const active = document.activeElement;
      const currentInput = app.querySelector('[data-board-search]');
      const currentSelect = app.querySelector('[data-board-sort]');
      const query = currentInput?.value ?? '';
      const sort = currentSelect?.value ?? '';
      const selection = active === currentInput
        ? [currentInput.selectionStart, currentInput.selectionEnd]
        : null;
      const sorting = active === currentSelect;
      cleanupBoard?.();
      renderBoard(fresh, { query, sort });
      if (selection) {
        const field = app.querySelector('[data-board-search]');
        field.focus({ preventScroll: true });
        field.setSelectionRange(selection[0], selection[1]);
      } else if (sorting) {
        app.querySelector('[data-board-sort]')?.focus({ preventScroll: true });
      }
    },
  });
  if (token !== renderToken) return;
  renderBoard(data);
  document.title = 'Open bounties · make.fun';
  settle();
}

async function showBounty(token, slug) {
  app.innerHTML = loading('bounty');
  document.title = 'Bounty · make.fun';
  setActiveNav('board');
  const data = await getBounty(slug, {
    onUpdate: (fresh) => {
      if (token !== renderToken || !document.querySelector('.bounty-layout')) return;
      cleanupBoard?.();
      app.innerHTML = bounty(fresh);
      document.title = `${fresh.title || 'Bounty'} · make.fun`;
    },
  });
  if (token !== renderToken) return;
  app.innerHTML = bounty(data);
  document.title = `${data.title || 'Bounty'} · make.fun`;
  settle();
}

async function showLeaderboard(token, slug) {
  app.innerHTML = loading('leaderboard');
  document.title = 'Leaderboard · make.fun';
  setActiveNav('leaderboard');
  const data = await getLeaderboard(slug, {
    onUpdate: (fresh) => {
      if (token !== renderToken || !document.querySelector('.data-table, .empty-state')) return;
      app.innerHTML = leaderboard(fresh, slug);
      const title = fresh?.competition?.title || 'Leaderboard';
      document.title = `${title} leaderboard · make.fun`;
    },
  });
  if (token !== renderToken) return;
  app.innerHTML = leaderboard(data, slug);
  const title = data?.competition?.title || 'Leaderboard';
  document.title = `${title} leaderboard · make.fun`;
  settle();
}

async function showProfile(token, handle) {
  app.innerHTML = loading('profile');
  document.title = 'Maker profile · make.fun';
  setActiveNav('profile');
  const data = await getProfile(handle, {
    onUpdate: (fresh) => {
      if (token !== renderToken || !document.querySelector('.profile-hero')) return;
      const target = document.activeElement;
      app.innerHTML = profile(fresh);
      attachAvatarFallback();
      if (target === document.body) app.querySelector('h1')?.focus?.({ preventScroll: true });
      document.title = `${fresh.display_name || fresh.handle || 'Maker'} · make.fun`;
    },
  });
  if (token !== renderToken) return;
  app.innerHTML = profile(data);
  attachAvatarFallback();
  document.title = `${data.display_name || data.handle || 'Maker'} · make.fun`;
  settle();
}

async function render() {
  const current = route();
  const token = ++renderToken;
  window.__shotReady = false;
  cleanupBoard?.();
  cleanupBoard = null;

  try {
    if (current.name === 'board') await showBoard(token);
    else if (current.name === 'bounty') await showBounty(token, current.params[0]);
    else if (current.name === 'leaderboard') await showLeaderboard(token, current.params[0]);
    else if (current.name === 'profile') await showProfile(token, current.params[0]);
    else {
      setActiveNav('');
      app.innerHTML = errorView({ status: 404, message: 'The page you followed does not exist.' });
      document.title = 'Not found · make.fun';
      settle();
    }
  } catch (error) {
    if (token !== renderToken) return;
    const slug = current.name === 'leaderboard' || current.name === 'bounty' ? current.params[0] : '';
    app.innerHTML = errorView(error, slug);
    document.title = 'Something went wrong · make.fun';
    settle();
  }
}

window.addEventListener('hashchange', render);
document.addEventListener('click', (event) => {
  if (!event.target.closest?.('.skip-link')) return;
  event.preventDefault();
  app.focus();
});
render();
