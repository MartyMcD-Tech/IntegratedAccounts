// /assets/js/quote-modal.js — DEPRECATED MODAL SHIM
// The old modal has been retired in favour of the single-question wizard.
// Any clicks on legacy triggers now redirect to /quote.html.

(function () {
  const WIZARD_URL = "/quote.html";

  function goWizard(e) {
    if (e) e.preventDefault();
    window.location.href = WIZARD_URL;
  }

  function wire() {
    // Legacy button ID used around the site
    const legacy = document.getElementById("open-quote-modal");
    if (legacy) legacy.addEventListener("click", goWizard);

    // Any elements intentionally marked as quote triggers
    document.addEventListener("click", (e) => {
      const t = e.target.closest(".js-quote-modal, [data-quote-modal]");
      if (t) goWizard(e);
    });

    // If someone lands on /quote.html expecting auto-open, do nothing:
    // the wizard renders on that page now.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  // Optional: console notice (helps debug if stale scripts are loading)
  try { console.info("[IA] Modal deprecated — using wizard at", WIZARD_URL); } catch {}
})();