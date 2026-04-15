// ── Internationalization (i18n) ─────────────────────────────────────────────
// Lightweight i18n module for locale management.
// Usage: import { t, initI18n, setLocale } from './i18n.js';

let _strings = {};
let _locale = 'en';
let _listeners = [];

// ── Init ──

export async function initI18n() {
  _locale = localStorage.getItem('loaf_lang') || 'en';
  await _loadLocale(_locale);
}

async function _loadLocale(lang) {
  const resp = await fetch(`./locales/${lang}.json`);
  _strings = await resp.json();
}

// ── Translate ──

export function t(key, vars) {
  let val = key.split('.').reduce((obj, k) => obj?.[k], _strings);
  if (val === undefined || val === null) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replaceAll(`{${k}}`, String(v));
    }
  }
  return val;
}

// ── Locale switching ──

export function getLocale() { return _locale; }

export async function setLocale(lang) {
  _locale = lang;
  localStorage.setItem('loaf_lang', lang);
  await _loadLocale(lang);
  _listeners.forEach(fn => fn(lang));
}

export function onLocaleChange(fn) { _listeners.push(fn); }

// ── DOM translation ──

export function translateDOM(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.getAttribute('data-i18n'));
  }
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.getAttribute('data-i18n-title'));
  }
}
