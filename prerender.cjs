#!/usr/bin/env node
// Writes what search engines read, into an assembled site folder (default build/):
//   index.html               the codex in Korean with its tiles and first item already in the HTML
//   en/index.html            the same home page in English
//   items/<slug>/index.html  each item's own page, Korean
//   en/items/<slug>/...      the same page in English
// Every page's language is fixed by its address (data-page-lang on <html>); ko and en
// alternates link each page to the other, with English as x-default.
//   sitemap.xml, robots.txt  and any verification files from verification/
//   llms.txt, llms-full.txt  every item as plain text for AI assistants (English under en/)
// The pages are the codex itself: script.js runs here with stub globals and draws the
// same markup it draws in the browser, and on load it takes over the page as usual.
// Search engines also learn which pages changed: page-state.json keeps each sitemap
// page's content fingerprint and the day it last changed. Given the live site's copy
// (--previous), a page whose content is unchanged keeps its date, which becomes its
// sitemap <lastmod>, and --changed lists the pages that did change, which the Pages
// workflow sends to IndexNow (Bing, which ChatGPT search reads, Naver, Yandex...)
// after deploying, with the key file written from seo.json's indexNowKey.
// Usage: node prerender.cjs [site folder] [--previous page-state.json] [--changed changed.txt]
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
// node prerender.cjs [site folder] [--previous page-state.json] [--changed changed.txt]
const ARGS = (() => {
    const args = { site: null, previous: null, changed: null };
    const rest = process.argv.slice(2);
    for (let i = 0; i < rest.length; i++) {
        const flag = rest[i];
        if (flag === '--previous' || flag === '--changed') {
            if (!rest[i + 1]) { console.error(`prerender: ${flag} needs a file`); process.exit(1); }
            args[flag.slice(2)] = rest[++i];
        } else if (!flag.startsWith('--') && !args.site) args.site = flag;
        else { console.error(`prerender: unknown argument ${flag}`); process.exit(1); }
    }
    return args;
})();
const SITE = path.resolve(ARGS.site || path.join(ROOT, 'build'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const ORIGIN = String(config.origin || '').replace(/\/+$/, '');
// kr is the site's language key; ko is the HTML/hreflang code. base takes an item page
// back to the site root, homeBase the home page.
const LANGUAGES = {
    kr: { html: 'ko', og: 'ko_KR', dir: '', base: '../../', homeBase: '' },
    en: { html: 'en', og: 'en_US', dir: 'en/', base: '../../../', homeBase: '../' }
};
const SEO_START = '<!-- seo: prerender.cjs replaces this block on every built page -->';
const SEO_END = '<!-- /seo -->';

function fail(message) {
    console.error(`prerender: ${message}`);
    process.exit(1);
}
if (!/^https:\/\/[^/]+$/.test(ORIGIN)) fail(`seo.json origin must be like https://example.com, got "${config.origin}"`);

// ---------- the codex, in a sandbox ----------
const frameStub = { dataset: { src: 'upgrade-player.html' } };
const sandbox = {
    CB_PRERENDER: {},
    console,
    navigator: { languages: ['ko-KR'], language: 'ko-KR' },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    document: {
        readyState: 'complete',
        documentElement: { dataset: {} },
        getElementById: () => frameStub,
        querySelectorAll: () => [],
        addEventListener() {}
    }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['texts.js', 'items.js', 'itemmap.js', 'vanilla_items.js', 'script.js']) {
    const source = path.join(SITE, file);
    if (!fs.existsSync(source)) fail(`missing ${source}; assemble the site first`);
    vm.runInContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: file });
}
const codex = sandbox.CB_PRERENDER;
if (typeof codex.detailHtml !== 'function') fail('script.js did not hand over its render functions');
if (!codex.ITEMS.length) fail('items.js has no items');

