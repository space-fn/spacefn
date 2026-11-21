// The spacefn docs reader in the browser: theme, navigation, code tabs, search,
// Mermaid, and a reload when a docs file changes.
const d = document;
const root = d.documentElement;
const config = JSON.parse(d.getElementById("docs-config")?.textContent ?? "{}");
const base = config.base ?? "/";

const store = {
	get: (key) => {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set: (key, value) => {
		try {
			localStorage.setItem(key, value);
		} catch {
			// Private windows can refuse storage; the reader works without it.
		}
	},
};

// Theme
const themeChanged = new Set();
d.querySelector(".theme-toggle")?.addEventListener("click", () => {
	const dark = root.classList.toggle("dark");
	store.set("spacefn-docs-theme", dark ? "dark" : "light");
	for (const listener of themeChanged) listener();
});

// Navigation on narrow screens
const menu = d.querySelector(".menu-btn");
menu?.addEventListener("click", () => {
	menu.setAttribute("aria-expanded", String(d.body.classList.toggle("nav-open")));
});
d.addEventListener("click", (event) => {
	if (d.body.classList.contains("nav-open") && !event.target.closest(".sidebar,.menu-btn"))
		d.body.classList.remove("nav-open");
});
const sidebar = d.querySelector(".sidebar");
const current = sidebar?.querySelector("a.active");
if (sidebar && current) sidebar.scrollTop = current.offsetTop - sidebar.clientHeight / 2;

// Copy buttons
for (const block of d.querySelectorAll(".prose .code-block")) {
	const pre = block.querySelector("pre");
	if (!pre) continue;
	const button = d.createElement("button");
	button.type = "button";
	button.className = "copy-btn";
	button.textContent = "Copy";
	button.addEventListener("click", () => {
		const text = [...pre.querySelectorAll(".line")]
			.filter((line) => !line.classList.contains("remove"))
			.map((line) => line.textContent)
			.join("\n");
		void navigator.clipboard.writeText(text || pre.innerText).then(() => {
			button.textContent = "Copied";
			button.classList.add("copied");
			setTimeout(() => {
				button.textContent = "Copy";
				button.classList.remove("copied");
			}, 1500);
		});
	});
	block.append(button);
}

// Code groups: choosing a tab chooses it in every group with one of that name, and is remembered.
const TABS = "spacefn-docs-tabs";
const chosen = new Set(JSON.parse(store.get(TABS) ?? "[]"));
const selectTab = (group, label) => {
	const tabs = [...group.querySelectorAll('[role="tab"]')];
	const index = tabs.findIndex((tab) => tab.dataset.label === label);
	if (index === -1) return false;
	const panels = group.querySelectorAll('[role="tabpanel"]');
	tabs.forEach((tab, i) => {
		tab.setAttribute("aria-selected", String(i === index));
		panels[i]?.toggleAttribute("hidden", i !== index);
	});
	return true;
};
const groups = [...d.querySelectorAll(".code-group")];
for (const group of groups) {
	for (const label of chosen) if (selectTab(group, label)) break;
	group.querySelector(".code-tabs")?.addEventListener("click", (event) => {
		const tab = event.target.closest('[role="tab"]');
		if (!tab) return;
		const label = tab.dataset.label;
		const top = tab.getBoundingClientRect().top;
		for (const other of groups) selectTab(other, label);
		// Keep the clicked tab where it was, though groups above it changed height.
		window.scrollBy(0, tab.getBoundingClientRect().top - top);
		for (const other of group.querySelectorAll('[role="tab"]')) chosen.delete(other.dataset.label);
		chosen.add(label);
		store.set(TABS, JSON.stringify([...chosen].slice(-12)));
	});
}

// "On this page" follows the scroll
const links = [...d.querySelectorAll(".toc a")];
if (links.length > 0 && "IntersectionObserver" in window) {
	const visible = new Set();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries)
				if (entry.isIntersecting) visible.add(entry.target.id);
				else visible.delete(entry.target.id);
			const first = links.find((link) => visible.has(decodeURIComponent(link.hash.slice(1))));
			if (first) for (const link of links) link.classList.toggle("active", link === first);
		},
		{ rootMargin: "-64px 0px -60% 0px" },
	);
	for (const link of links) {
		const heading = d.getElementById(decodeURIComponent(link.hash.slice(1)));
		if (heading) observer.observe(heading);
	}
}

// "Edit this page" opens the file in your editor without leaving the page.
d.querySelector(`.edit-link[href^="${base}_/open"]`)?.addEventListener("click", (event) => {
	event.preventDefault();
	void fetch(event.currentTarget.href);
});

// Search
const dialog = d.querySelector(".search-dialog");
const input = dialog?.querySelector("input");
const list = dialog?.querySelector(".search-results");
let pages;
let selected = 0;

