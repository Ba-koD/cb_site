# Search engine ownership files

`prerender.cjs` copies every `.html`, `.xml` or `.txt` file in this folder to the
site root when the Pages workflow builds the site. Put a file here only when a
search console asks for its file method:

- Google Search Console: `google<code>.html`
- Naver Search Advisor: `naver<code>.html`
- Bing Webmaster Tools: `BingSiteAuth.xml`

The meta tag method needs no file: put the code in `seo.json` under
`verification` instead. This README is not copied.
