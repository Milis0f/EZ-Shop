export type AppMode = "simple" | "advanced";

export const MODE_STORAGE_KEY = "ez-mode";

/**
 * Runs before first paint (inlined in <head>): sets data-mode on <html> from the saved
 * choice, "simple" by default. CSS variants `simple:` / `advanced:` then show the right interface at once.
 */
export const MODE_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("${MODE_STORAGE_KEY}");document.documentElement.dataset.mode=m==="advanced"?"advanced":"simple";}catch(_){document.documentElement.dataset.mode="simple";}})();`;