// ---------- helpers ----------
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key, vars) => codex.t(key, vars);
const pageUrl = (item, language) => `${ORIGIN}/${LANGUAGES[language].dir}items/${codex.itemSlug(item.key)}/`;
const homeUrl = language => `${ORIGIN}/${LANGUAGES[language].dir}`;
const indexable = item => !codex.isWip(item);

// Search results show about 150 characters; cut at a word where there is one.
function clip(text, max = 160) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·(]+$/, '')}…`;
}

// "패시브" etc.; a type the texts do not name (a tarot card) reads as a card.
function kindOf(item) {
    const label = t(item.type);
    if (item.type && label !== item.type) return label;
    return t(codex.isPocket(item) ? 'card' : 'passive');
}

// EID lines often end without a full stop; joined into one sentence run they need one.
const sentence = line => (/[.!?…。)\]]$/.test(line.trim()) ? line.trim() : `${line.trim()}.`);

// "티르핑 (Tyrfing): 아이작의 번제 모드 소라고둥의 축복의 패시브 아이템. “인용문” 효과…":
// the definition comes first and stays whole (no 은/는 after the name, which would depend
// on it); only the item's own words, its quote and effects, are shortened to fit 160.
function itemDescription(item) {
    const quote = codex.localized(item, 'descriptions');
    const body = codex.isWip(item) ? t('wipText') : codex.effects(item).filter(line => line.trim()).map(sentence).join(' ');
    const text = [quote ? `“${quote}”` : '', body].filter(Boolean).join(' ');
    const frame = t('metaItem', { name: codex.itemLabel(item), kind: kindOf(item), text: '\u0000' });
    return frame.replace('\u0000', clip(text, 160 - (frame.length - 1))).trim();
}

// <script> content: a "</script>" inside the data must not end the element.
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function headBlock(page) {
    const lines = [];
    if (page.base) lines.push(`<base href="${page.base}">`);
    lines.push(`<title>${escapeHtml(page.title)}</title>`);
    lines.push(`<meta name="description" content="${escapeHtml(page.description)}">`);
    if (page.noindex) lines.push('<meta name="robots" content="noindex">');
    lines.push(`<link rel="canonical" href="${escapeHtml(page.url)}">`);
    for (const [hreflang, href] of page.alternates || []) {
        lines.push(`<link rel="alternate" hreflang="${hreflang}" href="${escapeHtml(href)}">`);
    }
    const og = LANGUAGES[page.language].og;
    lines.push(
        '<meta property="og:type" content="website">',
        `<meta property="og:site_name" content="${escapeHtml(t('siteName'))}">`,
        `<meta property="og:title" content="${escapeHtml(page.title)}">`,
        `<meta property="og:description" content="${escapeHtml(page.description)}">`,
        `<meta property="og:url" content="${escapeHtml(page.url)}">`,
        `<meta property="og:locale" content="${og}">`
    );
    for (const other of Object.values(LANGUAGES)) {
        if (other.og !== og) lines.push(`<meta property="og:locale:alternate" content="${other.og}">`);
    }
    if (page.image) lines.push(`<meta property="og:image" content="${escapeHtml(page.image)}">`);
    lines.push('<meta name="twitter:card" content="summary">');
    if (page.textIndex) lines.push(`<link rel="alternate" type="text/plain" href="${escapeHtml(`${ORIGIN}/llms.txt`)}" title="llms.txt">`);
    for (const [name, content] of Object.entries(page.verification || {})) {
        if (content) lines.push(`<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`);
    }
    if (page.structured) lines.push(jsonLd(page.structured));
    return lines.map(line => `    ${line}`).join('\n');
}

// Each pattern must match exactly once, so a changed index.html fails the build
// instead of quietly losing a page's content.
function replaceOnce(html, pattern, replacement, what) {
    const matches = html.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`));
    if (!matches || matches.length !== 1) fail(`index.html: expected one ${what}, found ${matches ? matches.length : 0}`);
    return html.replace(pattern, replacement);
}

