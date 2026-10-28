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

    // Stacking: every collectible and trinket says whether copies stack; runes do not.
    const stacking = await page.evaluate(() => Object.fromEntries(
        ['DRAGON', 'TIME_MONEY', 'KRONOS', 'POWER_TRAINING', 'TIME_POWER', 'ATROPOS', 'ANGELS_CROWN', 'THURISAZ'].map(key => {
            window.ConchBlessing.select(key);
            const label = [...document.querySelectorAll('#detailPanel .facts dt')].find(dt => dt.textContent === '중첩');
            return [key, label ? label.nextElementSibling.textContent : null];
        })));
    assert.deepEqual(stacking, { DRAGON: '중첩 가능', TIME_MONEY: '중첩 가능', KRONOS: '중첩 불가', POWER_TRAINING: '중첩 불가',
        TIME_POWER: '중첩 가능', ATROPOS: '중첩 불가', ANGELS_CROWN: '중첩 가능', THURISAZ: null });
    console.log('PASS stacking fact on collectibles and trinkets (golden/Mom\'s Box count as stacking), none on runes');

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

    // Every item plays the default upgrade animation; only its own presentation counts.
    await page.evaluate(() => window.ConchBlessing.select('LIVE_EYE'));
    assert.equal(await page.locator('#detailPanel .fx-section').isHidden(), true, 'a pending concept is not an own presentation');
    await page.evaluate(() => window.ConchBlessing.select('ANGELS_CROWN'));
    assert.equal(await page.locator('#detailPanel .fx-section h3').textContent(), '전용 강화 연출');
    console.log('PASS own upgrade effect: shown for ANGELS_CROWN, hidden for the pending LIVE_EYE');

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
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
