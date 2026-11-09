// Run against a generated local build or deployed site:
// NODE_PATH=<playwright package directory> node tests/browser.cjs [base URL]
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.argv[2] || 'http://127.0.0.1:8766/';
    await page.goto(`${base}#KRONOS`, { waitUntil: 'networkidle' });
    await page.selectOption('#languageSelect', 'kr');

    async function checkComposition(container) {
        const result = await page.evaluate(selector => {
            const root = document.querySelector(selector);
            const input = root.querySelector('[data-synergy-filter]');
            const rows = [...root.querySelectorAll('[data-synergy-search]')];
            const target = window.VANILLA_ITEMS['C:123'].names.kr;
            const before = rows.filter(row => !row.hidden).length;
            input.focus();
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            input.value = target[0];
            input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
            const whileComposing = rows.filter(row => !row.hidden).length;
            input.value = target;
            input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: target }));
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));
            const after = rows.filter(row => !row.hidden);
            input.setSelectionRange(1, 1);
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return { stable: root.querySelector('[data-synergy-filter]') === input,
                focused: document.activeElement === input, caret: input.selectionStart,
                before, whileComposing, matches: after.map(row => row.textContent), target,
                last: [...root.querySelectorAll('.d-section')].at(-1).classList.contains('d-synergies'),
                img: after[0]?.querySelector('img')?.getAttribute('src') };
        }, container);
        assert.equal(result.stable, true, 'filter input replaced');
        assert.equal(result.focused, true, 'filter focus lost');
        assert.equal(result.caret, 1, 'caret moved while filtering');
        assert.equal(result.before, result.whileComposing, 'filtered during composition');
        assert.equal(result.matches.length, 1, 'Korean item name did not filter exactly');
        assert.ok(result.matches[0].includes(result.target));
        assert.equal(result.last, true, 'synergies are not the last detail section');
        assert.equal(result.img, 'assets/vanilla/collectibles/123.png');
        console.log(`PASS ${container}: Korean composition, stable input/focus/caret, bottom section, vanilla sprite`);
    }

    await checkComposition('#detailPanel');
    const input = page.locator('#detailPanel [data-synergy-filter]');
    await input.fill('Monster Manual');
    assert.equal(await page.locator('#detailPanel .syn:visible').count(), 1);
    await input.fill('not-an-item-xyz');
    assert.equal(await page.locator('#detailPanel .syn:visible').count(), 0);
    assert.equal(await page.locator('#detailPanel [data-synergy-empty]').isVisible(), true);
    await input.fill('');
    assert.ok(await page.locator('#detailPanel .syn:visible').count() > 50);
    console.log('PASS English aliases, no-match message and clearing the filter');
    for (const query of ['플레이어 위치에 고정', 'fixed to player position', '향로   플레이어\n고정']) {
        await input.fill(query);
        const found = await page.locator('#detailPanel .syn:visible').allTextContents();
        assert.ok(found.some(text => text.includes('Censer')), `description query failed: ${query}`);
        if (query.startsWith('향로')) assert.equal(found.length, 1, 'mixed name/description should narrow to Censer');
    }
    await input.fill('');
    console.log('PASS Korean/English synergy descriptions and combined name/description terms');

    // Check every known origin/synergy in the shipped generated mod registry.
    const coverage = await page.evaluate(() => {
        const missing = [];
        const images = new Set();
        let references = 0;
        for (const [key, item] of Object.entries(items)) {
            if (item.workingnowflag) continue;
            window.ConchBlessing.select(key);
            for (const row of document.querySelectorAll('#detailPanel .syn')) {
                references++;
                if (!row.querySelector('img.sprite')) missing.push(`${key}: ${row.textContent}`);
            }
            for (const img of document.querySelectorAll('#detailPanel img.sprite')) images.add(img.src);
            const sections = [...document.querySelectorAll('#detailPanel .d-section')];
            if (item.synergies && Object.keys(item.synergies).length && !sections.at(-1)?.classList.contains('d-synergies')) missing.push(`${key}: order`);
        }
        return { references, missing, images: [...images] };
    });
    assert.deepEqual(coverage.missing, [], 'reference image missing or section out of order');
    const failedImages = await page.evaluate(async paths => {
        const results = await Promise.all(paths.map(src => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(null);
            img.onerror = () => resolve(src);
            img.src = src;
        })));
        return results.filter(Boolean);
    }, coverage.images);
    assert.deepEqual(failedImages, [], 'referenced image failed to load');
    console.log(`PASS ${coverage.references} generated synergy references have images`);
    await page.evaluate(() => window.ConchBlessing.select('LIVE_EYE'));
    assert.ok(await page.locator('#detailPanel .path img[src="assets/vanilla/collectibles/373.png"]').count());
    assert.ok(await page.locator('#detailPanel .path img[src*="live_eye.png"]').count());
    const originName = await page.evaluate(() => window.VANILLA_ITEMS['C:373'].names.kr);
    await page.locator('#searchInput').fill(originName);
    assert.equal(await page.locator('.tile[data-key="LIVE_EYE"]').evaluate(node => node.classList.contains('dim')), false);
    console.log('PASS upgrade source/result sprites and Korean vanilla origin search');

    async function checkRoutes(language) {
        await page.selectOption('#languageSelect', language);
        const routes = await page.evaluate(() => {
            const failures = [];
            let count = 0;
            for (const [sourceKey, source] of Object.entries(items)) {
                for (const route of source.evolutions || []) {
                    count++;
                    const condition = route.conditions[window.ConchBlessing.getDisplayLanguage()] || route.conditions.en;
                    window.ConchBlessing.select(route.target);
                    const from = document.querySelector('#detailPanel .d-evolution-from');
                    const upgrade = document.querySelector('#detailPanel .d-upgrade');
                    if (!from?.textContent.includes(condition)) failures.push(`${route.target}: condition`);
                    if (!upgrade?.querySelector('.badge.flag')) failures.push(`${route.target}: answer`);
                    if (!upgrade?.querySelector(`[data-goto="${sourceKey}"]`)) failures.push(`${route.target}: source`);
                    window.ConchBlessing.select(sourceKey);
                    const into = document.querySelector('#detailPanel .d-evolution-into');
                    const results = document.querySelector('#detailPanel .d-upgrade-results');
                    if (!into?.textContent.includes(condition)) failures.push(`${sourceKey}: condition`);
                    if (!results?.querySelector(`[data-goto="${route.target}"]`)) failures.push(`${sourceKey}: result`);
                }
            }
            window.ConchBlessing.select('A_MINUS');
            if (document.querySelector('#detailPanel .d-evolution-into')) failures.push('downgrade mistaken for evolution');
            return { count, failures };
        });
        assert.equal(routes.count, 4, 'expected sword and Minus evolution routes');
        assert.deepEqual(routes.failures, []);
        console.log(`PASS ${language}: evolution conditions and Magic Conch routes at both ends`);
    }
    await checkRoutes('en');
    await checkRoutes('kr');

    // Cards and runes: their own group, and a note that they are added, not upgraded.
    await page.evaluate(() => window.ConchBlessing.select('THURISAZ'));
    const rune = await page.evaluate(() => ({
        group: document.querySelector('.tile[data-key="THURISAZ"]')?.closest('.group')?.dataset.group,
        badge: document.querySelector('#detailPanel .badges .badge')?.textContent,
        obtain: document.querySelector('#detailPanel .d-obtain')?.textContent || '',
        upgrade: Boolean(document.querySelector('#detailPanel .d-upgrade')),
        effects: document.querySelectorAll('#detailPanel .d-effects li').length,
        img: document.querySelector('#detailPanel .d-icon img')?.getAttribute('src'),
        loaded: document.querySelector('#detailPanel .d-icon img')?.naturalWidth
    }));
    assert.equal(rune.group, 'pockets', 'the rune is not in the rune group');
    assert.equal(rune.badge, '룬');
    assert.ok(rune.obtain.includes('새로 추가된 룬'), 'missing the added-rune note');
    assert.equal(rune.upgrade, false, 'a rune is not a Magic Conch upgrade');
    assert.equal(rune.effects, 3);
    assert.equal(rune.img, 'resources/gfx/items/pockets/thurisaz.png');
    await page.locator('#searchInput').fill('투리사즈');
    assert.equal(await page.locator('.tile[data-key="THURISAZ"]').evaluate(node => node.classList.contains('dim')), false);
    await page.locator('#searchInput').fill('');
    console.log('PASS rune group, added-not-upgraded note, effects, icon and search');

    // Console-only items: their own group, a badge and the console note.
    const consoleItems = await page.evaluate(() => ['INF_D6', 'AZURE_DRAGON'].map(key => {
        window.ConchBlessing.select(key);
        return {
            key,
            group: document.querySelector(`.tile[data-key="${key}"]`)?.closest('.group')?.dataset.group,
            badge: document.querySelector('#detailPanel .badges .badge.console')?.textContent || '',
            obtain: document.querySelector('#detailPanel .d-obtain')?.textContent || ''
        };
    }));
    for (const item of consoleItems) {
        assert.equal(item.group, 'console', `${item.key} is not in the console group`);
        assert.equal(item.badge, '콘솔 전용', `${item.key} has no console badge`);
        assert.ok(item.obtain.includes('디버그 콘솔'), `${item.key} lacks the console note`);
    }
    const consoleGroup = await page.evaluate(() => [...document.querySelectorAll('.group[data-group="console"] .tile')]
        .map(tile => tile.dataset.key).sort().join(','));
    assert.equal(consoleGroup, 'AZURE_DRAGON,INF_D6', 'only console items are in the console group');
    await page.evaluate(() => window.ConchBlessing.select('TYRFING'));
    assert.equal(await page.evaluate(() => document.querySelector('.tile[data-key="TYRFING"]')?.closest('.group')?.dataset.group),
        'collectibles', 'a hidden item that a run can still give stays with the collectibles');
    console.log('PASS console-only group, badge and note; hidden run items stay put');

    // Stacking (more copies) and golden/Mom's Box are separate facts; runes have neither,
    // and only trinkets have the golden one.
    const factOf = (label) => page.evaluate(([label, keys]) => Object.fromEntries(keys.map(key => {
        window.ConchBlessing.select(key);
        const dt = [...document.querySelectorAll('#detailPanel .facts dt')].find(node => node.textContent === label);
        return [key, dt ? dt.nextElementSibling.textContent : null];
    })), [label, ['DRAGON', 'TIME_MONEY', 'KRONOS', 'POWER_TRAINING', 'TIME_POWER', 'ATROPOS', 'ANGELS_CROWN', 'THURISAZ']]);
    assert.deepEqual(await factOf('중첩'), { DRAGON: '중첩 가능', TIME_MONEY: '중첩 가능', KRONOS: '중첩 불가', POWER_TRAINING: '중첩 불가',
        TIME_POWER: '중첩 가능', ATROPOS: '중첩 불가', ANGELS_CROWN: '중첩 불가', THURISAZ: null });
    assert.deepEqual(await factOf('황금·엄마의 상자'), { DRAGON: null, TIME_MONEY: null, KRONOS: null, POWER_TRAINING: null,
        TIME_POWER: '효과 있음', ATROPOS: '효과 없음', ANGELS_CROWN: '효과 있음', THURISAZ: null });
    console.log('PASS stacking and golden/Mom\'s Box are separate facts (golden on trinkets only), none on runes');

    // The golden/Mom's Box section: one row when both do the same, then both together.
    const goldenRows = key => page.evaluate(key => {
        window.ConchBlessing.select(key);
        return [...document.querySelectorAll('#detailPanel .d-golden dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]);
    }, key);
    assert.deepEqual(await goldenRows('ANGELS_CROWN'), [
        ['황금 또는 엄마의 상자', '25% 확률로 축복받은 보물방이 되어 천사방 아이템 1개와 영원한 하트가 추가됩니다.'],
        ['황금 + 엄마의 상자', '33% 확률로 축복받은 보물방이 되어 천사방 아이템 1개와 영원한 하트가 추가됩니다.']]);
    assert.deepEqual(await goldenRows('TIME_POWER'), [
        ['황금 또는 엄마의 상자', '소지 중 초당 공격력이 0.012 증가합니다.'],
        ['황금 + 엄마의 상자', '소지 중 초당 공격력이 0.018 증가합니다.']]);
    assert.deepEqual(await goldenRows('ATROPOS'), []);
    console.log('PASS golden/Mom\'s Box effect section from the EID specials');

    // A quality icon in the EID stands in for its grade, so the effect text keeps the digit.
    await page.evaluate(() => window.ConchBlessing.select('CONCH_PEARL'));
    const pearl = await page.locator('#detailPanel .d-effects li').allTextContents();
    assert.equal(pearl[0], '0/1등급 아이템이 등장하지 않습니다.');
    assert.ok(pearl[1].startsWith('2등급 '), pearl[1]);
    console.log('PASS quality icons keep their grade in effect text');

    // Filter button: values in a group widen, groups narrow, features need all chosen, reset clears.
    const visibleKeys = () => page.evaluate(() => [...document.querySelectorAll('.tile:not(.dim)')].map(tile => tile.dataset.key).sort());
    const expected = predicate => page.evaluate(source => Object.entries(items)
        .filter(([, item]) => !item.workingnowflag && new Function('item', `return ${source}`)(item))
        .map(([key]) => key).sort(), predicate);
    assert.equal(await page.locator('#filterPanel').isHidden(), true, 'filter panel starts closed');
    await page.locator('#filterToggle').click();
    assert.equal(await page.locator('#filterToggle').getAttribute('aria-expanded'), 'true');
    const chip = (group, value) => page.locator(`#filterPanel [data-filter="${group}"][data-value="${value}"]`);
    await chip('kind', 'familiar').click();
    assert.deepEqual(await visibleKeys(), await expected("item.type === 'familiar'"));
    await chip('kind', 'active').click();
    assert.deepEqual(await visibleKeys(), await expected("item.type === 'familiar' || item.type === 'active'"));
    await chip('stacking', 'noStack').click();
    assert.deepEqual(await visibleKeys(), await expected("(item.type === 'familiar' || item.type === 'active') && item.stackable === false"));
    assert.equal(await chip('stacking', 'goldenOnly').count(), 0, 'golden-only is not a separate stacking value');
    await chip('stacking', 'noStack').click();
    await chip('stacking', 'stacks').click();
    await chip('kind', 'trinket').click();
    assert.deepEqual(await visibleKeys(), await expected("['familiar', 'active', 'trinket'].includes(item.type) && item.stackable === true"));
    await chip('stacking', 'stacks').click();
    await chip('stacking', 'noStack').click();
    await chip('kind', 'trinket').click();
    assert.equal(await page.locator('#filterBadge').textContent(), '3');
    await page.locator('#filterPanel [data-filter-reset]').click();
    await chip('golden', 'goldenNo').click();
    assert.deepEqual(await visibleKeys(), await expected("item.type === 'trinket' && Object.keys(item.golden || {}).length === 0"));
    await chip('stacking', 'noStack').click();
    await chip('golden', 'goldenNo').click();
    await chip('golden', 'goldenYes').click();
    assert.deepEqual(await visibleKeys(), ['ANGELS_CROWN'], 'golden/Mom\'s Box without stacking');
    await chip('golden', 'goldenYes').click();
    await chip('kind', 'familiar').click();
    await chip('kind', 'active').click();
    assert.equal(await page.locator('#filterBadge').textContent(), '3');
    await page.locator('#filterPanel [data-filter-reset]').click();
    assert.equal(await page.locator('#filterBadge').isHidden(), true, 'badge stays after reset');
    assert.equal((await visibleKeys()).length, await page.evaluate(() => Object.values(items).length));
    await chip('feature', 'fx').click();
    await chip('feature', 'synergies').click();
    assert.deepEqual(await visibleKeys(), await expected("item.fx === 'applied' && Object.keys(item.synergies || {}).length > 0"));
    await chip('feature', 'fx').click();
    await chip('feature', 'synergies').click();
    await chip('pool', 'ROOM_ANGEL').click();
    await chip('quality', '4').click();
    assert.deepEqual(await visibleKeys(), await expected("(item.pools || []).some(pool => pool === 'ROOM_ANGEL' || pool.ROOM_ANGEL) && item.quality === 4"));
    assert.ok((await page.locator('#resultCount').textContent()).includes('일치'), 'count should report a filtered match');
    await page.locator('#filterPanel [data-filter-reset]').click();
    await page.locator('#filterPanel').press('Escape');
    assert.equal(await page.locator('#filterPanel').isHidden(), true, 'Escape closes the panel');
    console.log('PASS filter panel: OR within a group, AND across groups and features, badge, reset, Escape');

    // Details show what the game plays: an item's own presentation, else its flag's default.
    await page.evaluate(() => window.ConchBlessing.select('LIVE_EYE'));
    assert.equal(await page.locator('#detailPanel .fx-section h3').textContent(), '기본 강화 연출');
    assert.ok((await page.locator('#detailPanel .fx-mini-frame').getAttribute('src')).includes('ingame'),
        'the player shows the in-game presentation, never a concept');
    await page.evaluate(() => window.ConchBlessing.select('ANGELS_CROWN'));
    assert.equal(await page.locator('#detailPanel .fx-section h3').textContent(), '전용 강화 연출');
    await page.evaluate(() => window.ConchBlessing.select('RAT'));
    assert.equal(await page.locator('#detailPanel .fx-section h3').textContent(), '기본 강화 연출');
    assert.equal(await page.evaluate(() => items.THURISAZ.fx), undefined, 'cards and runes have no upgrade effect');
    console.log('PASS upgrade effect: own for ANGELS_CROWN, default for LIVE_EYE and RAT, none for runes');

    await page.locator('#searchInput').fill('');
    await page.evaluate(() => window.ConchBlessing.select('KRONOS'));
    await page.evaluate(() => { window.testPinnedInput = document.querySelector('#detailPanel [data-synergy-filter]'); });
    await page.locator('.tile[data-key="LIVE_EYE"]').hover();
    await page.locator('.tile[data-key="TYRFING"]').focus();
    assert.equal(await page.locator('#detailPanel').getAttribute('data-key'), 'KRONOS');
    assert.equal(await page.evaluate(() => window.testPinnedInput === document.querySelector('#detailPanel [data-synergy-filter]')), true);
    await page.locator('.tile[data-key="LIVE_EYE"]').click();
    await page.locator('.tile[data-key="TYRFING"]').hover();
    assert.equal(await page.locator('#detailPanel').getAttribute('data-key'), 'LIVE_EYE');
    await page.locator('.tile[data-key="LIVE_EYE"]').click();
    await page.locator('.tile[data-key="TYRFING"]').hover();
    assert.equal(await page.locator('#detailPanel').getAttribute('data-key'), 'TYRFING');
    console.log('PASS pin wins over hover/focus, another click changes pin, unpin restores previews');

    async function dimensions(selector) {
        return page.locator(selector).evaluate(node => ({ height: node.getBoundingClientRect().height,
            client: node.clientHeight, scroll: node.scrollHeight, viewport: window.innerHeight }));
    }
    const shortKey = await page.evaluate(() => Object.entries(items).find(([, item]) => item.workingnowflag)[0]);
    await page.evaluate(() => window.ConchBlessing.select('KRONOS'));
    const tallPanel = await dimensions('#detailPanel');
    assert.ok(tallPanel.height <= 720 && tallPanel.height < tallPanel.viewport);
    assert.ok(tallPanel.scroll > tallPanel.client);
    await page.evaluate(key => window.ConchBlessing.select(key), shortKey);
    assert.ok((await dimensions('#detailPanel')).height < tallPanel.height);
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.evaluate(() => window.ConchBlessing.select('KRONOS'));
    assert.ok((await dimensions('#detailPanel')).height < 480);
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log('PASS desktop preview height cap, short-content shrink and short viewport');

    await page.locator('#searchInput').fill('');
    await page.evaluate(() => window.ConchBlessing.select('KRONOS'));
    await page.locator('#detailPanel [data-synergy-filter]').fill('Monster Manual');
    await page.locator('#detailPanel [data-synergy-filter]').scrollIntoViewIfNeeded();
    fs.mkdirSync('.tmp', { recursive: true });
    await page.screenshot({ path: '.tmp/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.ConchBlessing.select('KRONOS'));
    await checkComposition('#dialogBody');
    const tallSheet = await dimensions('#detailDialog');
    const sheetBody = await dimensions('#dialogBody');
    assert.ok(tallSheet.height <= 720 && tallSheet.height < tallSheet.viewport);
    assert.ok(sheetBody.scroll > sheetBody.client, 'sheet must scroll internally');
    await page.locator('#dialogBody [data-synergy-filter]').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '.tmp/mobile.png' });
    await page.evaluate(key => window.ConchBlessing.select(key), shortKey);
    assert.ok((await dimensions('#detailDialog')).height < tallSheet.height, 'short mobile details should shrink');
    assert.deepEqual(errors, [], 'browser runtime errors');
    console.log('PASS desktop/mobile layout and no browser errors');

    // Item pages written by prerender.cjs: the item and its text are in the HTML itself,
    // the page's language is the auto choice there, and the codex takes over as usual.
    const seoPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    seoPage.on('pageerror', error => errors.push(error.message));
    const raw = await (await seoPage.request.get(`${base}items/kronos/`)).text();
    assert.ok(raw.includes('<link rel="canonical" href="https://') && raw.includes('/items/kronos/"'), 'canonical link');
    assert.ok(raw.includes('<html lang="ko" data-page-lang="kr" data-page-item="KRONOS">'));
    assert.ok(raw.includes('<h1>크로노스</h1>') && raw.includes('href="items/live-eye/"'), 'item detail (as the h1) and tile links in the HTML');
    await seoPage.goto(`${base}items/kronos/`, { waitUntil: 'networkidle' });
    assert.equal(await seoPage.title(), '크로노스 (Kronos) | 소라고둥의 축복 - 아이템 도감');
    assert.equal(await seoPage.locator('#detailPanel h1').textContent(), '크로노스');
    assert.equal(new URL(seoPage.url()).pathname, '/items/kronos/', 'opening the page item keeps the address');
    // Phone width (how search engines read pages): the item is the top of the page,
    // visible without the sheet, and the title stays the item's.
    await seoPage.setViewportSize({ width: 390, height: 844 });
    await seoPage.reload({ waitUntil: 'networkidle' });
    assert.equal(await seoPage.locator('#detailDialog').evaluate(node => node.open), false, 'no sheet on load');
    assert.ok(await seoPage.locator('#detailPanel h1').isVisible(), 'page item visible at phone width');
    assert.ok(await seoPage.evaluate(() => document.getElementById('detailPanel').getBoundingClientRect().top
        < document.querySelector('.codex').getBoundingClientRect().top), 'page item above the tiles');
    assert.equal(await seoPage.title(), '크로노스 (Kronos) | 소라고둥의 축복 - 아이템 도감');
    assert.equal(await seoPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await seoPage.locator('.tile[data-key="LIVE_EYE"]').click();
    assert.equal(await seoPage.locator('#dialogBody h2').textContent(), '살아있는 눈', 'other items open in the sheet');
    await seoPage.locator('#dialogClose').click();
    assert.equal(await seoPage.title(), '크로노스 (Kronos) | 소라고둥의 축복 - 아이템 도감', 'closing the sheet returns to the page item');
    await seoPage.setViewportSize({ width: 1280, height: 900 });
    await seoPage.goto(`${base}en/items/f-minus/`, { waitUntil: 'networkidle' });
    assert.equal(await seoPage.locator('#detailPanel h1').textContent(), 'F -');
    const evolution = seoPage.locator('#detailPanel a.link[data-goto="C_MINUS"]').first();
    assert.equal(await evolution.getAttribute('href'), 'en/items/c-minus/');
    await evolution.click();
    assert.equal(await seoPage.locator('#detailPanel h2').textContent(), 'C -', 'a plain click selects in place');
    assert.ok((await seoPage.title()).startsWith('C - | Conch'));
    for (const file of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'en/llms-full.txt', 'favicon-192.png']) {
        assert.equal((await seoPage.request.get(`${base}${file}`)).status(), 200, file);
    }
    assert.deepEqual(errors, [], 'browser runtime errors on item pages');
    console.log('PASS item pages: HTML content, page language, in-place links, robots.txt and sitemap.xml');
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
