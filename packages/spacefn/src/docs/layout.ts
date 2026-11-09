import { escapeHtml } from "../pages/html";
import { DOCS_CSS } from "./css";
import type { TocEntry } from "./enhance";
import { DOCS_BASE, type DocNode, type DocPage, flattenPages, groupOf } from "./tree";

const ICONS = {
	search:
		'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
	sun: '<svg class="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
	moon: '<svg class="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
	menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
	list: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
	edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
	folder:
		'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
	file: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>',
};

// Runs in <head> so the saved theme applies before first paint.
const THEME_BOOT =
	"(function(){try{var t=localStorage.getItem('spacefn-docs-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()";

const CLIENT = `(function(){
var d=document,root=d.documentElement,K='spacefn-docs-theme';
d.querySelector('.theme-toggle').addEventListener('click',function(){var dark=root.classList.toggle('dark');try{localStorage.setItem(K,dark?'dark':'light')}catch(e){}});
var mb=d.querySelector('.menu-btn');mb.addEventListener('click',function(){var o=d.body.classList.toggle('nav-open');mb.setAttribute('aria-expanded',String(o))});
d.addEventListener('click',function(e){if(d.body.classList.contains('nav-open')&&!e.target.closest('.sidebar,.menu-btn'))d.body.classList.remove('nav-open')});
var sb=d.querySelector('.sidebar'),act=sb.querySelector('a.active');if(act)sb.scrollTop=act.offsetTop-sb.clientHeight/2;
d.querySelectorAll('.prose pre').forEach(function(pre){
	var host=pre.closest('.code-block')||pre,b=d.createElement('button');
	b.type='button';b.className='copy-btn';b.textContent='Copy';
	b.addEventListener('click',function(){navigator.clipboard.writeText(pre.innerText.replace(/\\n$/,'')).then(function(){b.textContent='Copied';b.classList.add('copied');setTimeout(function(){b.textContent='Copy';b.classList.remove('copied')},1500)})});
	host.appendChild(b);
});
var links=[].slice.call(d.querySelectorAll('.toc a'));
if(links.length&&'IntersectionObserver' in window){
	var map={};links.forEach(function(a){map[decodeURIComponent(a.hash.slice(1))]=a});
	var visible=new Set();
	var io=new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?visible.add(e.target.id):visible.delete(e.target.id)});
		var first=null;links.some(function(a){var id=decodeURIComponent(a.hash.slice(1));if(visible.has(id)){first=a;return true}});
		if(first){links.forEach(function(a){a.classList.toggle('active',a===first)})}
	},{rootMargin:'-64px 0px -60% 0px'});
	Object.keys(map).forEach(function(id){var h=d.getElementById(id);if(h)io.observe(h)});
}
var dlg=d.querySelector('.search-dialog'),input=dlg.querySelector('input'),list=dlg.querySelector('.search-results');
var pages=JSON.parse(d.getElementById('docs-index').textContent),sel=0,items=[];
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function hl(s,q){var i=s.toLowerCase().indexOf(q);return i<0?esc(s):esc(s.slice(0,i))+'<mark>'+esc(s.slice(i,i+q.length))+'</mark>'+esc(s.slice(i+q.length))}
function search(q){q=q.trim().toLowerCase();var out=[];
	function score(text,q){var t=text.toLowerCase(),i=t.indexOf(q);if(i<0)return 0;if(i===0)return 3;return /[a-z0-9]/.test(t[i-1])?1:2}
	pages.forEach(function(p){
		if(!q){out.push({s:0,href:p.href,title:esc(p.title),meta:esc(p.group||'')});return}
		var s=score(p.title,q);if(s)out.push({s:s*2+1,href:p.href,title:hl(p.title,q),meta:esc(p.group||'')});
		p.headings.forEach(function(h){var s=score(h.text,q);if(s)out.push({s:s*2,href:p.href+'#'+h.id,title:hl(h.text,q),meta:esc(p.title)})});
	});
	out.sort(function(a,b){return b.s-a.s});return out.slice(0,40)}
function render(){items=search(input.value);sel=0;
	list.innerHTML=items.length?items.map(function(r,i){return '<li><a href="'+r.href+'" aria-selected="'+(i===0)+'"><span class="r-title">'+r.title+'</span>'+(r.meta?'<span class="r-meta">'+r.meta+'</span>':'')+'</a></li>'}).join(''):'<li class="search-empty">No results for \\u201c'+esc(input.value)+'\\u201d</li>'}
function move(n){var as=list.querySelectorAll('a');if(!as.length)return;as[sel].setAttribute('aria-selected','false');sel=(sel+n+as.length)%as.length;as[sel].setAttribute('aria-selected','true');as[sel].scrollIntoView({block:'nearest'})}
function open(){input.value='';render();dlg.showModal();input.focus()}
d.querySelector('.topbar-search').addEventListener('click',open);
d.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'||(e.key==='/'&&!/INPUT|TEXTAREA/.test(d.activeElement.tagName))){e.preventDefault();dlg.open?dlg.close():open()}});
input.addEventListener('input',render);
input.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){e.preventDefault();move(1)}else if(e.key==='ArrowUp'){e.preventDefault();move(-1)}else if(e.key==='Enter'){var a=list.querySelectorAll('a')[sel];if(a){dlg.close();location.href=a.href}}});
dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();else if(e.target.closest('a'))dlg.close()});
})()`;

/** `logo` is the image URL, already encoded. */
export type Brand = { name: string; logo: string | null };