const TEMPLATE = (() => {
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    if (html.includes('data-page-item') || html.includes('rel="canonical"')) fail('index.html is already prerendered; assemble a fresh site folder');
    if (html.includes('__BUILD__')) fail('index.html still has a __BUILD__ placeholder');
    const start = html.indexOf(SEO_START), end = html.indexOf(SEO_END);
    if (start < 0 || end < start) fail('index.html lost its <!-- seo --> block markers');
    return { before: html.slice(0, start), after: html.slice(end + SEO_END.length) };
})();

function renderPage(page) {
    let html = `${TEMPLATE.before}${SEO_START}\n${headBlock(page)}\n    ${SEO_END}${TEMPLATE.after}`;
    // The address fixes the page's language, the home pages' too: search engines read
    // with an English browser, so a language picked from the browser would index / in English.
    const pageAttributes = ` data-page-lang="${page.language}"${page.item ? ` data-page-item="${escapeHtml(page.item.key)}"` : ''}`;
    html = replaceOnce(html, /<html lang="[^"]*">/, `<html lang="${LANGUAGES[page.language].html}"${pageAttributes}>`, '<html lang>');
    // Links stay in the page's language: the logo and the tabs lead to this language's home
    // page. Only the home pages make the logo their h1; an item page's h1 is its item.
    const home = codex.homeHref(page.language);
    html = replaceOnce(html, /<a class="brand" href="[^"]*">([^]*?)<\/a>/, (_, inner) => {
        const link = `<a class="brand" href="${home}">${inner}</a>`;
        return page.item ? link : `<h1 class="brand-title">${link}</h1>`;
    }, 'logo link');
    const tabs = html.match(/<a class="tab" href="[^"]*" data-view="(codex|fx)"/g) || [];
    if (tabs.length !== 2) fail(`index.html: expected the codex and fx tabs, found ${tabs.length}`);
    html = html.replace(/(<a class="tab" href=")[^"]*(" data-view="(codex|fx)")/g,
        (_, open, close, view) => `${open}${home}#${view === 'fx' ? 'fx' : ''}${close}`);
    // Static texts the script would fill in.
    html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-text="([^"]+)"[^>]*>)[^<]*(<\/\2>)/gi,
        (_, open, tag, key, close) => `${open}${escapeHtml(t(key))}${close}`);
    html = html.replace(/(<[a-z0-9]+\b[^>]*\bdata-placeholder="([^"]+)")/gi,
        (_, open, key) => `${open} placeholder="${escapeHtml(t(key))}"`);
    // The auto choice follows the page's language and names it.
    html = replaceOnce(html, /(<option value="auto" id="autoOption">)[^<]*(<\/option>)/,
        `$1${escapeHtml(t('autoDetect', { lang: page.language === 'kr' ? '한국어' : 'English' }))}$2`, 'auto language option');
    const counted = codex.ITEMS.filter(indexable).length;
    html = replaceOnce(html, /(<p class="count" id="resultCount"[^>]*>)(<\/p>)/, `$1${escapeHtml(t('itemCount', { n: counted }))}$2`, 'result count');
    html = replaceOnce(html, /(<div id="groups">)(<\/div>)/, () => `<div id="groups">${codex.groupsHtml(true)}</div>`, 'item groups');
    html = replaceOnce(html, /(<div class="flags" id="flagChips" role="group">)(<\/div>)/, (_, open, close) => `${open}${codex.flagsHtml()}${close}`, 'flag chips');
    const shown = page.item || codex.ITEMS.find(item => item.key === codex.defaultKey());
    // An item page's own item is its h1; narrow screens show it at the top of the page.
    const detail = shown ? `${codex.detailHtml(shown, page.item ? 'h1' : 'h2')}<p class="panel-hint">${escapeHtml(t('hintWide'))}</p>` : '';
    html = replaceOnce(html, /(<aside class="panel" id="detailPanel"[^>]*>)(<\/aside>)/, (_, open, close) => `${open}${detail}${close}`, 'detail panel');
    // The home page's tiles are pictures; tools that read it as text find every item here.
    // Item pages leave it empty, as the script does, so they do not all repeat the list.
    const catalog = page.item ? '' : codex.catalogHtml(false);
    html = replaceOnce(html, /(<div id="catalog">)(<\/div>)/, (_, open, close) => `${open}${catalog}${close}`, 'text list');
    // What the page says, for telling search engines which pages changed (see below):
    // its head and its own content, not the tiles every page shares or the build ID.
    const content = [headBlock(page), page.item ? detail : catalog].join('\n');
    return { html, fingerprint: crypto.createHash('sha256').update(content).digest('hex').slice(0, 20) };
}

