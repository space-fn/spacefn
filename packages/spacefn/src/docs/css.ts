// Styles for the dev docs reader. Light and dark share one set of tokens on :root.
export const DOCS_CSS = `
:root{
	--bg:#ffffff;--bg-soft:#fafafa;--bg-muted:#f4f4f5;--bg-code:#fafafa;
	--border:#e4e4e7;--border-strong:#d4d4d8;
	--text:#3f3f46;--text-strong:#18181b;--text-muted:#71717a;
	--accent:#e11d48;--accent-soft:rgba(225,29,72,.08);--accent-text:#be123c;
	--note:#2563eb;--tip:#16a34a;--important:#7c3aed;--warning:#d97706;--caution:#dc2626;
	--header-h:64px;--radius:8px;
	--font:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
	--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
	color-scheme:light;
}
html.dark{
	--bg:#0a0a0b;--bg-soft:#111113;--bg-muted:#18181b;--bg-code:#111113;
	--border:#232327;--border-strong:#3f3f46;
	--text:#d4d4d8;--text-strong:#fafafa;--text-muted:#a1a1aa;
	--accent:#fb7185;--accent-soft:rgba(251,113,133,.1);--accent-text:#fda4af;
	--note:#60a5fa;--tip:#4ade80;--important:#a78bfa;--warning:#fbbf24;--caution:#f87171;
	color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-padding-top:calc(var(--header-h) + 1.5rem);-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.7 var(--font);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit}
svg.icon{width:1.1em;height:1.1em;flex:none}

/* Header */
.topbar{position:sticky;top:0;z-index:30;height:var(--header-h);display:flex;align-items:center;gap:1rem;padding:0 1.5rem;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.brand{display:flex;align-items:center;gap:.6rem;font-weight:650;font-size:1rem;color:var(--text-strong);letter-spacing:-.01em;min-width:0}
.brand img{height:28px;width:auto;max-width:120px;object-fit:contain;border-radius:4px}
.brand-tag{font-size:.7rem;font-weight:600;padding:.05rem .45rem;border-radius:999px;border:1px solid var(--border);color:var(--text-muted)}
.topbar-search{margin:0 auto;display:flex;align-items:center;gap:.5rem;width:min(100%,22rem);height:36px;padding:0 .5rem 0 .75rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-soft);color:var(--text-muted);cursor:pointer;font-size:.875rem;transition:border-color .15s}
.topbar-search:hover{border-color:var(--border-strong)}
.topbar-search span{flex:1;text-align:left}
kbd{font:500 .7rem var(--mono);padding:.1rem .35rem;border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;background:var(--bg);color:var(--text-muted)}
.topbar-actions{display:flex;align-items:center;gap:.25rem}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:var(--radius);background:transparent;color:var(--text-muted);cursor:pointer}
.icon-btn:hover{background:var(--bg-muted);color:var(--text-strong)}
.menu-btn{display:none}
html:not(.dark) .icon-sun,html.dark .icon-moon{display:none}

/* Shell */
.shell{max-width:90rem;margin:0 auto;display:grid;grid-template-columns:17rem minmax(0,1fr) 15rem;gap:0 2.5rem;padding:0 1.5rem}
.sidebar{position:sticky;top:var(--header-h);height:calc(100vh - var(--header-h));overflow-y:auto;padding:1.75rem .5rem 3rem 0;font-size:.875rem;scrollbar-width:thin}
.nav-group{margin-bottom:1.5rem}
.nav-group-title{display:block;margin:0 0 .5rem;padding:0 .75rem;font-size:.8125rem;font-weight:600;color:var(--text-strong)}
.nav-list{list-style:none;margin:0;padding:0;border-left:1px solid var(--border);margin-left:.75rem}
.nav-list .nav-list{margin-left:.75rem}
.nav-list a{display:block;margin-left:-1px;padding:.3rem .75rem;border-left:1px solid transparent;color:var(--text-muted);line-height:1.45;transition:color .12s,border-color .12s}
.nav-list a:hover{color:var(--text-strong);border-left-color:var(--border-strong)}
.nav-list a.active{color:var(--accent-text);border-left-color:var(--accent);font-weight:550}
.nav-list details>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;margin-left:-1px;padding:.3rem .75rem;color:var(--text);cursor:pointer;font-weight:500}
.nav-list details>summary::-webkit-details-marker{display:none}
.nav-list details>summary::after{content:"";width:.4rem;height:.4rem;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s;opacity:.6}
.nav-list details[open]>summary::after{transform:rotate(45deg)}
.nav-top{list-style:none;margin:0 0 1.5rem;padding:0}
.nav-top a{display:flex;align-items:center;gap:.6rem;padding:.35rem .75rem;border-radius:var(--radius);color:var(--text-muted);font-weight:500}
.nav-top a:hover{color:var(--text-strong);background:var(--bg-muted)}
.nav-top a.active{color:var(--accent-text);background:var(--accent-soft)}

/* Content */
.content{min-width:0;padding:2.5rem 0 4rem}
.eyebrow{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;margin-bottom:.75rem;font-size:.8125rem;font-weight:550;color:var(--accent-text)}
.eyebrow a:hover{text-decoration:underline}
.eyebrow .sep{color:var(--text-muted);opacity:.6}
.prose{max-width:48rem}
.prose>*:first-child{margin-top:0}
.prose h1{margin:0 0 .75rem;font-size:2.25rem;line-height:1.2;font-weight:700;letter-spacing:-.025em;color:var(--text-strong)}
.prose h1+p{font-size:1.125rem;color:var(--text-muted);margin:0 0 2.25rem}
.prose h2,.prose h3,.prose h4{position:relative;color:var(--text-strong);letter-spacing:-.015em;line-height:1.35}
.prose h2{margin:3rem 0 1rem;font-size:1.5rem;font-weight:650;padding-top:.25rem}
.prose h3{margin:2.25rem 0 .75rem;font-size:1.2rem;font-weight:600}
.prose h4{margin:1.75rem 0 .5rem;font-size:1rem;font-weight:600}
.heading-anchor{position:absolute;left:-1.25em;padding-right:.4em;color:var(--accent);opacity:0;font-weight:500;transition:opacity .12s}
.prose :is(h2,h3,h4):hover .heading-anchor{opacity:1}
.prose p,.prose ul,.prose ol{margin:1.1rem 0}
.prose ul,.prose ol{padding-left:1.4rem}
.prose li{margin:.35rem 0}
.prose li::marker{color:var(--text-muted)}
.prose strong{color:var(--text-strong);font-weight:600}
.prose a{color:var(--accent-text);font-weight:500;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent);transition:border-color .12s}
.prose a:hover{border-bottom-color:var(--accent)}
.prose a.heading-anchor{border:0}
.prose hr{border:0;border-top:1px solid var(--border);margin:2.5rem 0}
.prose img{max-width:100%;border-radius:var(--radius)}
.prose :not(pre)>code{font:500 .85em var(--mono);padding:.15em .4em;border-radius:6px;background:var(--bg-muted);border:1px solid var(--border);color:var(--text-strong);word-break:break-word}
.prose blockquote{margin:1.5rem 0;padding:.25rem 1rem;border-left:3px solid var(--border-strong);color:var(--text-muted)}
.prose blockquote>p{margin:.6rem 0}

/* Code */
.code-block,.prose>pre{position:relative;margin:1.5rem 0;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-code);overflow:hidden}
.code-head{display:flex;align-items:center;height:38px;padding:0 .9rem;border-bottom:1px solid var(--border);font:500 .75rem var(--mono);color:var(--text-muted)}
.code-block pre,.prose>pre{margin:0;padding:1rem 1.1rem;overflow-x:auto;font:13.5px/1.7 var(--mono);background:transparent!important;tab-size:3}
.code-block pre code,.prose>pre code{font:inherit;background:none;border:0;padding:0}
.code-block .shiki{background-color:transparent!important}
html.dark .shiki,html.dark .shiki span{color:var(--shiki-dark)!important;font-style:var(--shiki-dark-font-style)!important;font-weight:var(--shiki-dark-font-weight)!important}
.copy-btn{position:absolute;top:4px;right:6px;display:inline-flex;align-items:center;gap:.3rem;height:30px;padding:0 .55rem;border:0;border-radius:6px;background:transparent;color:var(--text-muted);font-size:.75rem;cursor:pointer;opacity:.75}
.copy-btn:hover{opacity:1;background:var(--bg-muted);color:var(--text-strong)}
.copy-btn.copied{color:var(--tip);opacity:1}
.prose>pre .copy-btn{top:6px}

/* Tables */
.table-wrap{margin:1.5rem 0;overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)}
.prose table{width:100%;border-collapse:collapse;font-size:.875rem}
.prose th{text-align:left;font-weight:600;color:var(--text-strong);background:var(--bg-soft)}
.prose th,.prose td{padding:.6rem .9rem;border-bottom:1px solid var(--border);vertical-align:top}
.prose tr:last-child td{border-bottom:0}

/* Callouts */
.prose .callout{--c:var(--note);border:1px solid color-mix(in srgb,var(--c) 30%,transparent);border-left:3px solid var(--c);border-radius:var(--radius);background:color-mix(in srgb,var(--c) 7%,transparent);color:var(--text);padding:.4rem 1rem}
.callout-title{font-weight:600;color:var(--c);margin-bottom:.25rem!important}
.callout-tip{--c:var(--tip)!important}.callout-important{--c:var(--important)!important}.callout-warning{--c:var(--warning)!important}.callout-caution{--c:var(--caution)!important}

/* Listing cards */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:1rem;margin:2rem 0;padding:0;list-style:none}
.card{display:flex;flex-direction:column;gap:.35rem;height:100%;padding:1.1rem 1.2rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-soft);transition:border-color .15s,transform .15s}
.prose .card{border-bottom:1px solid var(--border);color:inherit;font-weight:400}
.prose .card:hover,.card:hover{border-color:var(--accent);transform:translateY(-1px)}
.card-title{display:flex;align-items:center;gap:.5rem;font-weight:600;color:var(--text-strong)}
.card-meta{font-size:.8125rem;color:var(--text-muted)}

/* Pager and footer */
.page-foot{max-width:48rem;margin-top:3.5rem;padding-top:1.5rem;border-top:1px solid var(--border)}
.edit-link{display:inline-flex;align-items:center;gap:.4rem;font-size:.875rem;color:var(--text-muted)}
.edit-link:hover{color:var(--accent-text)}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1.5rem}
.pager a{display:flex;flex-direction:column;gap:.2rem;padding:1rem 1.2rem;border:1px solid var(--border);border-radius:var(--radius);transition:border-color .15s}
.pager a:hover{border-color:var(--accent)}
.pager .next{grid-column:2;text-align:right;align-items:flex-end}
.pager small{font-size:.8rem;color:var(--text-muted)}
.pager strong{font-weight:600;color:var(--text-strong)}

/* On this page */
.toc{position:sticky;top:var(--header-h);height:calc(100vh - var(--header-h));overflow-y:auto;padding:2.5rem 0 2rem;font-size:.8125rem;scrollbar-width:thin}
.toc-title{display:flex;align-items:center;gap:.4rem;margin:0 0 .75rem;font-size:.8125rem;font-weight:600;color:var(--text-strong)}
.toc ul{list-style:none;margin:0;padding:0}
.toc li a{display:block;padding:.28rem 0;color:var(--text-muted);line-height:1.4;transition:color .12s}
.toc li.depth-3 a{padding-left:.85rem}
.toc li a:hover{color:var(--text-strong)}
.toc li a.active{color:var(--accent-text);font-weight:550}

/* Search */
.search-dialog{width:min(40rem,calc(100vw - 2rem));max-height:min(32rem,calc(100vh - 6rem));margin:5rem auto auto;padding:0;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text);box-shadow:0 24px 64px -12px rgba(0,0,0,.35);overflow:hidden}
.search-dialog::backdrop{background:rgba(0,0,0,.45);backdrop-filter:blur(2px)}
.search-dialog[open]{display:flex;flex-direction:column}
.search-field{display:flex;align-items:center;gap:.6rem;padding:0 1rem;border-bottom:1px solid var(--border);color:var(--text-muted)}
.search-field input::-webkit-search-cancel-button{display:none}
.search-field input{flex:1;height:52px;border:0;outline:0;background:transparent;color:var(--text-strong);font:inherit;font-size:1rem}
.search-results{list-style:none;margin:0;padding:.5rem;overflow-y:auto}
.search-results a{display:flex;flex-direction:column;gap:.1rem;padding:.6rem .75rem;border-radius:var(--radius)}
.search-results a[aria-selected="true"]{background:var(--accent-soft)}
.search-results a[aria-selected="true"] .r-title{color:var(--accent-text)}
.r-title{font-weight:550;color:var(--text-strong)}
.r-meta{font-size:.8rem;color:var(--text-muted)}
.search-empty{padding:2rem 1rem;text-align:center;color:var(--text-muted);font-size:.9rem}
mark{background:transparent;color:var(--accent-text);font-weight:650}

/* Responsive */
@media (max-width:1279px){.shell{grid-template-columns:16rem minmax(0,1fr)}.toc{display:none}}
@media (max-width:899px){
	.topbar{padding:0 1rem;gap:.5rem}
	.menu-btn{display:inline-flex}
	.topbar-search{width:auto;margin-left:auto;margin-right:0}
	.topbar-search span,.topbar-search kbd{display:none}
	.shell{display:block;padding:0 1rem}
	.sidebar{position:fixed;inset:var(--header-h) auto 0 0;z-index:25;width:min(20rem,85vw);height:auto;padding:1.5rem 1rem 3rem;background:var(--bg);border-right:1px solid var(--border);transform:translateX(-100%);transition:transform .2s ease;visibility:hidden}
	body.nav-open .sidebar{transform:none;visibility:visible}
	body.nav-open::after{content:"";position:fixed;inset:var(--header-h) 0 0 0;z-index:20;background:rgba(0,0,0,.4)}
	.content{padding-top:1.75rem}
	.prose h1{font-size:1.85rem}
	.heading-anchor{display:none}
	.pager{grid-template-columns:1fr}.pager .next{grid-column:1}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
