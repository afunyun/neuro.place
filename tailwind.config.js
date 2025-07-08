/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./public/**/*.html",
		"./public/**/*.js",
		"./src/**/*.js",
		"./timer/**/*.html",
		"./timer/**/*.js",
	],
	theme: {
		fontFamily: {
			sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
			mono: [
				"ui-monospace",
				"SFMono-Regular",
				"Menlo",
				"Monaco",
				"Consolas",
				"monospace",
			],
		},
		extend: {},
	},
	plugins: [],
};
