import { DEFAULT_LOCALE, INTL_LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALES, type Locale } from "./config";

/**
 * Runs before first paint (inlined in <head>): sets <html lang> from the ez-locale cookie, else from
 * navigator.languages (the browser's Accept-Language), else English. This keeps the root layout static
 * under Cache Components, as the Next 16 docs recommend for <html> attributes driven by a cookie;
 * the server resolves the same order with getLocale() and LocaleProvider re-syncs after a switch.
 */
export const LOCALE_INIT_SCRIPT = `(function(){var t=${JSON.stringify(INTL_LOCALES)},s=${JSON.stringify(LOCALES)},l="${DEFAULT_LOCALE}";try{var m=document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=([^;]*)/);var c=m&&decodeURIComponent(m[1]);if(c&&s.indexOf(c)>=0){l=c;}else{var n=navigator.languages||[navigator.language];for(var i=0;i<n.length;i++){var b=String(n[i]).toLowerCase().split("-")[0];if(s.indexOf(b)>=0){l=b;break;}}}}catch(_){}document.documentElement.lang=t[l];})();`;

/** Client-side write of the choice: one year, whole site, sent on top-level navigations only (Lax). */
export const localeCookie = (locale: Locale): string =>
  `${LOCALE_COOKIE}=${locale}; Max-Age=${LOCALE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