const escapeHtml = (text) =>
	text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const highlight = (text, query) => {
	const i = text.toLowerCase().indexOf(query);
	if (i < 0) return escapeHtml(text);
	return `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + query.length))}</mark>${escapeHtml(text.slice(i + query.length))}`;
};
const score = (text, query) => {
	const i = text.toLowerCase().indexOf(query);
	if (i < 0) return 0;
	if (i === 0) return 3;
	return /[a-z0-9]/i.test(text[i - 1]) ? 1 : 2;
};
const snippet = (text, query) => {
	const i = text.toLowerCase().indexOf(query);
	const start = Math.max(0, i - 40);
	return (start > 0 ? "…" : "") + text.slice(start, i + query.length + 80);
};

const search = (raw) => {
	const query = raw.trim().toLowerCase();
	const results = [];
	for (const page of pages ?? []) {
		const where = [page.source, page.group].filter(Boolean).join(" › ");
		if (!query) {
			results.push({
				rank: 0,
				href: page.href,
				title: escapeHtml(page.title),
				meta: escapeHtml(where),
			});
			continue;
		}
		const inTitle = score(page.title, query);
		if (inTitle)
			results.push({
				rank: 20 + inTitle,
				href: page.href,
				title: highlight(page.title, query),
				meta: escapeHtml(where),
			});
		for (const section of page.sections) {
			const href = section.id ? `${page.href}#${section.id}` : page.href;
			const title = section.heading ?? page.title;
			const inHeading = section.heading ? score(section.heading, query) : 0;
			if (inHeading) {
				results.push({
					rank: 10 + inHeading,
					href,
					title: highlight(title, query),
					meta: escapeHtml(`${page.title} · ${where}`),
				});
				continue;
			}
			if (section.text.toLowerCase().includes(query))
				results.push({
					rank: score(section.text, query),
					href,
					title: escapeHtml(title),
					meta: escapeHtml(page.title),
					snippet: highlight(snippet(section.text, query), query),
				});
		}
	}
	return results.sort((a, b) => b.rank - a.rank).slice(0, 50);
};

const render = () => {
	if (!pages) {
		list.innerHTML = '<li class="search-empty">Loading…</li>';
		return;
	}
	const results = search(input.value);
	selected = 0;
	list.innerHTML = results.length
		? results
				.map(
					(result, i) =>
						`<li><a href="${result.href}" aria-selected="${i === 0}"><span class="r-title">${result.title}</span>${result.snippet ? `<span class="r-snippet">${result.snippet}</span>` : ""}${result.meta ? `<span class="r-meta">${result.meta}</span>` : ""}</a></li>`,
				)
				.join("")
		: `<li class="search-empty">No results for “${escapeHtml(input.value)}”</li>`;
};

const move = (by) => {
	const anchors = list.querySelectorAll("a");
	if (anchors.length === 0) return;
	anchors[selected].setAttribute("aria-selected", "false");
	selected = (selected + by + anchors.length) % anchors.length;
	anchors[selected].setAttribute("aria-selected", "true");
	anchors[selected].scrollIntoView({ block: "nearest" });
};

const open = () => {
	input.value = "";
	render();
	dialog.showModal();
	input.focus();
	if (!pages)
		void fetch(`${base}_/search.json`)
			.then((response) => response.json())
			.then((index) => {
				pages = index;
				render();
			});
};

if (dialog && input && list) {
	d.querySelector(".topbar-search")?.addEventListener("click", open);
	d.addEventListener("keydown", (event) => {
		const typing = /INPUT|TEXTAREA|SELECT/.test(d.activeElement?.tagName ?? "");
		if (
			((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") ||
			(event.key === "/" && !typing)
		) {
			event.preventDefault();
			if (dialog.open) dialog.close();
			else open();
		}
	});
	input.addEventListener("input", render);
	input.addEventListener("keydown", (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			move(1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			move(-1);
		} else if (event.key === "Enter") {
			const anchor = list.querySelectorAll("a")[selected];
			if (anchor) {
				dialog.close();
				location.href = anchor.href;
			}
		}
	});
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog || event.target.closest("a")) dialog.close();
	});
}

// Mermaid, from a CDN: offline, the diagram's source shows instead.
if (config.mermaid) {
	const blocks = [...d.querySelectorAll("pre.mermaid")];
	const sources = blocks.map((block) => block.textContent);
	import(config.mermaid)
		.then(({ default: mermaid }) => {
			// Diagrams set in the code font, like the source they're drawn from.
			const fontFamily = getComputedStyle(root).getPropertyValue("--mono").trim();
			const draw = () => {
				blocks.forEach((block, i) => {
					block.removeAttribute("data-processed");
					block.textContent = sources[i];
				});
				mermaid.initialize({
					startOnLoad: false,
					theme: root.classList.contains("dark") ? "dark" : "default",
					fontFamily,
					themeVariables: { fontFamily },
				});
				return mermaid.run({ nodes: blocks });
			};
			themeChanged.add(() => void draw());
			return draw();
		})
		.catch((error) => console.warn("space docs: Mermaid didn't load", error));
}

// Reload when a docs file changes.
if ("EventSource" in window) {
	const events = new EventSource(`${base}_/events`);
	events.onmessage = (event) => {
		if (event.data === "reload") location.reload();
	};
}
