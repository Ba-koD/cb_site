#!/usr/bin/env node
// Writes what search engines read, into an assembled site folder (default build/):
//   index.html               the codex with its tiles and first item already in the HTML
//   items/<slug>/index.html  each item's own page, Korean
//   en/items/<slug>/...      the same page in English
//   sitemap.xml, robots.txt  and any verification files from verification/
// The pages are the codex itself: script.js runs here with stub globals and draws the
// same markup it draws in the browser, and on load it takes over the page as usual.
// Usage: node prerender.cjs [site folder]
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = __dirname;
const SITE = path.resolve(process.argv[2] || path.join(ROOT, 'build'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'seo.json'), 'utf8'));
const ORIGIN = String(config.origin || '').replace(/\/+$/, '');
// kr is the site's language key; ko is the HTML/hreflang code.
const LANGUAGES = {
    kr: { html: 'ko', og: 'ko_KR', dir: '', base: '../../' },
    en: { html: 'en', og: 'en_US', dir: 'en/', base: '../../../' }
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

function itemDescription(item) {
    const quote = codex.localized(item, 'descriptions');
    const body = codex.isWip(item) ? t('wipText') : codex.effects(item).filter(line => line.trim()).map(sentence).join(' ');
    const text = [quote ? `“${quote}”` : '', body].filter(Boolean).join(' ');
    // The item's own words come first; only they are shortened, so the mod line stays whole.
    const frame = t('metaItem', { kind: kindOf(item), text: '\u0000' });
    return frame.replace('\u0000', clip(text, 160 - (frame.length - 1)));
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
    const pageAttributes = page.item
        ? ` data-page-lang="${page.language}" data-page-item="${escapeHtml(page.item.key)}"` : '';
    html = replaceOnce(html, /<html lang="[^"]*">/, `<html lang="${LANGUAGES[page.language].html}"${pageAttributes}>`, '<html lang>');
    // Static texts the script would fill in.
    html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-text="([^"]+)"[^>]*>)[^<]*(<\/\2>)/gi,
        (_, open, tag, key, close) => `${open}${escapeHtml(t(key))}${close}`);
    html = html.replace(/(<[a-z0-9]+\b[^>]*\bdata-placeholder="([^"]+)")/gi,
        (_, open, key) => `${open} placeholder="${escapeHtml(t(key))}"`);
    // On an item page the auto choice is the page's language; the home page keeps its plain label.
    if (page.item) {
        html = replaceOnce(html, /(<option value="auto" id="autoOption">)[^<]*(<\/option>)/,
            `$1${escapeHtml(t('autoDetect', { lang: page.language === 'kr' ? '한국어' : 'English' }))}$2`, 'auto language option');
    }
    const counted = codex.ITEMS.filter(indexable).length;
    html = replaceOnce(html, /(<p class="count" id="resultCount"[^>]*>)(<\/p>)/, `$1${escapeHtml(t('itemCount', { n: counted }))}$2`, 'result count');
    html = replaceOnce(html, /(<div id="groups">)(<\/div>)/, () => `<div id="groups">${codex.groupsHtml(true)}</div>`, 'item groups');
    const shown = page.item || codex.ITEMS.find(item => item.key === codex.defaultKey());
    const detail = shown ? `${codex.detailHtml(shown)}<p class="panel-hint">${escapeHtml(t('hintWide'))}</p>` : '';
    html = replaceOnce(html, /(<aside class="panel" id="detailPanel"[^>]*>)(<\/aside>)/, (_, open, close) => `${open}${detail}${close}`, 'detail panel');
    return html;
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

const sitemap = [`${ORIGIN}/`];
let written = 0;

// The home page keeps choosing its language from the browser; its HTML is Korean.
codex.setLanguage('kr');
write('index.html', renderPage({
    language: 'kr',
    // Both names, since a crawler that never runs the script sees only this title.
    title: `${t('siteName')} (Conch's Blessing) - ${t('subtitle')}`,
    description: t('metaHome'),
    url: `${ORIGIN}/`,
    verification: config.verification,
    structured: {
        '@context': 'https://schema.org', '@type': 'WebSite', name: "Conch's Blessing",
        alternateName: '소라고둥의 축복', url: `${ORIGIN}/`, inLanguage: ['ko', 'en']
    }
}));
written += 1;

for (const language of Object.keys(LANGUAGES)) {
    codex.setLanguage(language);
    for (const item of codex.ITEMS) {
        const url = pageUrl(item, language);
        const sprite = item.gfx && fs.existsSync(path.join(SITE, item.gfx)) ? `${ORIGIN}/${item.gfx}` : '';
        const alternates = indexable(item)
            ? [['ko', pageUrl(item, 'kr')], ['en', pageUrl(item, 'en')], ['x-default', pageUrl(item, 'en')]] : [];
        write(path.join(LANGUAGES[language].dir, 'items', codex.itemSlug(item.key), 'index.html'), renderPage({
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
                    { '@type': 'ListItem', position: 1, name: t('pageTitle'), item: `${ORIGIN}/` },
                    { '@type': 'ListItem', position: 2, name: codex.itemName(item), item: url }
                ]
            }
        }));
        written += 1;
        if (indexable(item)) sitemap.push(url);
    }
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map(loc => `  <url><loc>${escapeHtml(loc)}</loc></url>`).join('\n')}
</urlset>
`);

// The 14 MB upgrade player is only ever shown inside the codex.
write('robots.txt', `User-agent: *
Allow: /
Disallow: /upgrade-player.html

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

console.log(`prerender: ${written} pages, ${sitemap.length} sitemap URLs${copied.length ? `, verification files: ${copied.join(', ')}` : ''}`);
