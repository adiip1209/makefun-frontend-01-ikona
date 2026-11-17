// The four make.fun surfaces, rendered as HTML strings from API data.
import { date, esc, money, timeLeft } from './format.js';

const arrow = '<span class="arrow" aria-hidden="true">→</span>';

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const string = String(value).trim();
  return string || fallback;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value) {
  return number(value).toLocaleString('en-US');
}

function amount(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && !/\d/.test(value)) return esc(value);
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  if (Number.isFinite(parsed)) return money(parsed);
  return typeof value === 'string' ? esc(value) : '—';
}

function parsedTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function day(value, options = {}) {
  const time = parsedTime(value);
  if (time === null) return '—';
  return new Date(time).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC', ...options });
}

function deadlineFor(value) {
  const time = parsedTime(value);
  if (time === null) return { text: 'No deadline listed', left: '', ended: false };
  const left = timeLeft(value);
  return { text: date(value), left: left === 'ended' ? 'Ended' : left, ended: left === 'ended' };
}

function humanize(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function displayLabel(value) {
  if (Array.isArray(value)) return value.map(displayLabel).filter(Boolean).join(', ') || '—';
  if (value && typeof value === 'object') {
    return displayLabel(value.label ?? value.name ?? value.title ?? value.value ?? '—');
  }
  return humanize(value) || '—';
}

function initials(name, handle = '') {
  const source = text(name, text(handle, '?')).replace(/^@/, '');
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function entries(noun, value) {
  const total = number(value);
  const singular = { entries: 'entry', solutions: 'solution', payouts: 'payout' }[noun] || noun;
  return `${count(total)} ${total === 1 ? singular : noun}`;
}

function bountyHref(slug) {
  return slug ? `#/bounty/${encodeURIComponent(slug)}` : '';
}

function leaderboardHref(slug) {
  return slug ? `#/bounty/${encodeURIComponent(slug)}/leaderboard` : '';
}

function profileHref(handle) {
  const clean = text(handle).replace(/^@/, '');
  return clean ? `#/account/${encodeURIComponent(clean)}` : '';
}

function bountyFields(b = {}) {
  const slug = text(b.slug);
  const submissionCount = number(b.submissionCount);
  const deadline = deadlineFor(b.deadline);
  const fee = number(b.entryFeeUsd);
  const potValue = b.potUsd ?? b.rewardAmount;
  const rewardValue = b.rewardAmount;
  return {
    slug,
    title: text(b.title, 'Untitled bounty'),
    summary: text(b.summary),
    description: text(b.description),
    potValue,
    rewardValue,
    fee,
    deadline,
    submissionCount,
    status: humanize(b.status || 'open'),
    href: bountyHref(slug),
    potLabel: b.potUsd === null || b.potUsd === undefined ? 'Reward' : 'Current pot',
  };
}

function bountyCard(b) {
  const item = bountyFields(b);
  const deadlineTime = parsedTime(b.deadline);
  const fee = item.fee > 0
    ? `<span class="fee-tag">${amount(item.fee)} entry fee</span>`
    : '<span class="fee-tag is-free">Free to enter</span>';
  const timeClass = item.deadline.ended ? 'time-left is-ended' : 'time-left';
  const summary = item.summary ? `<p class="card-summary">${esc(item.summary)}</p>` : '';
  return `
    <article class="bounty-card" data-bounty-card
      data-title="${esc(item.title.toLowerCase())}"
      data-deadline="${deadlineTime ?? 0}"
      data-pot="${number(item.potValue)}"
      data-entries="${item.submissionCount}">
      <div class="card-kicker">
        <span class="status-pill"><span class="status-dot" aria-hidden="true"></span>${esc(item.status)}</span>
        <span class="card-entry-count">${entries('entries', item.submissionCount)}</span>
      </div>
      <h2 class="card-title"><a href="${item.href || '#/'}">${esc(item.title)}</a></h2>
      ${summary}
      <div class="card-prize">
        <span class="meta-label">${item.potLabel}</span>
        <span class="prize-amount">${amount(item.potValue)}</span>
      </div>
      <dl class="card-specs">
        <div class="card-spec">
          <dt>Deadline</dt>
          <dd><time datetime="${esc(b.deadline || '')}">${esc(item.deadline.text)}</time><span class="${timeClass}">${esc(item.deadline.left)}</span></dd>
        </div>
        <div class="card-spec">
          <dt>Entries</dt>
          <dd class="spec-number">${count(item.submissionCount)}</dd>
        </div>
      </dl>
      <div class="card-footer">
        ${fee}
        <span class="card-cta">View bounty ${arrow}</span>
      </div>
    </article>`;
}

export function board(data) {
  const items = Array.isArray(data?.items) ? data.items.filter(Boolean) : [];
  const totalPot = items.reduce((sum, bountyItem) => {
    const value = Number(bountyItem?.potUsd ?? bountyItem?.rewardAmount);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const totalEntries = items.reduce((sum, bountyItem) => sum + number(bountyItem?.submissionCount), 0);
  const cards = items.map(bountyCard).join('');

  return `
    <section class="page-hero board-hero" aria-labelledby="board-title">
      <div class="hero-copy">
        <p class="eyebrow">make.fun bounties</p>
        <h1 class="page-title" id="board-title">Open bounties</h1>
        <p class="lede">Build something small, sharp, and useful. Pick a brief, ship your best work, and get paid.</p>
      </div>
      <dl class="hero-stats" aria-label="Board at a glance">
        <div class="stat-tile">
          <dt>Open bounties</dt>
          <dd>${count(items.length)}</dd>
        </div>
        <div class="stat-tile">
          <dt>Combined pot</dt>
          <dd>${amount(totalPot)}</dd>
        </div>
      </dl>
    </section>

    <div class="board-toolbar">
      <div class="search-field">
        <label class="sr-only" for="board-search">Search bounties by title</label>
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4 4"></path>
        </svg>
        <input id="board-search" type="search" placeholder="Search bounties" autocomplete="off" spellcheck="false" aria-controls="bounty-grid" data-board-search>
      </div>
      <div class="sort-field">
        <label for="board-sort">Sort by</label>
        <div class="select-wrap">
          <select id="board-sort" aria-controls="bounty-grid" data-board-sort>
            <option value="deadline">Ending soonest</option>
            <option value="pot">Largest pot</option>
            <option value="entries">Most entries</option>
          </select>
        </div>
      </div>
      <p class="board-count" data-board-count aria-live="polite">${count(items.length)} bounties · ${count(totalEntries)} entries</p>
    </div>

    <div class="bounty-grid" id="bounty-grid" data-bounty-grid>
      ${cards}
    </div>
    <div class="empty-state board-empty" data-board-empty hidden>
      <span class="empty-icon" aria-hidden="true">⌕</span>
      <h2 data-board-empty-title>No bounties match that search</h2>
      <p data-board-empty-copy>Try a shorter phrase, or clear the search to see every open bounty.</p>
      <button class="button button-secondary" type="button" data-board-clear>Clear search</button>
    </div>
  `;
}

function descriptionHtml(description) {
  if (!description) {
    return '<p class="muted-copy">The organizer has not shared a longer brief for this bounty yet.</p>';
  }
  return description
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${esc(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

export function bounty(b) {
  const item = bountyFields(b || {});
  const leaderboard = leaderboardHref(item.slug);
  const rewardRow = item.rewardValue !== null && item.rewardValue !== undefined && amount(item.rewardValue) !== amount(item.potValue)
    ? `<div class="detail-row"><dt>Base reward</dt><dd>${amount(item.rewardValue)}</dd></div>`
    : '';
  const feeRow = item.fee > 0
    ? `<div class="detail-row"><dt>Entry fee</dt><dd>${amount(item.fee)}</dd></div>`
    : '<div class="detail-row"><dt>Entry fee</dt><dd>Free</dd></div>';
  const leaderboardButton = leaderboard
    ? `<a class="button button-primary" href="${leaderboard}">View leaderboard ${arrow}</a>`
    : '';

  return `
    <div class="back-row"><a class="back-link" href="#/">← All bounties</a></div>
    <div class="bounty-layout">
      <section class="bounty-main" aria-labelledby="bounty-title">
        <div class="bounty-heading">
          <div class="kicker-row">
            <span class="status-pill"><span class="status-dot" aria-hidden="true"></span>${esc(item.status)}</span>
            <span class="eyebrow">Bounty brief</span>
          </div>
          <h1 class="page-title" id="bounty-title">${esc(item.title)}</h1>
          ${item.summary ? `<p class="lede">${esc(item.summary)}</p>` : ''}
          <div class="hero-actions">${leaderboardButton}</div>
        </div>
        <section class="content-card" aria-labelledby="brief-title">
          <h2 id="brief-title">The brief</h2>
          <div class="prose">${descriptionHtml(item.description)}</div>
        </section>
      </section>

      <aside class="prize-panel" aria-label="Bounty details">
        <p class="meta-label">${item.potLabel}</p>
        <p class="prize-panel-amount">${amount(item.potValue)}</p>
        <dl class="detail-list">
          ${rewardRow}
          ${feeRow}
          <div class="detail-row detail-deadline">
            <dt>Deadline</dt>
            <dd><time datetime="${esc(b?.deadline || '')}">${esc(item.deadline.text)}</time><span class="${item.deadline.ended ? 'time-left is-ended' : 'time-left'}">${esc(item.deadline.left)}</span></dd>
          </div>
          <div class="detail-row"><dt>Entries</dt><dd>${entries('entries', item.submissionCount)}</dd></div>
        </dl>
        ${leaderboardButton ? `<a class="button button-secondary button-block" href="${leaderboard}">See the rankings ${arrow}</a>` : ''}
      </aside>
    </div>`;
}

function normaliseColumns(columns) {
  if (!Array.isArray(columns) && (!columns || typeof columns !== 'object')) return [];
  const source = Array.isArray(columns)
    ? columns
    : Object.entries(columns).map(([key, value]) => (
      value && typeof value === 'object' ? { key, ...value } : { key, label: typeof value === 'string' ? value : undefined }
    ));
  return source
    .map((column, index) => {
      if (typeof column === 'string') {
        return { key: column, label: humanize(column), format: '' };
      }
      if (!column || typeof column !== 'object') return null;
      const key = text(column.key ?? column.id ?? column.field ?? column.name ?? index);
      if (!key) return null;
      return {
        key,
        label: text(column.label ?? column.title ?? column.header ?? column.name, humanize(key)),
        format: text(column.format ?? column.type).toLowerCase(),
      };
    })
    .filter(Boolean);
}

function valueAt(entry, key) {
  if (!entry || !key) return undefined;
  if (Object.hasOwn(entry, key)) return entry[key];
  if (entry.values && typeof entry.values === 'object' && Object.hasOwn(entry.values, key)) return entry.values[key];
  if (entry.metrics && typeof entry.metrics === 'object' && Object.hasOwn(entry.metrics, key)) return entry.metrics[key];
  return key.split('.').reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), entry);
}

function metricValue(value, column) {
  if (value === null || value === undefined || value === '') return '<span class="muted-value">—</span>';
  if (Array.isArray(value)) {
    return value.length ? value.map((entry) => metricValue(entry, { ...column, format: '' })).join(', ') : '<span class="muted-value">—</span>';
  }
  if (typeof value === 'object') {
    const simple = value.label ?? value.title ?? value.name ?? value.display ?? value.formatted ?? value.value ?? value.count ?? value.total;
    if (simple !== undefined && simple !== null) return metricValue(simple, { ...column, format: '' });
    return '<span class="muted-value">—</span>';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const format = column.format || '';
  const numeric = Number(String(value).replace(/[$,]/g, ''));
  if (format.includes('currency') || format === 'usd' || format === 'money' || format === 'dollar') {
    if (Number.isFinite(numeric)) return amount(numeric);
  }
  if (format.includes('percent') || format === 'pct') {
    if (Number.isFinite(numeric)) return `${numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  }
  if (format.includes('date') || format === 'time') {
    const time = parsedTime(value);
    if (time !== null) return esc(day(time));
  }
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return esc(value);
}

function rankBadge(rank) {
  const numeric = Number(rank);
  const modifier = numeric >= 1 && numeric <= 3 ? ` rank-${numeric}` : '';
  return `<span class="rank-badge${modifier}">${esc(rank ?? '—')}</span>`;
}

export function leaderboard(data, fallbackSlug = '') {
  const contest = data?.competition && typeof data.competition === 'object' ? data.competition : {};
  const slug = text(contest.slug, text(data?.competition_slug, text(fallbackSlug)));
  const title = text(contest.title, 'Leaderboard');
  const summary = text(contest.summary);
  const phase = displayLabel(data?.phase ?? contest.phase);
  const view = displayLabel(data?.view ?? data?.views);
  const entriesList = Array.isArray(data?.entries) ? data.entries.filter(Boolean) : [];
  const columns = normaliseColumns(data?.columns).filter((column) => !['rank', 'handle', 'title'].includes(column.key.toLowerCase()));
  const backHref = bountyHref(slug) || '#/';
  const backLabel = slug ? 'Back to bounty' : 'All bounties';

  const headers = columns.map((column) => `<th scope="col">${esc(column.label)}</th>`).join('');
  const rows = entriesList.map((entry) => {
    const handle = text(entry.handle).replace(/^@/, '');
    const href = profileHref(handle);
    const handleName = handle || 'anonymous';
    const handleMarkup = href
      ? `<a class="handle-link" href="${href}"><span class="mini-avatar" aria-hidden="true">${esc(initials(handle))}</span><span>@${esc(handleName)}</span></a>`
      : `<span class="handle-link"><span class="mini-avatar" aria-hidden="true">?</span><span>Anonymous</span></span>`;
    const cells = columns.map((column) => `<td data-label="${esc(column.label)}">${metricValue(valueAt(entry, column.key), column)}</td>`).join('');
    return `
      <tr>
        <td class="cell-rank" data-label="Rank">${rankBadge(entry.rank)}</td>
        <td class="cell-handle" data-label="Handle">${handleMarkup}</td>
        <td class="cell-title" data-label="Entry">${esc(text(entry.title, 'Untitled entry'))}</td>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <div class="back-row"><a class="back-link" href="${backHref}">← ${esc(backLabel)}</a></div>
    <header class="page-intro" aria-labelledby="leaderboard-title">
      <div>
        <p class="eyebrow">Leaderboard</p>
        <h1 class="page-title" id="leaderboard-title">${esc(title)}</h1>
        ${summary ? `<p class="lede">${esc(summary)}</p>` : ''}
      </div>
      <div class="meta-chips" aria-label="Leaderboard context">
        <span class="meta-chip"><span>Phase</span><strong>${esc(phase)}</strong></span>
        <span class="meta-chip"><span>View</span><strong>${esc(view)}</strong></span>
      </div>
    </header>
    ${data?.metrics_withheld ? `
      <aside class="notice" role="note">
        <span class="notice-icon" aria-hidden="true">i</span>
        <div><strong>Metrics withheld</strong><p>Some judging metrics are hidden for this view. Public rankings remain visible below.</p></div>
      </aside>` : ''}
    ${entriesList.length ? `
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <caption class="sr-only">${esc(title)} leaderboard, ${esc(phase)} phase, ${esc(view)} view</caption>
            <thead><tr><th scope="col" class="rank-col">Rank</th><th scope="col">Handle</th><th scope="col">Title</th>${headers}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>` : `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">◇</span>
        <h2>No ranked entries yet</h2>
        <p>Entries will appear here once this leaderboard has something to show.</p>
        <a class="button button-secondary" href="${bountyHref(slug) || '#/'}">Back to the bounty</a>
      </div>`}
  `;
}

const STAT_LABELS = {
  wins: 'Wins',
  placements: 'Placements',
  podiums: 'Podiums',
  entries: 'Entries',
  submissions: 'Submissions',
  solutions: 'Solutions',
  competitions: 'Competitions',
  bounties: 'Bounties',
  best_rank: 'Best rank',
  bestRank: 'Best rank',
  earnings: 'Earnings',
  earned: 'Earned',
  total_earned: 'Total earned',
  totalEarned: 'Total earned',
  payouts: 'Payouts',
  played: 'Played',
};

function statLabel(key) {
  return STAT_LABELS[key] || humanize(key);
}

function currencyKey(key) {
  return /amount|usd|earn|winning|payout|paid|revenue|balance|prize/i.test(key);
}

function statValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return count(value.length);
  if (typeof value === 'object') {
    const simple = value.total ?? value.amount ?? value.count ?? value.value;
    return simple === null || simple === undefined ? null : statValue(key, simple);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (currencyKey(key)) return amount(value);
    if (/rank/i.test(key)) return `#${value.toLocaleString('en-US')}`;
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (currencyKey(key) && Number.isFinite(Number(value))) return amount(Number(value));
  return esc(value);
}

function recordRows(record) {
  if (!record) return [];
  if (Array.isArray(record)) {
    return record
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const label = text(item.label ?? item.name, 'Stat');
        const value = statValue(label, item.value ?? item.count ?? item.total);
        return value === null ? null : { label, value };
      })
      .filter(Boolean);
  }
  if (typeof record !== 'object') return [{ label: 'Record', value: esc(record) }];
  const preferred = ['wins', 'podiums', 'placements', 'entries', 'solutions', 'competitions', 'best_rank', 'earnings'];
  const keys = [
    ...preferred.filter((key) => Object.hasOwn(record, key)),
    ...Object.keys(record).filter((key) => !preferred.includes(key) && !['id', 'user_id', 'profile_id'].includes(key)),
  ];
  return keys
    .map((key) => {
      const value = statValue(key, record[key]);
      return value === null ? null : { label: statLabel(key), value };
    })
    .filter(Boolean);
}

function avatarUrl(value) {
  const url = text(value);
  if (!url) return '';
  if (/^data:image\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://make.fun${url}`;
  try {
    const parsed = new URL(url, 'https://make.fun');
    if (parsed.protocol === 'https:' && (parsed.hostname === 'make.fun' || parsed.hostname.endsWith('.make.fun'))) {
      return parsed.href;
    }
  } catch {}
  return '';
}

function solutionInfo(solution) {
  if (typeof solution === 'string') {
    return { href: bountyHref(solution), title: humanize(solution), context: '', rank: '', date: '' };
  }
  const value = solution && typeof solution === 'object' ? solution : {};
  const contest = value.competition && typeof value.competition === 'object'
    ? value.competition
    : value.bounty && typeof value.bounty === 'object' ? value.bounty : {};
  const slug = text(
    value.competition_slug ?? value.competitionSlug ?? value.bounty_slug ?? value.bountySlug ?? contest.slug ?? value.slug,
  );
  const contextTitle = text(contest.title ?? value.competition_title ?? value.competitionTitle ?? value.bounty_title ?? value.bountyTitle);
  const title = text(value.title ?? value.name, contextTitle || humanize(slug) || 'Entry');
  return {
    href: bountyHref(slug),
    title,
    context: contextTitle && contextTitle !== title ? contextTitle : '',
    rank: value.rank ?? value.placement ?? '',
    date: value.submitted_at ?? value.created_at ?? value.date ?? '',
  };
}

function payoutInfo(payout) {
  if (typeof payout === 'number' || typeof payout === 'string') {
    return { value: amount(Number(payout)), href: '', title: '', date: '' };
  }
  const value = payout && typeof payout === 'object' ? payout : {};
  const contest = value.competition && typeof value.competition === 'object'
    ? value.competition
    : value.bounty && typeof value.bounty === 'object' ? value.bounty : {};
  const slug = text(
    value.competition_slug ?? value.competitionSlug ?? value.bounty_slug ?? value.bountySlug ?? contest.slug ?? value.slug,
  );
  return {
    value: amount(value.amount ?? value.amountUsd ?? value.amount_usd ?? value.usd ?? value.value ?? value.total),
    href: bountyHref(slug),
    title: text(contest.title ?? value.competition_title ?? value.competitionTitle ?? value.bounty_title ?? value.bountyTitle),
    date: value.paid_at ?? value.created_at ?? value.awarded_at ?? value.date ?? '',
  };
}

export function profile(p) {
  const data = p && typeof p === 'object' ? p : {};
  const handle = text(data.handle).replace(/^@/, '');
  const displayName = text(data.display_name ?? data.displayName ?? data.name, handle || 'Maker');
  const bio = text(data.bio ?? data.description);
  const joined = parsedTime(data.joined_at ?? data.joinedAt ?? data.created_at);
  const solutions = Array.isArray(data.solutions) ? data.solutions.filter(Boolean) : [];
  const payouts = Array.isArray(data.payouts) ? data.payouts.filter(Boolean) : [];
  const image = avatarUrl(data.image ?? data.avatar ?? data.avatar_url ?? data.avatarUrl);
  const avatar = image
    ? `<span class="avatar-initials" aria-hidden="true">${esc(initials(displayName, handle))}</span><img src="${esc(image)}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" data-avatar-image>`
    : `<span class="avatar-initials" aria-hidden="true">${esc(initials(displayName, handle))}</span>`;

  let stats = recordRows(data.record);
  const payoutTotal = payouts.reduce((sum, payout) => {
    const info = payoutInfo(payout);
    const numeric = Number(String(info.value).replace(/[^0-9.-]/g, ''));
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
  if (!stats.length) {
    stats = [
      { label: 'Solutions', value: count(solutions.length) },
      { label: 'Payouts', value: count(payouts.length) },
      { label: 'Earned', value: amount(payoutTotal) },
    ];
  }

  const statMarkup = stats.map((stat) => `<div class="stat-card"><dt>${esc(stat.label)}</dt><dd>${stat.value}</dd></div>`).join('');
  const solutionMarkup = solutions.map((solution) => {
    const info = solutionInfo(solution);
    const rank = info.rank !== '' && info.rank !== null && info.rank !== undefined ? `<span class="rank-inline">#${esc(info.rank)} place</span>` : '';
    const dateText = info.date ? `<span class="row-date">${esc(day(info.date))}</span>` : '';
    const body = `
      <span class="solution-copy">
        <span class="solution-title">${esc(info.title)} ${rank}</span>
        <span class="solution-context">${info.context ? esc(info.context) : 'Bounty entry'}${dateText ? ` · ${dateText}` : ''}</span>
      </span>
      <span class="row-arrow" aria-hidden="true">→</span>`;
    return info.href
      ? `<li><a class="solution-row" href="${info.href}">${body}</a></li>`
      : `<li><div class="solution-row">${body}</div></li>`;
  }).join('');

  const payoutMarkup = payouts.map((payout) => {
    const info = payoutInfo(payout);
    const title = info.title || 'Bounty payout';
    const dateText = info.date ? `<span class="row-date">${esc(day(info.date))}</span>` : '';
    const source = info.href
      ? `<a class="payout-source" href="${info.href}">${esc(title)}</a>`
      : `<span class="payout-source">${esc(title)}</span>`;
    return `<li><div class="payout-row"><span class="payout-amount">${info.value}</span><span class="payout-copy">${source}${dateText}</span></div></li>`;
  }).join('');

  return `
    <div class="back-row"><a class="back-link" href="#/">← All bounties</a></div>
    <section class="profile-hero" aria-labelledby="profile-name">
      <div class="avatar avatar-large" data-avatar>${avatar}</div>
      <div class="profile-copy">
        <p class="eyebrow">Maker profile</p>
        <h1 class="page-title profile-name" id="profile-name">${esc(displayName)}</h1>
        ${handle ? `<p class="profile-handle">@${esc(handle)}</p>` : ''}
        ${bio ? `<p class="profile-bio">${esc(bio)}</p>` : '<p class="muted-copy">This maker has not added a bio yet.</p>'}
        ${joined ? `<p class="joined">Joined <time datetime="${esc(data.joined_at ?? data.joinedAt ?? data.created_at ?? '')}">${esc(day(joined))}</time></p>` : ''}
      </div>
    </section>

    <section class="profile-section" aria-labelledby="record-title">
      <div class="section-heading">
        <div><p class="eyebrow">Track record</p><h2 id="record-title">Results so far</h2></div>
      </div>
      <dl class="stat-grid">${statMarkup}</dl>
    </section>

    <div class="profile-columns">
      <section class="section-card" aria-labelledby="solutions-title">
        <div class="section-heading">
          <h2 id="solutions-title">Solutions</h2>
          <span class="count-chip">${count(solutions.length)}</span>
        </div>
        ${solutions.length ? `<ul class="solution-list">${solutionMarkup}</ul>` : `
          <div class="inline-empty"><p>No solutions yet.</p><span>When this maker enters a bounty, their work will show up here.</span></div>`}
      </section>
      <section class="section-card" aria-labelledby="payouts-title">
        <div class="section-heading">
          <h2 id="payouts-title">Payouts</h2>
          <span class="count-chip">${count(payouts.length)}</span>
        </div>
        ${payouts.length ? `<ul class="payout-list">${payoutMarkup}</ul>` : `
          <div class="inline-empty"><p>No payouts yet.</p><span>Prize money will appear here after a bounty wraps.</span></div>`}
      </section>
    </div>`;
}

/** A stable skeleton that reserves the page's rough height while data loads. */
export function loading(kind = 'board') {
  if (kind === 'bounty' || kind === 'leaderboard' || kind === 'profile') {
    return `
      <div class="skeleton-page" aria-busy="true" aria-label="Loading page">
        <div class="skeleton skeleton-line skeleton-back"></div>
        <div class="skeleton-heading">
          <div class="skeleton skeleton-eyebrow"></div>
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-copy"></div>
        </div>
        <div class="skeleton skeleton-panel"></div>
      </div>`;
  }
  return `
    <div class="skeleton-page" aria-busy="true" aria-label="Loading bounties">
      <div class="skeleton-heading">
        <div class="skeleton skeleton-eyebrow"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-copy"></div>
      </div>
      <div class="skeleton skeleton-toolbar"></div>
      <div class="skeleton-grid">
        ${'<div class="skeleton skeleton-card"></div>'.repeat(6)}
      </div>
    </div>`;
}

/** A friendly, actionable error screen that keeps the hash router usable. */
export function errorView(error, slug = '') {
  const notFound = Number(error?.status) === 404;
  return `
    <div class="error-state">
      <span class="error-mark" aria-hidden="true">${notFound ? '404' : '!'}</span>
      <p class="eyebrow">${notFound ? 'Not found' : 'Something went wrong'}</p>
      <h1 class="page-title">${notFound ? 'That page is not here' : 'We could not load this page'}</h1>
      <p>${esc(error?.message || 'Please check your connection and try again.')}</p>
      <div class="hero-actions">
        <a class="button button-primary" href="#/">Browse all bounties ${arrow}</a>
        ${slug ? `<a class="button button-secondary" href="${bountyHref(slug)}">Back to bounty</a>` : ''}
      </div>
    </div>`;
}
