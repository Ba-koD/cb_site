// Conch's Blessing item codex.
// Wide screens: hovering an icon previews it in the side panel and clicking pins it.
// Narrow screens: tapping an icon opens the detail sheet. #ITEM_KEY links open an item.
'use strict';

(() => {
    const SUPPORTED_LANGUAGES = ['kr', 'en'];
    const LANGUAGE_STORAGE_KEY = 'conch_blessing_language';
    const LANGUAGE_NAMES = { kr: '한국어', en: 'English' };
    const WIDE = window.matchMedia('(min-width: 900px)');
    const HOVER = window.matchMedia('(hover: hover)');
    const FLAGS = ['positive', 'neutral', 'negative'];
    const FLAG_COLORS = { positive: 'var(--pos)', neutral: 'var(--neu)', negative: 'var(--neg)' };

    const POOL_NAMES = {
        ROOM_DEFAULT: ['기본방', 'Default'], ROOM_SHOP: ['상점', 'Shop'], ROOM_ERROR: ['에러방', 'Error Room'],
        ROOM_TREASURE: ['보물방', 'Treasure Room'], ROOM_BOSS: ['보스방', 'Boss Room'], ROOM_MINIBOSS: ['미니보스방', 'Mini-Boss Room'],
        ROOM_SECRET: ['비밀방', 'Secret Room'], ROOM_SUPERSECRET: ['1급 비밀방', 'Super Secret Room'], ROOM_ARCADE: ['아케이드', 'Arcade'],
        ROOM_CURSE: ['저주방', 'Curse Room'], ROOM_CHALLENGE: ['도전방', 'Challenge Room'], ROOM_LIBRARY: ['책방', 'Library'],
        ROOM_SACRIFICE: ['희생방', 'Sacrifice Room'], ROOM_DEVIL: ['악마방', 'Devil Room'], ROOM_ANGEL: ['천사방', 'Angel Room'],
        ROOM_DUNGEON: ['사다리방', 'Crawl Space'], ROOM_BOSSRUSH: ['보스 러시', 'Boss Rush'], ROOM_ISAACS: ['침대방', 'Bedroom'],
        ROOM_BARREN: ['낡은 침대방', 'Barren Bedroom'], ROOM_CHEST: ['금고', 'Vault'], ROOM_DICE: ['주사위방', 'Dice Room'],
        ROOM_BLACK_MARKET: ['블랙 마켓', 'Black Market'], ROOM_GREED_EXIT: ['그리드 탈출방', 'Greed Exit'], ROOM_PLANETARIUM: ['천체관', 'Planetarium'],
        ROOM_TELEPORTER: ['텔레포터방', 'Teleporter Room'], ROOM_TELEPORTER_EXIT: ['텔레포터 출구', 'Teleporter Exit'],
        ROOM_SECRET_EXIT: ['비밀 출구', 'Secret Exit'], ROOM_BLUE: ['블루 키방', 'Blue Room'], ROOM_ULTRASECRET: ['레드 비밀방', 'Ultra Secret Room']
    };

    // ---------- data ----------
    const RAW = (typeof items !== 'undefined' && items) || {};
    const ITEMS = Object.entries(RAW).map(([key, data]) => ({ key, ...data }));
    const BY_KEY = Object.fromEntries(ITEMS.map(item => [item.key, item]));
    const BY_ENGLISH_NAME = {};
    for (const item of ITEMS) {
        if (item.names && item.names.en) BY_ENGLISH_NAME[item.names.en.toLowerCase()] = item.key;
    }
    const isWip = item => item.workingnowflag === true;
    const FX_VIEW = 'fx';
    // Item details show the upgrade presentation in a small embedded player that
    // plays when pressed. Each detail view (desktop panel, mobile sheet) keeps one
    // player for good and only tells it which item to show, so moving between
    // items never reloads the 14 MB page or adds history entries.
    const FX_EMBED = (() => {
        const src = document.getElementById('fxFrame').dataset.src;
        return src + (src.includes('?') ? '&' : '?') + 'embed=1';
    })();
    // Cards and runes are additions to the game, not Magic Conch results.
    const isPocket = item => item.pocket === true;
    const GROUPS = [
        { id: 'collectibles', text: 'groupCollectibles', test: item => !isWip(item) && !isPocket(item) && item.type !== 'familiar' && item.type !== 'trinket' },
        { id: 'familiars', text: 'groupFamiliars', test: item => !isWip(item) && item.type === 'familiar' },
        { id: 'trinkets', text: 'groupTrinkets', test: item => !isWip(item) && item.type === 'trinket' },
        { id: 'pockets', text: 'groupPockets', test: item => !isWip(item) && isPocket(item) },
        { id: 'wip', text: 'groupWip', test: isWip }
    ];

    function buildLookup(pool) {
        const map = Object.create(null);
        if (Array.isArray(pool)) {
            for (const entry of pool) {
                if (Array.isArray(entry) && entry.length >= 2) map[String(entry[1])] = Number(entry[0]);
            }
            return map;
        }
        return pool || map;
    }
    const ID_LOOKUP = {
        C: buildLookup(window.COLLECTIBLE_ID_POOL),
        T: buildLookup(window.TRINKET_ID_POOL),
        K: buildLookup(window.CARD_ID_POOL),
        P: buildLookup(window.PILL_ID_POOL)
    };
    const VANILLA = window.VANILLA_ITEMS || {};
    const VANILLA_BY_ENUM = Object.fromEntries(Object.entries(VANILLA).map(([key, item]) =>
        [`${key.split(':')[0]}:${item.enum}`, item]));
    const normalizeSearch = value => String(value || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

    // ---------- state ----------
    const state = { language: 'auto', detected: 'en', query: '', flag: 'all', filters: {}, pinned: null, preview: null, sheetKey: null };
    const FX_MARK = '<!--fx-->';

    const lang = () => (state.language === 'auto' ? state.detected : state.language);
    const t = (key, vars) => getText(key, lang(), vars);
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const localized = (item, field) => (item[field] && (item[field][lang()] ?? item[field].en)) || '';
    const itemName = item => localized(item, 'names') || item.key;
    const effects = item => {
        const lines = item.eids && (item.eids[lang()] || item.eids.en);
        return Array.isArray(lines) ? lines : [];
    };
    const titleCase = raw => String(raw).toLowerCase().split(/[_\s]+/).filter(Boolean)
        .map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
    const flagColor = flag => FLAG_COLORS[flag] || 'transparent';
    const poolsOf = item => (item.pools || []).map(pool => (typeof pool === 'string' ? pool : Object.keys(pool).find(k => k.startsWith('ROOM_')))).filter(Boolean);
    const poolName = pool => (POOL_NAMES[pool] || [])[lang() === 'kr' ? 0 : 1] || titleCase(pool.replace(/^ROOM_/, ''));
    // A missing sprite (work-in-progress items have none yet) becomes the name's first letter.
    const sprite = (item, size) =>
        `<img class="sprite${item.spriteFrame ? ' sprite-strip' : ''}" src="${escapeHtml(item.gfx || `resources/gfx/items/collectibles/${item.key.toLowerCase()}.png`)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" data-initial="${escapeHtml(Array.from(itemName(item))[0] || '?')}">`;
    document.addEventListener('error', event => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.classList.contains('sprite')) return;
        const fallback = document.createElement('span');
        fallback.className = 'sprite-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = img.dataset.initial || '?';
        const size = img.getBoundingClientRect().width || Number(img.getAttribute('width')) || 32;
        fallback.style.width = fallback.style.height = `${size}px`;
        fallback.style.fontSize = `${Math.round(size * 0.5)}px`;
        img.replaceWith(fallback);
    }, true);

    // A reference such as "C:DEAD_EYE" (origin) or a synergy key: this mod's item, or a vanilla one.
    function resolveReference(prefix, raw) {
        const ownKey = BY_KEY[raw] ? raw : BY_ENGLISH_NAME[String(raw).toLowerCase()];
        if (ownKey) return { own: BY_KEY[ownKey] };
        const vanilla = VANILLA_BY_ENUM[`${prefix}:${raw}`];
        const id = vanilla ? vanilla.id : ID_LOOKUP[prefix] && ID_LOOKUP[prefix][raw];
        const metadata = vanilla || VANILLA[`${prefix}:${id}`];
        return { label: metadata ? itemName(metadata) : titleCase(raw), vanilla: metadata,
            id: id !== undefined ? `${prefix === 'T' ? 't' : prefix === 'K' ? 'k' : prefix === 'P' ? 'p' : 'c'}${id}` : '' };
    }
    function originOf(item) {
        if (!item.origin) return null;
        const at = item.origin.indexOf(':');
        const prefix = at > 0 ? item.origin.slice(0, at) : 'C';
        return resolveReference(prefix, at > 0 ? item.origin.slice(at + 1) : item.origin);
    }
    const CHILDREN = {};
    const EVOLUTION_SOURCES = {};
    for (const item of ITEMS) {
        const origin = originOf(item);
        if (origin && origin.own && FLAGS.includes(item.flag)) (CHILDREN[origin.own.key] = CHILDREN[origin.own.key] || []).push(item);
        for (const route of item.evolutions || []) {
            if (BY_KEY[route.target]) (EVOLUTION_SOURCES[route.target] = EVOLUTION_SOURCES[route.target] || [])
                .push({ source: item, conditions: route.conditions });
        }
    }

    function matchesQuery(item) {
        const query = normalizeSearch(state.query.trim());
        if (!query) return true;
        const origin = originOf(item);
        const haystack = [
            item.key, item.names && item.names.en, item.names && item.names.kr, localized(item, 'descriptions'),
            origin && (origin.own ? Object.values(origin.own.names || {}).join(' ') : origin.label),
            origin && origin.vanilla && Object.values(origin.vanilla.names).join(' '), ...effects(item)
        ].join('\n');
        return normalizeSearch(haystack).includes(query);
    }
    const matchesFlag = item => state.flag === 'all' || item.flag === state.flag;

    // The filter button opens extra conditions. Values chosen in one group widen the
    // match (any of them), except groups marked `every`; groups narrow it (all of them).
    const FILTERS = [
        { id: 'kind', text: 'filterKind', values: ['passive', 'active', 'familiar', 'trinket', 'pocket'],
            label: value => t(value === 'pocket' ? 'groupPockets' : value),
            test: (item, value) => (isPocket(item) ? 'pocket' : item.type) === value },
        { id: 'quality', text: 'filterQuality', values: ['0', '1', '2', '3', '4'],
            label: value => `★${value}`, test: (item, value) => typeof item.quality === 'number' && String(item.quality) === value },
        { id: 'pool', text: 'pools', values: Object.keys(POOL_NAMES), label: poolName, test: (item, value) => poolsOf(item).includes(value) },
        { id: 'stacking', text: 'stacking', values: ['stacks', 'noStack'], label: value => t(value),
            test: (item, value) => typeof item.stackable === 'boolean' && item.stackable === (value === 'stacks') },
        { id: 'feature', text: 'filterFeature', every: true, values: ['fx', 'synergies', 'evolution'], label: value => t(`feature_${value}`),
            test: (item, value) => (value === 'fx' ? Boolean(item.fx)
                : value === 'synergies' ? Object.keys(item.synergies || {}).length > 0
                    : Boolean((item.evolutions || []).length || EVOLUTION_SOURCES[item.key])) }
    ];
    const chosenFilters = group => state.filters[group.id] || [];
    const activeFilterCount = () => FILTERS.reduce((n, group) => n + chosenFilters(group).length, 0);
    const matchesFilters = item => FILTERS.every(group => {
        const chosen = chosenFilters(group);
        if (!chosen.length) return true;
        return group.every ? chosen.every(value => group.test(item, value)) : chosen.some(value => group.test(item, value));
    });
    const isVisible = item => matchesQuery(item) && matchesFlag(item) && matchesFilters(item);

    // ---------- storage ----------
    function readStoredLanguage() {
        try { return localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch (_) { return null; }
    }
    function storeLanguage(value) {
        try { localStorage.setItem(LANGUAGE_STORAGE_KEY, value); } catch (_) { /* private mode */ }
    }

    // ---------- static texts ----------
    function applyTexts() {
        document.documentElement.lang = lang() === 'kr' ? 'ko' : 'en';
        document.title = t('pageTitle');
        document.querySelectorAll('[data-text]').forEach(el => { el.textContent = t(el.dataset.text); });
        document.querySelectorAll('[data-placeholder]').forEach(el => { el.placeholder = t(el.dataset.placeholder); });
        document.getElementById('searchClear').setAttribute('aria-label', t('clearSearch'));
        document.getElementById('dialogClose').setAttribute('aria-label', t('close'));
        // The auto option names the language it detected, so the control reads as a language setting.
        document.getElementById('autoOption').textContent = t('autoDetect', { lang: LANGUAGE_NAMES[state.detected] || state.detected });
        const frame = document.getElementById('fxFrame');
        frame.title = t(frame.dataset.title);
        document.getElementById('languageSelect').value = state.language;
    }

    // ---------- grid ----------
    function renderFlags() {
        const options = ['all', ...FLAGS];
        document.getElementById('flagChips').innerHTML = options.map(flag =>
            `<button type="button" class="chip" data-flag="${flag}" style="--flag:${flagColor(flag)}" aria-pressed="${state.flag === flag}">${escapeHtml(t(flag === 'all' ? 'allFlags' : flag))}</button>`
        ).join('');
    }

    // Each option shows how many items it covers on its own; options no item has are left out.
    function renderFilterPanel() {
        const counted = ITEMS.filter(item => !isWip(item));
        document.getElementById('filterPanel').innerHTML = FILTERS.map(group => {
            const chips = group.values.map(value => ({ value, count: counted.filter(item => group.test(item, value)).length }))
                .filter(option => option.count > 0)
                .map(({ value, count }) => `<button type="button" class="chip" data-filter="${group.id}" data-value="${escapeHtml(value)}" aria-pressed="${chosenFilters(group).includes(value)}">${escapeHtml(group.label(value))}<span class="chip-count">${count}</span></button>`)
                .join('');
            if (!chips) return '';
            return `<fieldset class="filter-group"><legend>${escapeHtml(t(group.text))}${group.every ? ` <small>${escapeHtml(t('filterEvery'))}</small>` : ''}</legend><div class="filter-chips">${chips}</div></fieldset>`;
        }).join('') + `<div class="filter-actions"><button type="button" class="filter-reset" data-filter-reset>${escapeHtml(t('filterReset'))}</button></div>`;
        updateFilterToggle();
    }

    function updateFilterToggle() {
        const toggle = document.getElementById('filterToggle');
        const count = activeFilterCount();
        const badge = document.getElementById('filterBadge');
        badge.hidden = count === 0;
        badge.textContent = String(count);
        toggle.classList.toggle('active', count > 0);
        const label = count ? `${t('filters')} (${count})` : t('filters');
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
    }

    function setFilterPanelOpen(open) {
        document.getElementById('filterPanel').hidden = !open;
        document.getElementById('filterToggle').setAttribute('aria-expanded', String(open));
    }

    function renderGroups() {
        const html = GROUPS.map(group => {
            const list = ITEMS.filter(group.test);
            if (!list.length) return '';
            const tiles = list.map(item => {
                const label = itemName(item);
                return `<button type="button" class="tile${isWip(item) ? ' wip' : ''}${item.flag ? ' has-flag' : ''}" data-key="${escapeHtml(item.key)}" style="--flag:${flagColor(item.flag)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${sprite(item, 64)}${isWip(item) ? '<span class="wip-mark">WIP</span>' : ''}</button>`;
            }).join('');
            return `<section class="group" data-group="${group.id}"><h2 class="group-title">${escapeHtml(t(group.text))} <span>${list.length}</span></h2><div class="icons">${tiles}</div></section>`;
        }).join('');
        document.getElementById('groups').innerHTML = html;
        updateFilters();
        markCurrent();
    }

    // Filters dim tiles in place so the codex layout never jumps around.
    function updateFilters() {
        let visible = 0;
        const counted = ITEMS.filter(item => !isWip(item));
        document.querySelectorAll('.tile').forEach(tile => {
            const item = BY_KEY[tile.dataset.key];
            const show = isVisible(item);
            tile.classList.toggle('dim', !show);
            if (show && !isWip(item)) visible += 1;
        });
        const filtering = state.query.trim() || state.flag !== 'all' || activeFilterCount() > 0;
        document.getElementById('resultCount').textContent = filtering
            ? t('matchCount', { n: visible, total: counted.length })
            : t('itemCount', { n: counted.length });
        document.getElementById('emptyState').hidden = !(filtering && visible === 0);
        document.getElementById('searchClear').hidden = !state.query;
    }

    function markCurrent() {
        const current = WIDE.matches ? state.pinned : state.sheetKey;
        document.querySelectorAll('.tile').forEach(tile => {
            tile.setAttribute('aria-current', tile.dataset.key === current ? 'true' : 'false');
        });
    }

    // ---------- detail ----------
    const stars = quality => (typeof quality === 'number'
        ? `<span class="stars" aria-label="Quality ${quality}">${'★'.repeat(quality)}<i>${'★'.repeat(Math.max(0, 4 - quality))}</i></span>` : '');
    const itemLink = item => `<button type="button" class="link" data-goto="${escapeHtml(item.key)}">${sprite(item, 28)}${escapeHtml(itemName(item))}</button>`;
    const referenceHtml = ref => {
        if (ref.own) return itemLink(ref.own);
        const otherName = ref.vanilla && ref.vanilla.names[lang() === 'kr' ? 'en' : 'kr'];
        const secondary = [otherName !== ref.label ? otherName : '', ref.id].filter(Boolean).join(' · ');
        return `<span class="reference">${ref.vanilla ? sprite(ref.vanilla, 32) : ''}<span class="reference-text"><span class="reference-name">${escapeHtml(ref.label)}</span>
            ${secondary ? `<small>${escapeHtml(secondary)}</small>` : ''}</span></span>`;
    };

    const upgradePath = (origin, target) => `<div class="path">${referenceHtml(origin)}<span class="arrow">→</span>
        <span class="badge flag ${escapeHtml(target.flag)}">${escapeHtml(t('answer', { flag: t(target.flag) }))}</span>
        <span class="arrow">→</span>${itemLink(target)}</div><p class="path-note">${escapeHtml(t('flagDesc_' + target.flag))}</p>`;
    const evolutionPath = (source, target, conditions) => `<div class="path">${itemLink(source)}<span class="arrow">→</span>${itemLink(target)}</div>
        <p class="path-note">${escapeHtml(t('evolutionCondition'))}: ${escapeHtml(conditions[lang()] || conditions.en || '')}</p>`;

    function synergyRows(item) {
        return Object.entries(item.synergies || {}).map(([key, textByLang]) => {
            const prefix = (item.synergy_types && item.synergy_types[key]) === 'trinket' ? 'T' : 'C';
            const ref = resolveReference(prefix, key);
            const body = textByLang[lang()] || textByLang.en || '';
            const names = ref.own ? ref.own.names : ref.vanilla && ref.vanilla.names;
            const search = normalizeSearch([key, ref.id, ...Object.values(names || {}), ...Object.values(textByLang)].join('\n'));
            return `<div class="syn" data-synergy-search="${escapeHtml(search)}"><div class="syn-name">${referenceHtml(ref)}</div><p>${escapeHtml(body)}</p></div>`;
        }).join('');
    }

    function detailHtml(item) {
        const name = itemName(item);
        const otherName = lang() === 'kr' ? item.names && item.names.en : item.names && item.names.kr;
        const description = localized(item, 'descriptions');
        const head = `
            <header class="d-head">
                <div class="d-icon" style="--flag:${flagColor(item.flag)}">${sprite(item, 64)}</div>
                <div class="d-title">
                    <h2>${escapeHtml(name)}</h2>
                    ${otherName && otherName !== name ? `<p class="d-sub">${escapeHtml(otherName)}</p>` : ''}
                    <div class="badges">
                        ${isWip(item) ? `<span class="badge">${escapeHtml(t('wip'))}</span>` : `<span class="badge">${escapeHtml(t(item.type || 'passive'))}</span>`}
                        ${item.flag ? `<span class="badge flag ${escapeHtml(item.flag)}" title="${escapeHtml(t('flagDesc_' + item.flag))}">${escapeHtml(t(item.flag))}</span>` : ''}
                        ${!isWip(item) && item.type !== 'trinket' ? stars(item.quality) : ''}
                    </div>
                </div>
            </header>`;
        if (isWip(item)) {
            return `${head}<p class="d-quote">${escapeHtml(t('wipText'))}</p>`;
        }

        const lines = effects(item);
        const effectsHtml = lines.length
            ? `<section class="d-section"><h3>${escapeHtml(t('effects'))}</h3><ul class="d-effects">${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul></section>` : '';
        const obtainHtml = isPocket(item)
            ? `<section class="d-section d-obtain"><h3>${escapeHtml(t('obtain'))}</h3><p class="path-note">${escapeHtml(t('pocketSource_' + item.type))}</p></section>` : '';

        const origin = originOf(item);
        const children = CHILDREN[item.key] || [];
        let upgradeHtml = '';
        if (origin && FLAGS.includes(item.flag)) {
            upgradeHtml = `<section class="d-section d-upgrade"><h3>${escapeHtml(t('upgrade'))}</h3>${upgradePath(origin, item)}</section>`;
        }
        const childrenHtml = children.length
            ? `<section class="d-section d-upgrade-results"><h3>${escapeHtml(t('upgradeResults'))}</h3>${children.map(child => upgradePath({ own: item }, child)).join('')}</section>` : '';
        const evolutionSources = EVOLUTION_SOURCES[item.key] || [];
        const evolutionTargets = (item.evolutions || []).filter(route => BY_KEY[route.target]);
        const evolutionHtml = (evolutionSources.length
            ? `<section class="d-section d-evolution-from"><h3>${escapeHtml(t('evolvesFrom'))}</h3>${evolutionSources.map(route => evolutionPath(route.source, item, route.conditions)).join('')}</section>` : '')
            + (evolutionTargets.length
                ? `<section class="d-section d-evolution-into"><h3>${escapeHtml(t('evolvesInto'))}</h3>${evolutionTargets.map(route => evolutionPath(item, BY_KEY[route.target], route.conditions)).join('')}</section>` : '');

        const synergies = Object.entries(item.synergies || {});
        let synergyHtml = '';
        if (synergies.length) {
            synergyHtml = `<section class="d-section d-synergies"><h3>${escapeHtml(t('synergies'))} · ${synergies.length}</h3>
                ${synergies.length > 6 ? `<input type="search" class="syn-filter" data-synergy-filter autocomplete="off" spellcheck="false" aria-label="${escapeHtml(t('synergyFilter'))}" placeholder="${escapeHtml(t('synergyFilter'))}">` : ''}
                <div class="syn-list">${synergyRows(item)}<p class="path-note" data-synergy-empty hidden>${escapeHtml(t('noSynergyMatch'))}</p></div></section>`;
        }

        const pools = poolsOf(item);
        const facts = [];
        if (pools.length) facts.push([t('pools'), `<div class="mini-chips">${pools.map(pool => `<span class="mini-chip">${escapeHtml(poolName(pool))}</span>`).join('')}</div>`]);
        if (item.type !== 'trinket' && typeof item.stackable === 'boolean') facts.push([t('stacking'), escapeHtml(t(item.stackable ? 'stacks' : 'noStack'))]);
        if (item.tags) facts.push([t('tags'), `<div class="mini-chips">${item.tags.split(/\s+/).filter(Boolean).map(tag => `<span class="mini-chip">${escapeHtml(tag)}</span>`).join('')}</div>`]);
        if (item.shopprice) facts.push([t('shopPrice'), `${item.shopprice}¢`]);
        if (item.devilprice) facts.push([t('devilPrice'), '♥'.repeat(Math.max(1, item.devilprice))]);
        if (item.maxcharges) facts.push([t('charges'), String(item.maxcharges)]);
        const factsHtml = facts.length
            ? `<section class="d-section"><h3>${escapeHtml(t('details'))}</h3><dl class="facts">${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`).join('')}</dl></section>` : '';

        return `${head}
            ${description ? `<p class="d-quote">“${escapeHtml(description)}”</p>` : ''}
            ${effectsHtml}${obtainHtml}${upgradeHtml}${FX_MARK}${childrenHtml}${evolutionHtml}${factsHtml}
            <div class="d-actions"><button type="button" class="button ghost" data-copy-link="${escapeHtml(item.key)}">${escapeHtml(t('copyLink'))}</button></div>${synergyHtml}`;
    }

    function stopFrame(frame) {
        try { frame.contentWindow?.postMessage({ type: 'conch-upgrade', action: 'stop' }, '*'); } catch (_) { /* not loaded */ }
    }

    // A detail view's parts: the text before and after the player, and the player
    // section itself, which survives every re-render.
    function detailParts(container) {
        const parts = container.fxParts;
        if (parts && parts.top.parentNode === container) return parts;
        const top = document.createElement('div'), bottom = document.createElement('div');
        const fx = document.createElement('section');
        fx.className = 'd-section fx-section';
        fx.hidden = true;
        fx.innerHTML = '<h3></h3><div class="fx-slot"></div><p class="fx-state"></p>';
        container.replaceChildren(top, fx, bottom);
        return (container.fxParts = { top, fx, bottom });
    }

    // Shows the item's presentation in the view's player, creating it the first time.
    function showFx(fx, item) {
        let frame = fx.querySelector('iframe');
        if (!item.fx) {
            fx.hidden = true;
            if (frame) stopFrame(frame);
            return;
        }
        fx.hidden = false;
        fx.querySelector('h3').textContent = t('tabFx');
        fx.querySelector('.fx-state').textContent = t(item.fx === 'applied' ? 'fxApplied' : 'fxPending');
        if (!frame) {
            frame = document.createElement('iframe');
            frame.className = 'fx-mini-frame';
            frame.allow = 'autoplay';
            frame.loading = 'lazy';
            frame.addEventListener('load', () => {
                frame.dataset.loaded = '1';
                if (frame.dataset.key !== frame.dataset.shown) showFxKey(frame);
            });
            frame.dataset.key = frame.dataset.shown = item.key;
            frame.src = `${FX_EMBED}#${encodeURIComponent(item.key)}`;
            fx.querySelector('.fx-slot').append(frame);
        }
        frame.title = t('fxFrameTitle');
        frame.dataset.key = item.key;
        if (frame.dataset.loaded) showFxKey(frame);
    }

    function showFxKey(frame) {
        if (frame.dataset.shown === frame.dataset.key) return;
        frame.dataset.shown = frame.dataset.key;
        try { frame.contentWindow?.postMessage({ type: 'conch-upgrade', action: 'show', key: frame.dataset.key }, '*'); } catch (_) { /* gone */ }
    }

    // Renders an item into the panel or the sheet body, keeping the synergy filter usable.
    function renderDetail(container, key, extraHtml) {
        const item = BY_KEY[key];
        if (!item) { container.innerHTML = ''; return; }
        const parts = detailParts(container);
        const [before, after] = detailHtml(item).split(FX_MARK);
        parts.top.innerHTML = before;
        parts.bottom.innerHTML = after + (extraHtml || '');
        showFx(parts.fx, item);
        const filter = container.querySelector('[data-synergy-filter]');
        if (!filter) return;
        const rows = Array.from(container.querySelectorAll('[data-synergy-search]'));
        const empty = container.querySelector('[data-synergy-empty]');
        let composing = false;
        const applyFilter = () => {
            const terms = normalizeSearch(filter.value).split(' ').filter(Boolean);
            let visible = 0;
            for (const row of rows) {
                row.hidden = !terms.every(term => row.dataset.synergySearch.includes(term));
                if (!row.hidden) visible += 1;
            }
            empty.hidden = visible > 0;
        };
        filter.addEventListener('compositionstart', () => { composing = true; });
        filter.addEventListener('compositionend', () => { composing = false; applyFilter(); });
        filter.addEventListener('input', event => {
            if (!composing && !event.isComposing) applyFilter();
        });
    }

    function renderPanel() {
        if (!WIDE.matches) return;
        const key = state.pinned || state.preview || ITEMS.find(item => !isWip(item))?.key;
        const panel = document.getElementById('detailPanel');
        if (panel.dataset.key === key && !panel.dataset.stale) return;
        panel.dataset.key = key || '';
        delete panel.dataset.stale;
        renderDetail(panel, key, `<p class="panel-hint">${escapeHtml(t('hintWide'))}</p>`);
        panel.scrollTop = 0;
    }

    // ---------- views ----------
    // #fx or #fx/KEY shows the upgrade presentation player; anything else the codex.
    // The 14 MB player loads only the first time the tab opens, and a later item
    // changes only its link fragment, so it never reloads.
    function fxKeyOf(hash) {
        const value = decodeURIComponent(String(hash || '').replace(/^#/, ''));
        if (value !== FX_VIEW && !value.startsWith(FX_VIEW + '/')) return null;
        return value.slice(FX_VIEW.length + 1);
    }
    function showView(view, fxKey) {
        const fx = view === FX_VIEW;
        document.getElementById('codexView').hidden = fx;
        document.getElementById('fxView').hidden = !fx;
        // A hidden player would keep playing its sound.
        if (fx) document.querySelectorAll('.fx-mini-frame').forEach(stopFrame);
        else stopFrame(document.getElementById('fxFrame'));
        document.querySelectorAll('.tab').forEach(tab => {
            if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
        });
        if (!fx) return;
        closeSheet();
        const frame = document.getElementById('fxFrame');
        const target = frame.dataset.src + (fxKey ? `#${encodeURIComponent(fxKey)}` : '');
        if (frame.getAttribute('src') !== target) frame.setAttribute('src', target);
    }
    function route() {
        const fxKey = fxKeyOf(location.hash);
        if (fxKey !== null) { showView(FX_VIEW, fxKey); return true; }
        showView('codex');
        return false;
    }

    // ---------- selection ----------
    function setHash(key) {
        const url = key ? `#${encodeURIComponent(key)}` : `${location.pathname}${location.search}`;
        history.replaceState(null, '', url);
    }

    function openSheet(key) {
        const dialog = document.getElementById('detailDialog');
        state.sheetKey = key;
        renderDetail(document.getElementById('dialogBody'), key);
        document.getElementById('dialogBody').scrollTop = 0;
        if (!dialog.open) dialog.showModal();
        markCurrent();
    }

    function closeSheet() {
        const dialog = document.getElementById('detailDialog');
        if (dialog.open) dialog.close();
    }

    function select(key) {
        if (!BY_KEY[key]) return;
        setHash(key);
        if (WIDE.matches) {
            state.pinned = key;
            state.preview = null;
            renderPanel();
            markCurrent();
        } else {
            openSheet(key);
        }
    }

    // ---------- events ----------
    function bindEvents() {
        const groups = document.getElementById('groups');
        groups.addEventListener('click', event => {
            const tile = event.target.closest('.tile');
            if (!tile) return;
            if (WIDE.matches && state.pinned === tile.dataset.key) {
                state.pinned = null;
                state.preview = tile.dataset.key;
                setHash(null);
                renderPanel();
                markCurrent();
            } else select(tile.dataset.key);
        });
        groups.addEventListener('mouseover', event => {
            if (!WIDE.matches || !HOVER.matches || state.pinned) return;
            const tile = event.target.closest('.tile');
            if (tile && state.preview !== tile.dataset.key) {
                state.preview = tile.dataset.key;
                renderPanel();
            }
        });
        groups.addEventListener('mouseleave', () => {
            if (state.preview) { state.preview = null; renderPanel(); }
        });
        groups.addEventListener('focusin', event => {
            const tile = event.target.closest('.tile');
            if (tile && WIDE.matches && !state.pinned) { state.preview = tile.dataset.key; renderPanel(); }
        });
        groups.addEventListener('focusout', event => {
            if (!groups.contains(event.relatedTarget) && state.preview) { state.preview = null; renderPanel(); }
        });

        // Links inside a detail (origin, evolutions, synergy items) and the copy-link button.
        document.addEventListener('click', event => {
            const goto = event.target.closest('[data-goto]');
            if (goto) { select(goto.dataset.goto); return; }
            const copy = event.target.closest('[data-copy-link]');
            if (copy) {
                const url = `${location.origin}${location.pathname}#${encodeURIComponent(copy.dataset.copyLink)}`;
                const done = () => { copy.textContent = t('linkCopied'); setTimeout(() => { copy.textContent = t('copyLink'); }, 1600); };
                if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => window.prompt(t('copyLink'), url));
                else window.prompt(t('copyLink'), url);
            }
        });

        const dialog = document.getElementById('detailDialog');
        document.getElementById('dialogClose').addEventListener('click', closeSheet);
        dialog.addEventListener('click', event => { if (event.target === dialog) closeSheet(); });
        dialog.addEventListener('close', () => {
            // The close event is queued; another item may already have reopened the sheet.
            if (dialog.open) return;
            state.sheetKey = null;
            document.querySelectorAll('#dialogBody .fx-mini-frame').forEach(stopFrame);
            // Closing the sheet clears an item link, never the upgrade-effects route.
            if (!WIDE.matches && fxKeyOf(location.hash) === null) setHash(null);
            markCurrent();
        });

        const search = document.getElementById('searchInput');
        search.addEventListener('input', () => { state.query = search.value; updateFilters(); });
        document.getElementById('searchClear').addEventListener('click', () => {
            search.value = ''; state.query = ''; updateFilters(); search.focus();
        });
        document.getElementById('flagChips').addEventListener('click', event => {
            const chip = event.target.closest('[data-flag]');
            if (!chip) return;
            state.flag = chip.dataset.flag;
            renderFlags();
            updateFilters();
        });

        const filterToggle = document.getElementById('filterToggle');
        const filterPanel = document.getElementById('filterPanel');
        filterToggle.addEventListener('click', () => setFilterPanelOpen(filterPanel.hidden));
        // Chips change in place, so the pressed button keeps its focus.
        filterPanel.addEventListener('click', event => {
            if (event.target.closest('[data-filter-reset]')) {
                state.filters = {};
                filterPanel.querySelectorAll('[data-filter]').forEach(chip => chip.setAttribute('aria-pressed', 'false'));
            } else {
                const chip = event.target.closest('[data-filter]');
                if (!chip) return;
                const chosen = new Set(state.filters[chip.dataset.filter] || []);
                if (chosen.has(chip.dataset.value)) chosen.delete(chip.dataset.value);
                else chosen.add(chip.dataset.value);
                state.filters[chip.dataset.filter] = [...chosen];
                chip.setAttribute('aria-pressed', String(chosen.has(chip.dataset.value)));
            }
            updateFilterToggle();
            updateFilters();
        });
        filterPanel.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            setFilterPanelOpen(false);
            filterToggle.focus();
        });

        document.getElementById('languageSelect').addEventListener('change', event => {
            state.language = event.target.value;
            if (state.language === 'auto') state.detected = detectAndSetLanguage();
            storeLanguage(state.language);
            rerenderAll();
        });

        // Crossing the breakpoint moves the current item between the sheet and the panel.
        WIDE.addEventListener('change', () => {
            if (WIDE.matches) {
                if (state.sheetKey) state.pinned = state.sheetKey;
                closeSheet();
                document.getElementById('detailPanel').dataset.stale = '1';
                renderPanel();
            }
            markCurrent();
        });

        // A small player reports its height so the frame fits its stage and controls.
        window.addEventListener('message', event => {
            const data = event.data;
            if (!data || data.type !== 'conch-upgrade-size' || !(data.height > 0)) return;
            for (const frame of document.querySelectorAll('.fx-mini-frame')) {
                // The reported height is the page's; the frame's own border comes on top.
                if (frame.contentWindow === event.source) frame.style.height = `${Math.min(Math.ceil(data.height), 1200) + frame.offsetHeight - frame.clientHeight}px`;
            }
        });

        window.addEventListener('hashchange', () => {
            if (route()) return;
            const key = decodeURIComponent(location.hash.slice(1));
            if (BY_KEY[key]) select(key);
        });
    }

    function rerenderAll() {
        applyTexts();
        renderFlags();
        renderFilterPanel();
        renderGroups();
        const panel = document.getElementById('detailPanel');
        panel.dataset.stale = '1';
        renderPanel();
        if (state.sheetKey) renderDetail(document.getElementById('dialogBody'), state.sheetKey);
    }

    // The top bar wraps to two rows on narrow screens; sticky offsets follow its real height.
    function trackTopbarHeight() {
        const topbar = document.querySelector('.topbar');
        let last = '';
        const apply = () => {
            const height = `${Math.ceil(topbar.getBoundingClientRect().height)}px`;
            if (height === last) return;
            last = height;
            document.documentElement.style.setProperty('--topbar-h', height);
        };
        apply();
        // ResizeObserver only reports on rendered frames; the resize event covers viewport changes too.
        if ('ResizeObserver' in window) new ResizeObserver(apply).observe(topbar);
        window.addEventListener('resize', apply);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
    }

    function init() {
        trackTopbarHeight();
        const saved = readStoredLanguage();
        state.language = SUPPORTED_LANGUAGES.includes(saved) ? saved : 'auto';
        state.detected = detectAndSetLanguage();
        bindEvents();
        rerenderAll();

        if (route()) return;
        const hashKey = decodeURIComponent(location.hash.slice(1));
        if (BY_KEY[hashKey]) select(hashKey);
    }

    window.ConchBlessing = {
        getDisplayLanguage: lang,
        select
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