function renderNavList(nodes: DocNode[], current: string): string {
	let html = '<ul class="nav-list">';
	for (const n of nodes) {
		if (n.kind === "page") {
			const active = n.rel === current ? ' class="active" aria-current="page"' : "";
			html += `<li><a href="${n.href}"${active}>${escapeHtml(n.title)}</a></li>`;
		} else {
			const open = current === n.rel || current.startsWith(n.rel + "/") ? " open" : "";
			html += `<li><details${open}><summary>${escapeHtml(n.label)}</summary>${renderNavList(n.children, current)}</details></li>`;
		}
	}
	return html + "</ul>";
}

/** Loose pages at the top, then one titled group per folder, like nitro.build. */
export function renderSidebar(nodes: DocNode[], current: string): string {
	const pages = nodes.filter((n): n is DocPage => n.kind === "page");
	let html = "";
	if (pages.length) {
		html += '<ul class="nav-top">';
		for (const p of pages) {
			const active = p.rel === current ? ' class="active" aria-current="page"' : "";
			html += `<li><a href="${p.href}"${active}>${ICONS.file}${escapeHtml(p.title)}</a></li>`;
		}
		html += "</ul>";
	}
	for (const n of nodes) {
		if (n.kind !== "dir") continue;
		html += `<div class="nav-group"><span class="nav-group-title">${escapeHtml(n.label)}</span>${renderNavList(n.children, current)}</div>`;
	}
	return `<aside class="sidebar" id="sidebar"><nav aria-label="Docs">${html}</nav></aside>`;
}

function renderToc(toc: TocEntry[]): string {
	if (toc.length < 2) return '<aside class="toc"></aside>';
	const items = toc
		.map((t) => `<li class="depth-${t.depth}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
		.join("");
	return `<aside class="toc"><p class="toc-title">${ICONS.list}On this page</p><ul>${items}</ul></aside>`;
}

function renderPager(nav: DocNode[], current: string): string {
	const pages = flattenPages(nav);
	const i = pages.findIndex((p) => p.rel === current);
	if (i === -1) return "";
	const prev = pages[i - 1];
	const next = pages[i + 1];
	if (!prev && !next) return "";
	const link = (p: DocPage, cls: string, label: string) =>
		`<a class="${cls}" href="${p.href}"><small>${label}</small><strong>${escapeHtml(p.title)}</strong></a>`;
	return `<nav class="pager" aria-label="Pagination">${prev ? link(prev, "prev", "← Previous") : ""}${next ? link(next, "next", "Next →") : ""}</nav>`;
}

export function renderCards(nodes: DocNode[]): string {
	const cards = nodes
		.map((n) => {
			const meta =
				n.kind === "dir"
					? `${flattenPages(n.children).length} pages`
					: n.headings
							.slice(0, 3)
							.map((h) => h.text)
							.join(" · ") || n.rel;
			const title = n.kind === "dir" ? n.label : n.title;
			return `<li><a class="card" href="${n.href}"><span class="card-title">${n.kind === "dir" ? ICONS.folder : ICONS.file}${escapeHtml(title)}</span><span class="card-meta">${escapeHtml(meta)}</span></a></li>`;
		})
		.join("");
	return `<ul class="cards">${cards}</ul>`;
}

export type PageInput = {
	title: string;
	body: string;
	toc: TocEntry[];
	/** Path of the shown file or folder relative to docs/. */
	rel: string;
	/** Path of the source file relative to the app root, for "Edit this page". */
	source: string | null;
	tree: DocNode[];
	nav: DocNode[];
	brand: Brand;
};

export function renderPage(input: PageInput): string {
	const { title, body, toc, rel, source, tree, nav, brand } = input;
	const group = groupOf(nav, rel);
	const eyebrow = group ? `<div class="eyebrow">${escapeHtml(group)}</div>` : "";
	const logo = brand.logo
		? `<img src="${escapeHtml(brand.logo)}" alt="" width="64" height="64" />`
		: "";
	const index = flattenPages(tree).map((p) => ({
		title: p.title,
		href: p.href,
		group: groupOf(nav, p.rel),
		headings: p.headings,
	}));
	const indexJson = JSON.stringify(index).replace(/</g, "\\u003c");
	const edit = source
		? `<a class="edit-link" href="/__open-in-editor?file=${encodeURIComponent(source)}">${ICONS.edit}Edit this page</a>`
		: "";
	const pageTitle = title === brand.name ? `${brand.name} docs` : `${title} · ${brand.name} docs`;
	const pager = renderPager(nav, rel);
	const foot = edit || pager ? `<footer class="page-foot">${edit}${pager}</footer>` : "";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(pageTitle)}</title><script>${THEME_BOOT}</script><style>${DOCS_CSS}</style></head><body>
<header class="topbar">
<button class="icon-btn menu-btn" type="button" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false">${ICONS.menu}</button>
<a class="brand" href="${DOCS_BASE}">${logo}<span>${escapeHtml(brand.name)}</span><span class="brand-tag">docs</span></a>
<button class="topbar-search" type="button" aria-label="Search docs">${ICONS.search}<span>Search…</span><kbd>⌘K</kbd></button>
<div class="topbar-actions"><button class="icon-btn theme-toggle" type="button" aria-label="Toggle dark mode">${ICONS.sun}${ICONS.moon}</button></div>
</header>
<div class="shell">${renderSidebar(nav, rel)}<main class="content">${eyebrow}<article class="prose">${body}</article>${foot}</main>${renderToc(toc)}</div>
<dialog class="search-dialog" aria-label="Search docs"><div class="search-field">${ICONS.search}<input type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div><ul class="search-results" role="listbox"></ul></dialog>
<script type="application/json" id="docs-index">${indexJson}</script><script>${CLIENT}</script></body></html>`;
}
