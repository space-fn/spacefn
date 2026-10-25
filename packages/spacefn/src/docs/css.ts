export const DOCS_CSS =
	"body{font-family:system-ui,-apple-system,sans-serif;margin:0 auto;padding:0;line-height:1.65;color:#222;height:100vh;overflow:hidden;max-width:1100px}" +
	".layout{display:grid;grid-template-columns:220px 1fr;gap:2rem;height:100vh;overflow:hidden;width:100%;max-width:1100px}" +
	".sidebar{font-size:.9em;overflow-y:auto;max-height:100vh;padding:1rem 0}" +
	".sidebar ul{list-style:none;padding-left:1rem;margin:.25rem 0}" +
	".sidebar>ul{padding-left:0}" +
	".sidebar a{color:#555;display:block;padding:.15rem .25rem;border-radius:4px}" +
	".sidebar a.active{background:#e5e7eb;color:#111;font-weight:600}" +
	".sidebar summary::before{content:'>';display:inline-block;margin-right:.35rem;font-size:.75em;transition:transform .15s}" +
	"main{min-width:0;max-width:900px;overflow-y:auto;padding:1rem 1.25rem}" +
	"@media (max-width:768px){.layout{grid-template-columns:1fr}.sidebar{position:static;max-height:none;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;margin-bottom:1rem}}" +
	".shiki{background:#f4f4f5!important;border-radius:6px;padding:1rem;overflow:auto;margin:1rem 0}" +
	"a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}" +
	"pre{background:#f4f4f5;padding:1rem;overflow:auto;border-radius:6px;margin:1rem 0}" +
	"code{background:#f4f4f5;padding:.1rem .3rem;border-radius:3px;font-size:.9em}" +
	"pre code{background:none;padding:0}" +
	"h1,h2,h3,h4{margin-top:1.6rem}" +
	"ul{padding-left:1.25rem}hr{border:none;border-top:1px solid #e5e7eb;margin:2rem 0}" +
	"table{border-collapse:collapse;width:100%;margin:1rem 0}" +
	"th,td{border:1px solid #e5e7eb;padding:.4rem .6rem}th{background:#f4f4f5}" +
	"blockquote{border-left:3px solid #e5e7eb;margin:1rem 0;padding:.2rem 1rem;color:#555}" +
	"img{max-width:100%}" +
	"nav.toc{background:#f4f4f5;border-radius:6px;padding:.75rem 1rem;margin:1rem 0;font-size:.9em}" +
	"nav.toc ul{margin:.25rem 0;padding-left:1.25rem}" +
	".crumbs{font-size:.85em;color:#555;margin-bottom:1rem}" +
	".crumbs a{color:#555}" +
	".theme-toggle{position:fixed;top:1rem;right:1rem;border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:.25rem .5rem;cursor:pointer;font-size:.85em}" +
	"@media (max-width:600px){body{margin:1rem auto;padding:0 .75rem}pre{padding:.75rem;font-size:.85em}table{font-size:.85em}}" +
	"body.dark{color:#e5e7eb;background:#0f172a}body.dark a{color:#60a5fa}body.dark pre,body.dark code{background:#1e293b}body.dark th{background:#1e293b}body.dark td,body.dark th{border-color:#334155}body.dark hr{border-top-color:#334155}body.dark blockquote{border-left-color:#334155;color:#94a3b8}body.dark nav.toc{background:#1e293b}.theme-toggle{position:fixed;top:1rem;right:1rem;z-index:10}body.dark .theme-toggle{background:#1e293b;border-color:#334155;color:#e5e7eb}body.dark .shiki{background-color:#1e293b!important}body.dark .shiki span{color:var(--shiki-dark)!important}body.dark .sidebar a{color:#94a3b8}body.dark .sidebar a.active{background:#1e293b;color:#e5e7eb}body.dark .sidebar .nav-dir{color:#e5e7eb}body.dark .sidebar summary{color:#e5e7eb}";