// ---------- text files for AI assistants ----------
// llms.txt (https://llmstxt.org) lists the items with links; llms-full.txt (Korean) and
// en/llms-full.txt hold every item's whole detail, so an assistant that reads one file
// can answer about any item. Both come from script.js's itemText, like the pages.
const SITE_NAMES = { kr: '소라고둥의 축복', en: "Conch's Blessing" };
const LANGUAGE_NAMES = { kr: '한국어', en: 'English' };
const LINKS = (() => {
    const html = TEMPLATE.before + TEMPLATE.after;
    const matchOnce = (pattern, what) => {
        const matches = [...html.matchAll(new RegExp(pattern.source, 'g'))];
        if (matches.length !== 1) fail(`index.html: expected one ${what}, found ${matches.length}`);
        return matches[0];
    };
    const workshop = matchOnce(/<a class="button" href="([^"]+)"[^>]*data-text="workshop"/, 'Workshop link');
    const required = matchOnce(/data-text="required"[^]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/, 'required mod link');
    return { workshop: workshop[1], required: { url: required[1], name: required[2].trim() } };
})();
const fullTextUrl = language => `${ORIGIN}/${LANGUAGES[language].dir}llms-full.txt`;
const metaLine = text => [text.kind, text.quality !== null ? `${t('filterQuality')} ${text.quality}` : ''].filter(Boolean).join(' · ');

function itemMarkdown(item, language) {
    const text = codex.itemText(item);
    const out = [`### ${text.name}${text.otherName ? ` (${text.otherName})` : ''}`, '', `${metaLine(text)} · ${t('itemPage')}: ${pageUrl(item, language)}`];
    if (text.quote) out.push('', `> “${text.quote}”`);
    const section = (title, lines) => { if (lines.length) out.push('', `**${title}**`, ...lines.map(line => `- ${line}`)); };
    section(t('effects'), text.effects);
    section(t('goldenEffects'), text.golden.map(([label, lines]) => `${label}: ${lines.join(' / ')}`));
    section(t('obtain'), text.obtain ? [text.obtain] : []);
    section(t('upgrade'), text.upgrade);
    section(t('upgradeResults'), text.upgradeResults);
    section(t('evolvesFrom'), text.evolvesFrom);
    section(t('evolvesInto'), text.evolvesInto);
    section(t('details'), text.facts.map(([label, value]) => `${label}: ${value}`));
    section(`${t('synergies')} · ${text.synergies.length}`, text.synergies.map(([name, body]) => `${name}: ${body}`));
    return out.join('\n');
}

function fullText(language) {
    codex.setLanguage(language);
    const other = language === 'kr' ? 'en' : 'kr';
    const lines = [
        `# ${SITE_NAMES[language]} (${SITE_NAMES[other]}) - ${t('subtitle')}`,
        '', `> ${t('metaHome')}`,
        '', `${t('introText')} ${t('required')}: ${LINKS.required.name} (${LINKS.required.url})`,
        '', `- ${t('subtitle')}: ${homeUrl(language)}`,
        `- ${t('workshop')}: ${LINKS.workshop}`,
        `- ${LANGUAGE_NAMES[other]}: ${fullTextUrl(other)}`
    ];
    for (const group of codex.GROUPS) {
        const list = codex.ITEMS.filter(group.test);
        if (!list.length) continue;
        lines.push('', `## ${t(group.text)} (${list.length})`);
        if (group.id === 'wip') lines.push('', t('wipText'), '', ...list.map(item => `- ${codex.itemName(item)}`));
        else for (const item of list) lines.push('', itemMarkdown(item, language));
    }
    return `${lines.join('\n')}\n`;
}

