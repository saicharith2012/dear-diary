export const PREFS_STORAGE_KEY = "dear-diary:prefs";

/**
 * Inlined into <head> so a saved light/dark override applies before first
 * paint. Mirrors `applyTheme` in ./prefs.
 */
export const THEME_BOOT_SCRIPT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_STORAGE_KEY)})||"{}").theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
