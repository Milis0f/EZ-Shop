export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "ez-theme";

/**
 * Runs before first paint (inlined in <head>): applies the saved theme, or the
 * system preference on first visit, so the page never flashes the wrong theme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
