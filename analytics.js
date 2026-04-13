// ── Google Analytics ─────────────────────────────────────────────────────────
const TAG_ID = __GOOGLE_TAG_ID__;

if (TAG_ID) {
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${TAG_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", TAG_ID);
}
