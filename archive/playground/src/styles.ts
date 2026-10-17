import { tokens, css, getCSS } from "@spacefn/css";

// --- Tokens ------------------------------------------------------------------

export const tkn = tokens({
	colors: {
		gray: {
			50: "#f9fafb",
			100: "#f3f4f6",
			200: "#e5e7eb",
			300: "#d1d5db",
			500: "#6b7280",
			700: "#374151",
			800: "#1f2937",
			900: "#111827",
		},
		primary: { 50: "#eff6ff", 100: "#dbeafe", 500: "#3b82f6", 600: "#2563eb" },
		danger: { 50: "#fef2f2", 500: "#ef4444", 600: "#dc2626" },
		success: { 50: "#f0fdf4", 500: "#22c55e", 600: "#16a34a" },
		warning: { 50: "#fffbeb", 500: "#f59e0b" },
		white: "#ffffff",
	},
	spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem", "2xl": "3rem" },
	font: {
		sm: "0.875rem",
		base: "1rem",
		lg: "1.25rem",
		xl: "1.5rem",
	},
	radius: { sm: "0.25rem", md: "0.5rem", lg: "0.75rem", full: "9999px" },
	shadow: {
		sm: "0 1px 2px rgba(0,0,0,0.05)",
		md: "0 4px 6px -1px rgba(0,0,0,0.1)",
	},
});

// --- Layout ------------------------------------------------------------------

export const layoutSx = css("layout", {
	base: {
		maxWidth: "48rem",
		margin: "0 auto",
		padding: tkn.spacing.xl,
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: tkn.colors.gray[800],
		lineHeight: "1.6",
	},
});

// --- Header ------------------------------------------------------------------

export const headerSx = css("header", {
	base: {
		marginBottom: tkn.spacing.xl,
	},
	title: {
		fontSize: tkn.font.xl,
		fontWeight: "700",
		color: tkn.colors.gray[900],
		marginBottom: tkn.spacing.xs,
	},
	subtitle: {
		fontSize: tkn.font.sm,
		color: tkn.colors.gray[500],
	},
});

// --- Card --------------------------------------------------------------------

export const cardSx = css("card", {
	base: {
		backgroundColor: tkn.colors.white,
		borderRadius: tkn.radius.lg,
		boxShadow: tkn.shadow.md,
		padding: tkn.spacing.lg,
	},
});

// --- Form --------------------------------------------------------------------

export const formSx = css("form", {
	base: {
		display: "flex",
		gap: tkn.spacing.sm,
		marginBottom: tkn.spacing.lg,
	},
	input: {
		flex: "1",
		padding: `${tkn.spacing.sm} ${tkn.spacing.md}`,
		border: `1px solid ${tkn.colors.gray[200]}`,
		borderRadius: tkn.radius.md,
		fontSize: tkn.font.base,
		outline: "none",
		transition: "border-color 0.15s",
	},
	select: {
		padding: `${tkn.spacing.sm} ${tkn.spacing.md}`,
		border: `1px solid ${tkn.colors.gray[200]}`,
		borderRadius: tkn.radius.md,
		fontSize: tkn.font.sm,
		backgroundColor: tkn.colors.white,
		color: tkn.colors.gray[700],
		outline: "none",
	},
});

// --- Button ------------------------------------------------------------------

export const btnSx = css("btn", {
	base: {
		padding: `${tkn.spacing.sm} ${tkn.spacing.md}`,
		borderRadius: tkn.radius.md,
		fontWeight: "500",
		cursor: "pointer",
		border: "none",
		fontSize: tkn.font.sm,
		transition: "background-color 0.15s, opacity 0.15s",
		whiteSpace: "nowrap",
	},
})
	.variants({
		color: {
			primary: {
				backgroundColor: tkn.colors.primary[500],
				color: tkn.colors.white,
			},
			danger: {
				backgroundColor: tkn.colors.danger[500],
				color: tkn.colors.white,
			},
			ghost: {
				backgroundColor: "transparent",
				color: tkn.colors.gray[500],
			},
		},
		size: {
			sm: { padding: `${tkn.spacing.xs} ${tkn.spacing.sm}` },
			md: { padding: `${tkn.spacing.sm} ${tkn.spacing.md}` },
		},
	})
	.defaults({ color: "primary", size: "md" });