function indexText() {
    codex.setLanguage('en');
    const lines = [
        `# ${SITE_NAMES.en} (${SITE_NAMES.kr}) - ${t('subtitle')}`,
        '', `> ${t('metaHome')}`,
        '', `${t('introText')} ${t('required')}: ${LINKS.required.name} (${LINKS.required.url})`,
        '', "Every item's whole detail (effects, golden and Mom's Box effects, Magic Conch upgrade path, evolutions, item pools, stacking and synergies) is in one plain-text file per language. Read one of them to answer questions about the items or to recommend them.",
        '', `- [Full text, Korean (한국어)](${fullTextUrl('kr')})`,
        `- [Full text, English](${fullTextUrl('en')})`
    ];
    for (const group of codex.GROUPS.filter(group => group.id !== 'wip')) {
        const list = codex.ITEMS.filter(group.test);
        if (!list.length) continue;
        lines.push('', `## ${t(group.text)}`, '');
        for (const item of list) {
            const text = codex.itemText(item);
            const summary = clip(text.effects.map(sentence).join(' ') || text.quote, 220);
            lines.push(`- [${text.name}${text.otherName ? ` / ${text.otherName}` : ''}](${pageUrl(item, 'en')}): ${metaLine(text)}. ${summary}`);
        }
    }
    lines.push('', '## Optional', '', `- [${t('workshop')}](${LINKS.workshop})`, `- [${t('subtitle')}](${homeUrl('en')})`);
    return `${lines.join('\n')}\n`;
}

