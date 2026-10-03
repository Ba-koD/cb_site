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
    await page.goto(`${base}#CHRONUS`, { waitUntil: 'networkidle' });
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
                last: root.querySelector('.d-section:last-of-type').classList.contains('d-synergies'),
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

    await page.locator('#searchInput').fill('');
    await page.evaluate(() => window.ConchBlessing.select('CHRONUS'));
    await page.evaluate(() => { window.testPinnedInput = document.querySelector('#detailPanel [data-synergy-filter]'); });
    await page.locator('.tile[data-key="LIVE_EYE"]').hover();
    await page.locator('.tile[data-key="TYRFING"]').focus();
    assert.equal(await page.locator('#detailPanel').getAttribute('data-key'), 'CHRONUS');
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
    await page.evaluate(() => window.ConchBlessing.select('CHRONUS'));
    const tallPanel = await dimensions('#detailPanel');
    assert.ok(tallPanel.height <= 720 && tallPanel.height < tallPanel.viewport);
    assert.ok(tallPanel.scroll > tallPanel.client);
    await page.evaluate(key => window.ConchBlessing.select(key), shortKey);
    assert.ok((await dimensions('#detailPanel')).height < tallPanel.height);
    await page.setViewportSize({ width: 1280, height: 480 });
    await page.evaluate(() => window.ConchBlessing.select('CHRONUS'));
    assert.ok((await dimensions('#detailPanel')).height < 480);
    await page.setViewportSize({ width: 1280, height: 900 });
    console.log('PASS desktop preview height cap, short-content shrink and short viewport');

    await page.locator('#searchInput').fill('');
    await page.evaluate(() => window.ConchBlessing.select('CHRONUS'));
    await page.locator('#detailPanel [data-synergy-filter]').fill('Monster Manual');
    await page.locator('#detailPanel [data-synergy-filter]').scrollIntoViewIfNeeded();
    fs.mkdirSync('.tmp', { recursive: true });
    await page.screenshot({ path: '.tmp/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.ConchBlessing.select('CHRONUS'));
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