// --- Todo Item ---------------------------------------------------------------

export const todoItemSx = css("todo-item", {
	base: {
		display: "flex",
		alignItems: "center",
		gap: tkn.spacing.md,
		padding: `${tkn.spacing.md} ${tkn.spacing.lg}`,
		borderBottom: `1px solid ${tkn.colors.gray[100]}`,
		transition: "background-color 0.15s",
	},
	checkbox: {
		width: "1.25rem",
		height: "1.25rem",
		cursor: "pointer",
		accentColor: tkn.colors.primary[500],
		flexShrink: "0",
	},
	content: {
		flex: "1",
		minWidth: "0",
	},
	title: {
		fontSize: tkn.font.base,
		fontWeight: "500",
		color: tkn.colors.gray[800],
		margin: "0",
	},
	titleCompleted: {
		textDecoration: "line-through",
		color: tkn.colors.gray[300],
	},
	description: {
		fontSize: tkn.font.sm,
		color: tkn.colors.gray[500],
		margin: `${tkn.spacing.xs} 0 0`,
	},
	actions: {
		display: "flex",
		gap: tkn.spacing.xs,
		opacity: "0.6",
		flexShrink: "0",
	},
});

// --- Badge -------------------------------------------------------------------

export const badgeSx = css("badge", {
	base: {
		display: "inline-flex",
		alignItems: "center",
		padding: `${1} ${tkn.spacing.sm}`,
		borderRadius: tkn.radius.full,
		fontSize: "0.75rem",
		fontWeight: "500",
	},
})
	.variants({
		color: {
			gray: {
				backgroundColor: tkn.colors.gray[100],
				color: tkn.colors.gray[700],
			},
			primary: {
				backgroundColor: tkn.colors.primary[50],
				color: tkn.colors.primary[600],
			},
			danger: {
				backgroundColor: tkn.colors.danger[50],
				color: tkn.colors.danger[600],
			},
			warning: {
				backgroundColor: tkn.colors.warning[50],
				color: "#92400e",
			},
			success: {
				backgroundColor: tkn.colors.success[50],
				color: tkn.colors.success[600],
			},
		},
	})
	.defaults({ color: "gray" });

// --- Filters -----------------------------------------------------------------

export const filterSx = css("filter", {
	base: {
		display: "flex",
		gap: tkn.spacing.sm,
		marginBottom: tkn.spacing.lg,
	},
	button: {
		padding: `${tkn.spacing.xs} ${tkn.spacing.md}`,
		borderRadius: tkn.radius.md,
		fontSize: tkn.font.sm,
		cursor: "pointer",
		border: `1px solid ${tkn.colors.gray[200]}`,
		backgroundColor: tkn.colors.white,
		color: tkn.colors.gray[500],
		transition: "all 0.15s",
	},
	active: {
		backgroundColor: tkn.colors.primary[500],
		color: tkn.colors.white,
		borderColor: tkn.colors.primary[500],
	},
});

// --- Empty State ------------------------------------------------------------

export const emptySx = css("empty", {
	base: {
		textAlign: "center",
		padding: `${tkn.spacing["2xl"]} 0`,
		color: tkn.colors.gray[300],
	},
	icon: {
		fontSize: "3rem",
		marginBottom: tkn.spacing.md,
	},
	text: {
		fontSize: tkn.font.lg,
		fontWeight: "500",
	},
	subtext: {
		fontSize: tkn.font.sm,
		marginTop: tkn.spacing.xs,
	},
});

// --- Category Badge Colors ---------------------------------------------------

export const categoryColors: Record<string, string> = {
	"#3b82f6": "primary",
	"#ef4444": "danger",
	"#22c55e": "success",
	"#f59e0b": "warning",
	"#6b7280": "gray",
};

// --- Generate CSS Output -----------------------------------------------------

export const cssOutput = getCSS({ tokens: [tkn] });