function write(relative, content) {
    const target = path.join(SITE, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
}

// ---------- pages ----------
const slugs = new Map();
for (const item of codex.ITEMS) {
    const slug = codex.itemSlug(item.key);
    if (slugs.has(slug)) fail(`items ${slugs.get(slug)} and ${item.key} share the address items/${slug}/`);
    slugs.set(slug, item.key);
}

// ---------- what changed since the live site ----------
const TODAY = new Date().toISOString().slice(0, 10);
const PREVIOUS = (() => {
    if (!ARGS.previous) return {};
    try {
        const state = JSON.parse(fs.readFileSync(ARGS.previous, 'utf8'));
        if (state && state.version === 1 && state.pages && typeof state.pages === 'object') return state.pages;
        console.warn(`prerender: ${ARGS.previous} is not a page state; every page counts as changed`);
    } catch (error) {
        console.warn(`prerender: cannot read ${ARGS.previous} (${error.message}); every page counts as changed`);
    }
    return {};
})();
const sitemap = [];
const pageState = {};
let written = 0;

function writePage(relative, page) {
    const { html, fingerprint } = renderPage(page);
    write(relative, html);
    written += 1;
    if (page.noindex) return;
    const before = PREVIOUS[page.url];
    const same = before && before.hash === fingerprint && /^\d{4}-\d{2}-\d{2}$/.test(before.lastmod || '');
    pageState[page.url] = { hash: fingerprint, lastmod: same ? before.lastmod : TODAY };
    sitemap.push(page.url);
}

// The home page in each language: / is Korean and en/ English, whatever the reader's
// browser says, and each names the other as its alternate. Google takes the site name
// from / alone, so only / carries the WebSite markup (and the ownership meta tags).
const homeAlternates = [['ko', homeUrl('kr')], ['en', homeUrl('en')], ['x-default', homeUrl('en')]];
for (const language of Object.keys(LANGUAGES)) {
    codex.setLanguage(language);
    const korean = language === 'kr';
    writePage(path.join(LANGUAGES[language].dir, 'index.html'), {
        language,
        base: LANGUAGES[language].homeBase,
        // The running page sets the same title (script.js), since Google shows the rendered one.
        title: t('homeTitle'),
        description: t('metaHome'),
        url: homeUrl(language),
        alternates: homeAlternates,
        textIndex: true,
        verification: korean ? config.verification : null,
        structured: korean ? {
            '@context': 'https://schema.org', '@type': 'WebSite', name: '소라고둥의 축복',
            alternateName: ["Conch's Blessing", '소라고둥의 축복 공식 도감'], url: homeUrl('kr'), inLanguage: ['ko', 'en']
        } : null
    });
}

for (const language of Object.keys(LANGUAGES)) {
    codex.setLanguage(language);
    for (const item of codex.ITEMS) {
        const url = pageUrl(item, language);
        const sprite = item.gfx && fs.existsSync(path.join(SITE, item.gfx)) ? `${ORIGIN}/${item.gfx}` : '';
        const alternates = indexable(item)
            ? [['ko', pageUrl(item, 'kr')], ['en', pageUrl(item, 'en')], ['x-default', pageUrl(item, 'en')]] : [];
        writePage(path.join(LANGUAGES[language].dir, 'items', codex.itemSlug(item.key), 'index.html'), {
            language, item, url, alternates,
            base: LANGUAGES[language].base,
            // Work-in-progress pages exist so their links work, but stay out of search.
            noindex: !indexable(item),
            title: codex.itemTitle(item),
            description: itemDescription(item),
            image: sprite,
            structured: {
                '@context': 'https://schema.org', '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: t('pageTitle'), item: homeUrl(language) },
                    { '@type': 'ListItem', position: 2, name: codex.itemName(item), item: url }
                ]
            }
        });
    }
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(loc => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${pageState[loc].lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);
write('page-state.json', `${JSON.stringify({ version: 1, pages: pageState }, null, 1)}\n`);
const changed = sitemap.filter(url => !PREVIOUS[url] || PREVIOUS[url].hash !== pageState[url].hash);
if (ARGS.changed) fs.writeFileSync(ARGS.changed, changed.map(url => `${url}\n`).join(''), 'utf8');

// IndexNow proves the site's ownership with a file named after its key, at the root.
const INDEXNOW_KEY = String(config.indexNowKey || '');
if (INDEXNOW_KEY) {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(INDEXNOW_KEY)) fail('seo.json indexNowKey must be 8-128 letters, digits or dashes');
    write(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
}

write('llms.txt', indexText());
write('llms-full.txt', fullText('kr'));
write(path.join(LANGUAGES.en.dir, 'llms-full.txt'), fullText('en'));

// The 14 MB upgrade player is only ever shown inside the codex; page-state.json is the
// build's own bookkeeping.
write('robots.txt', `User-agent: *
Allow: /
Disallow: /upgrade-player.html
Disallow: /page-state.json

Sitemap: ${ORIGIN}/sitemap.xml
`);

// Verification files (Google/Naver HTML files, Bing's BingSiteAuth.xml) go to the site root.
const verificationDir = path.join(ROOT, 'verification');
const copied = [];
if (fs.existsSync(verificationDir)) {
    for (const name of fs.readdirSync(verificationDir)) {
        if (!/\.(html|xml|txt)$/i.test(name)) continue;
        if (fs.existsSync(path.join(SITE, name))) fail(`verification/${name} would overwrite the site's own ${name}`);
        fs.copyFileSync(path.join(verificationDir, name), path.join(SITE, name));
        copied.push(name);
    }
}

console.log(`prerender: ${written} pages, ${sitemap.length} sitemap URLs, ${changed.length} changed since ${ARGS.previous ? 'the live site' : 'nothing (no --previous)'}${copied.length ? `, verification files: ${copied.join(', ')}` : ''}`);
