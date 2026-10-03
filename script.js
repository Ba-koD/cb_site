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
    const GROUPS = [
        { id: 'collectibles', text: 'groupCollectibles', test: item => !isWip(item) && item.type !== 'familiar' && item.type !== 'trinket' },
        { id: 'familiars', text: 'groupFamiliars', test: item => !isWip(item) && item.type === 'familiar' },
        { id: 'trinkets', text: 'groupTrinkets', test: item => !isWip(item) && item.type === 'trinket' },
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

    // ---------- state ----------
    const state = { language: 'auto', detected: 'en', query: '', flag: 'all', pinned: null, preview: null, sheetKey: null };

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
    // A missing sprite (work-in-progress items have none yet) becomes the name's first letter.
    const sprite = (item, size) =>
        `<img class="sprite" src="${escapeHtml(item.gfx || `resources/gfx/items/collectibles/${item.key.toLowerCase()}.png`)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" data-initial="${escapeHtml(Array.from(itemName(item))[0] || '?')}">`;
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
        const ownKey = BY_ENGLISH_NAME[String(raw).toLowerCase()];
        if (ownKey) return { own: BY_KEY[ownKey] };
        const id = ID_LOOKUP[prefix] && ID_LOOKUP[prefix][raw];
        return { label: titleCase(raw), id: id ? `${prefix === 'T' ? 't' : prefix === 'K' ? 'k' : prefix === 'P' ? 'p' : 'c'}${id}` : '' };
    }
    function originOf(item) {
        if (!item.origin) return null;
        const at = item.origin.indexOf(':');
        const prefix = at > 0 ? item.origin.slice(0, at) : 'C';
        return resolveReference(prefix, at > 0 ? item.origin.slice(at + 1) : item.origin);
    }
    const CHILDREN = {};
    for (const item of ITEMS) {
        const origin = originOf(item);
        if (origin && origin.own) (CHILDREN[origin.own.key] = CHILDREN[origin.own.key] || []).push(item);
    }

    function matchesQuery(item) {
        const query = state.query.trim().toLowerCase();
        if (!query) return true;
        const origin = originOf(item);
        const haystack = [
            item.key, item.names && item.names.en, item.names && item.names.kr, localized(item, 'descriptions'),
            origin && (origin.own ? itemName(origin.own) : origin.label), ...effects(item)
        ].join('\n').toLowerCase();
        return haystack.includes(query);
    }
    const matchesFlag = item => state.flag === 'all' || item.flag === state.flag;
    const isVisible = item => matchesQuery(item) && matchesFlag(item);

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
        document.getElementById('languageSelect').value = state.language;
    }

    // ---------- grid ----------
    function renderFlags() {
        const options = ['all', ...FLAGS];
        document.getElementById('flagChips').innerHTML = options.map(flag =>
            `<button type="button" class="chip" data-flag="${flag}" style="--flag:${flagColor(flag)}" aria-pressed="${state.flag === flag}">${escapeHtml(t(flag === 'all' ? 'allFlags' : flag))}</button>`
        ).join('');
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
        const filtering = state.query.trim() || state.flag !== 'all';
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
    const referenceHtml = ref => (ref.own ? itemLink(ref.own)
        : `<span class="node">${escapeHtml(ref.label)}</span>${ref.id ? `<span class="muted">${escapeHtml(ref.id)}</span>` : ''}`);

    function detailHtml(item, synergyQuery) {
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

        const origin = originOf(item);
        const children = CHILDREN[item.key] || [];
        let upgradeHtml = '';
        if (origin) {
            const viaAnswer = !origin.own && item.flag;
            upgradeHtml = `<section class="d-section"><h3>${escapeHtml(t(origin.own ? 'evolvesFrom' : 'upgrade'))}</h3>
                <div class="path">${referenceHtml(origin)}<span class="arrow">→</span>${viaAnswer
                    ? `<span class="badge flag ${escapeHtml(item.flag)}">${escapeHtml(t('answer', { flag: t(item.flag) }))}</span><span class="arrow">→</span>` : ''}<span class="node">${escapeHtml(name)}</span></div>
                ${viaAnswer ? `<p class="path-note">${escapeHtml(t('flagDesc_' + item.flag))}</p>` : ''}</section>`;
        }
        const childrenHtml = children.length
            ? `<section class="d-section"><h3>${escapeHtml(t('evolvesInto'))}</h3><div class="path">${children.map(itemLink).join('')}</div></section>` : '';

        const synergies = Object.entries(item.synergies || {});
        let synergyHtml = '';
        if (synergies.length) {
            const query = (synergyQuery || '').trim().toLowerCase();
            const rows = synergies.map(([key, textByLang]) => {
                const prefix = (item.synergy_types && item.synergy_types[key]) === 'trinket' ? 'T' : 'C';
                const ref = resolveReference(prefix, key);
                const label = ref.own ? itemName(ref.own) : ref.label;
                const body = textByLang[lang()] || textByLang.en || '';
                return { ref, label, body };
            }).filter(row => !query || `${row.label}\n${row.body}`.toLowerCase().includes(query));
            synergyHtml = `<section class="d-section"><h3>${escapeHtml(t('synergies'))} · ${synergies.length}</h3>
                ${synergies.length > 6 ? `<input type="search" class="syn-filter" data-synergy-filter value="${escapeHtml(synergyQuery || '')}" placeholder="${escapeHtml(t('synergyFilter'))}">` : ''}
                <div class="syn-list">${rows.length ? rows.map(row => `<div class="syn"><div class="syn-name">${row.ref.own ? itemLink(row.ref.own)
                    : `${escapeHtml(row.label)}${row.ref.id ? `<span class="muted">${escapeHtml(row.ref.id)}</span>` : ''}`}</div><p>${escapeHtml(row.body)}</p></div>`).join('')
                    : `<p class="path-note">${escapeHtml(t('noSynergyMatch'))}</p>`}</div></section>`;
        }

        const pools = (item.pools || []).map(pool => (typeof pool === 'string' ? pool : Object.keys(pool).find(k => k.startsWith('ROOM_')))).filter(Boolean);
        const facts = [];
        if (pools.length) facts.push([t('pools'), `<div class="mini-chips">${pools.map(pool => `<span class="mini-chip">${escapeHtml((POOL_NAMES[pool] || [titleCase(pool.replace(/^ROOM_/, ''))])[lang() === 'kr' ? 0 : 1] || titleCase(pool.replace(/^ROOM_/, '')))}</span>`).join('')}</div>`]);
        if (item.tags) facts.push([t('tags'), `<div class="mini-chips">${item.tags.split(/\s+/).filter(Boolean).map(tag => `<span class="mini-chip">${escapeHtml(tag)}</span>`).join('')}</div>`]);
        if (item.shopprice) facts.push([t('shopPrice'), `${item.shopprice}¢`]);
        if (item.devilprice) facts.push([t('devilPrice'), '♥'.repeat(Math.max(1, item.devilprice))]);
        if (item.maxcharges) facts.push([t('charges'), String(item.maxcharges)]);
        const factsHtml = facts.length
            ? `<section class="d-section"><h3>${escapeHtml(t('details'))}</h3><dl class="facts">${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${value}</dd>`).join('')}</dl></section>` : '';

        return `${head}
            ${description ? `<p class="d-quote">“${escapeHtml(description)}”</p>` : ''}
            ${effectsHtml}${upgradeHtml}${childrenHtml}${synergyHtml}${factsHtml}
            <div class="d-actions"><button type="button" class="button ghost" data-copy-link="${escapeHtml(item.key)}">${escapeHtml(t('copyLink'))}</button></div>`;
    }

    // Renders an item into the panel or the sheet body, keeping the synergy filter usable.
    function renderDetail(container, key, extraHtml) {
        const item = BY_KEY[key];
        if (!item) { container.innerHTML = ''; return; }
        const draw = synergyQuery => {
            container.innerHTML = detailHtml(item, synergyQuery) + (extraHtml || '');
            const filter = container.querySelector('[data-synergy-filter]');
            if (filter && synergyQuery !== undefined) {
                filter.focus();
                filter.setSelectionRange(filter.value.length, filter.value.length);
            }
            if (filter) filter.addEventListener('input', () => draw(filter.value));
        };
        draw();
    }

    function renderPanel() {
        if (!WIDE.matches) return;
        const key = state.preview || state.pinned;
        const panel = document.getElementById('detailPanel');
        if (panel.dataset.key === key && !panel.dataset.stale) return;
        panel.dataset.key = key || '';
        delete panel.dataset.stale;
        renderDetail(panel, key, `<p class="panel-hint">${escapeHtml(t('hintWide'))}</p>`);
        if (!state.preview) panel.scrollTop = 0;
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
            if (tile) select(tile.dataset.key);
        });
        groups.addEventListener('mouseover', event => {
            if (!WIDE.matches || !HOVER.matches) return;
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
            if (tile && WIDE.matches) { state.preview = tile.dataset.key; renderPanel(); }
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
            if (!WIDE.matches) setHash(null);
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

        window.addEventListener('hashchange', () => {
            const key = decodeURIComponent(location.hash.slice(1));
            if (BY_KEY[key]) select(key);
        });
    }

    function rerenderAll() {
        applyTexts();
        renderFlags();
        renderGroups();
        const panel = document.getElementById('detailPanel');
        panel.dataset.stale = '1';
        renderPanel();
        if (state.sheetKey) renderDetail(document.getElementById('dialogBody'), state.sheetKey);
    }

    // The top bar wraps to two rows on narrow screens; sticky offsets follow its real height.
    function trackTopbarHeight() {
        const topbar = document.querySelector('.topbar');
        const apply = () => document.documentElement.style.setProperty('--topbar-h', `${Math.ceil(topbar.getBoundingClientRect().height)}px`);
        apply();
        if ('ResizeObserver' in window) new ResizeObserver(apply).observe(topbar);
        else window.addEventListener('resize', apply);
    }

    function init() {
        trackTopbarHeight();
        const saved = readStoredLanguage();
        state.language = SUPPORTED_LANGUAGES.includes(saved) ? saved : 'auto';
        state.detected = detectAndSetLanguage();
        const firstItem = ITEMS.find(item => !isWip(item));
        state.pinned = firstItem ? firstItem.key : null;

        bindEvents();
        rerenderAll();

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
