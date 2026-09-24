import { tokens, css, getCSS } from "@spacefn/css";

// 1. Define tokens
export const tkn = tokens({
	colors: {
		gray: { 50: "#f9fafb", 100: "#f3f4f6", 800: "#1f2937" },
		primary: { 500: "#3b82f6", 600: "#2563eb" },
		white: "#ffffff",
	},
	spacing: { sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
	font: {
		sm: "0.875rem",
		base: "1rem",
		lg: "1.25rem",
	},
	radius: { md: "0.5rem" },
});

// 2. Define card style
export const cardSx = css("card", {
	base: {
		padding: tkn.spacing.lg,
		backgroundColor: tkn.colors.white,
		borderRadius: tkn.radius.md,
		boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
	},
	heading: {
		fontSize: tkn.font.lg,
		fontWeight: "600",
		marginBottom: tkn.spacing.sm,
	},
	content: {
		fontSize: tkn.font.base,
		color: tkn.colors.gray[800],
		lineHeight: "1.6",
	},
});

// 3. Define button style with variants
export const btnSx = css("btn", {
	base: {
		padding: `${tkn.spacing.sm} ${tkn.spacing.lg}`,
		borderRadius: tkn.radius.md,
		fontWeight: "500",
		cursor: "pointer",
		border: "none",
	},
})
	.variants({
		color: {
			primary: {
				backgroundColor: tkn.colors.primary[500],
				color: tkn.colors.white,
			},
			danger: {
				backgroundColor: "#ef4444",
				color: tkn.colors.white,
			},
		},
		size: {
			sm: { fontSize: tkn.font.sm },
			lg: { fontSize: tkn.font.lg },
		},
	})
	.defaults({ color: "primary", size: "sm" });

// 4. Generate CSS string
export const cssOutput = getCSS({ tokens: [tkn] });
