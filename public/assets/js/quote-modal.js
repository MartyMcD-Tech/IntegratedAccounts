// /assets/js/quote-modal.js
// Integrated Accounts — Quote Modal Wizard (v2)
// - Multi-step wizard mirroring your PDF fields
// - Client-side only, localStorage persistence, mailto summary
// - Pricing engine hooks included (TODO)

(function () {
  const EMAIL_TO = "info@integratedaccounts.co.uk";
  const STORAGE_KEY = "iaQuoteDraft";

  // ---------- Styles ----------
  const css = `
  .qm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:none;z-index:1000}
  .qm{position:fixed;left:50%;top:6vh;transform:translateX(-50%);width:min(760px, calc(100% - 24px));
      background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.15);padding:0;z-index:1001}
  .qm header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
  .qm h1{font-size:1.25rem;margin:0}
  .qm .close{background:none;border:0;font-size:1.2rem;cursor:pointer}
  .qm .progress{height:6px;background:var(--shade);border-radius:6px;overflow:hidden;margin:0 20px}
  .qm .bar{height:100%;width:0;background:var(--brand);transition:width .25s ease}
  .qm main{padding:16px 20px;max-height:70vh;overflow:auto}
  .qm .step{display:none}
  .qm .step.active{display:block}
  .qm .grid{display:grid;gap:12px}
  .qm .row-2{grid-template-columns:repeat(2,1fr)}
  .qm label{display:grid;gap:6px;font-weight:600}
  .qm input,.qm select,.qm textarea{padding:.75rem;border:1px solid var(--border);border-radius:.5rem;font:inherit}
  .qm .muted{color:var(--muted)}
  .qm .actions{display:flex;justify-content:space-between;gap:12px;margin-top:12px}
  .qm .btn{display:inline-block;padding:.8rem 1rem;border-radius:.75rem;background:var(--brand);color:#fff;border:0;cursor:pointer;text-decoration:none}
  .qm .btn.secondary{background:#e9eef3;color:#111}
  .qm .pill{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-radius:.5rem;background:var(--shade)}
  .qm .hint{font-weight:400;color:var(--muted);font-size:.95rem}
  @media (max-width: 640px){ .qm .row-2{grid-template-columns:1fr} }
  `;

  // ---------- Markup ----------
  const html = `
  <div class="qm-overlay" id="qmOverlay" aria-hidden="true"></div>
  <div class="qm" role="dialog" aria-modal="true" aria-labelledby="qmTitle" style="display:none">
    <header>
      <h1 id="qmTitle">Get a bespoke quote</h1>
      <button class="close" type="button" aria-label="Close" id="qmClose">✕</button>
    </header>
    <div class="progress"><div class="bar" id="qmBar"></div></div>
    <main id="qmBody">
      <!-- Step 1: Basics -->
      <section class="step active" data-step="1">
        <p class="muted">Start with the basics about you and your business.</p>
        <div class="grid row-2">
          <label>Your name
            <input name="contact_name" placeholder="Jane Smith" required />
          </label>
          <label>Email
            <input name="email" type="email" placeholder="you@company.com" required />
          </label>
          <label>Business name
            <input name="business_name" placeholder="Acme Ltd" required />
          </label>
          <label>Trading entity
            <select name="trading_entity" required>
              <option value="">Select…</option>
              <option>Limited Company</option>
              <option>Sole Trader</option>
              <option>Partnership/LLP</option>
              <option>Charity/Non-profit</option>
              <option>Other</option>
            </select>
          </label>
          <label>Business sector
            <select name="sector" required>
              <option value="">Select…</option>
              <option>Professional & Consulting</option>
              <option>Trades & Construction</option>
              <option>Hospitality & Retail</option>
              <option>Creative & Media</option>
              <option>Tech & SaaS</option>
              <option>Other</option>
            </select>
          </label>
          <label>Annual turnover (approx.)
            <select name="turnover" required>
              <option value="">Select…</option>
              <option>£1 - £34,999</option>
              <option>£35,000 - £84,999</option>
              <option>£85,000 - £249,999</option>
              <option>£250,000 - £999,999</option>
              <option>£1m+</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-cancel>Cancel</button>
          <button class="btn" type="button" data-next>Next</button>
        </div>
      </section>

      <!-- Step 2: Ownership & Banking -->
      <section class="step" data-step="2">
        <p class="muted">Tell us about ownership, banking and how you trade.</p>
        <div class="grid">
          <label>How many people own the business?
            <select name="owners" required>
              <option value="">Select…</option>
              <option>1</option>
              <option>2 - 3</option>
              <option>4 or more</option>
            </select>
          </label>

          <div class="grid row-2" role="group" aria-label="Bank accounts">
            ${["Business Current Account","Business Deposit Account","Company Credit Cards","Business Paypal Account","Additional Accounts"].map(s => `
              <label style="font-weight:500"><input type="checkbox" name="bank_accounts" value="${s}"> ${s}</label>
            `).join("")}
          </div>

          <div class="grid row-2">
            <label>Customers & suppliers geography
              <select name="geo" required>
                <option value="">Select…</option>
                <option>UK Only</option>
                <option>UK & EU Only</option>
                <option>Worldwide</option>
              </select>
            </label>
            <label>Do you trade in more than one currency?
              <select name="multi_currency" required>
                <option value="">Select…</option>
                <option>Yes - Multi-Currency</option>
                <option>No - GBP Only</option>
              </select>
            </label>
          </div>

          <label>Do you accept cash payments?
            <select name="cash" required>
              <option value="">Select…</option>
              <option>Yes - we account for cash</option>
              <option>No - only card and bank transactions</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-back>Back</button>
          <button class="btn" type="button" data-next>Next</button>
        </div>
      </section>

      <!-- Step 3: Ledgers & HMRC -->
      <section class="step" data-step="3">
        <p class="muted">Ledgers and HMRC registrations.</p>
        <div class="grid">
          <div class="grid row-2">
            <label>Sales Ledger
              <select name="sales_ledger" required>
                <option value="">Select…</option>
                <option>No - all customers pay on purchase</option>
                <option>Yes - some customers have credit accounts</option>
              </select>
            </label>
            <label>Purchase Ledger
              <select name="purchase_ledger" required>
                <option value="">Select…</option>
                <option>No - I pay all suppliers on purchase</option>
                <option>Yes - I have some credit accounts with suppliers</option>
              </select>
            </label>
          </div>

          <div class="grid row-2">
            <label>VAT Registered?
              <select name="vat" required>
                <option value="">Select…</option>
                <option>Yes - VAT Registered</option>
                <option>Not VAT Registered</option>
              </select>
            </label>
            <label>PAYE (employer)?
              <select name="paye" required>
                <option value="">Select…</option>
                <option>Yes - we run a payroll scheme</option>
                <option>No - not necessary</option>
                <option>No - but we should be thinking about it</option>
              </select>
            </label>
          </div>

          <label>Construction Industry Scheme (CIS)
            <select name="cis" required>
              <option value="">Select…</option>
              <option>Yes - we have CIS deductions made from income</option>
              <option>Yes - we deduct CIS from our subcontractors pay</option>
              <option>No - we're not in that industry</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-back>Back</button>
          <button class="btn" type="button" data-next>Next</button>
        </div>
      </section>

      <!-- Step 4: Systems & records -->
      <section class="step" data-step="4">
        <p class="muted">Your accounting system and record quality.</p>
        <div class="grid">
          <label>How behind are you (beyond the current financial year)?
            <select name="backlog" required>
              <option value="">Select…</option>
              <option>Not at all - I'm up to date</option>
              <option>About a year - the last tax year needs finishing</option>
              <option>It's bad - I'm getting penalty notices from HMRC</option>
            </select>
          </label>

          <div class="grid row-2">
            <label>Accounting system
              <select name="system" required>
                <option value="">Select…</option>
                <option>Cloud Based (Xero, Quickbooks etc)</option>
                <option>Spreadsheets / Other</option>
              </select>
            </label>
            <label>Record keeping quality
              <select name="record_quality" required>
                <option value="">Select…</option>
                <option>Excellent</option>
                <option>Okay</option>
                <option>Needs work</option>
              </select>
            </label>
          </div>

          <label>Bank Reconciliation
            <select name="bank_rec" required>
              <option value="">Select…</option>
              <option>My bank accounts are reconciled</option>
              <option>My bank accounts are not reconciled</option>
              <option>I'm not sure</option>
            </select>
          </label>

          <label>Do owners/directors repay out-of-pocket expenses?
            <select name="oop_expenses" required>
              <option value="">Select…</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-back>Back</button>
          <button class="btn" type="button" data-next>Next</button>
        </div>
      </section>

      <!-- Step 5: Responsibility & cadence -->
      <section class="step" data-step="5">
        <p class="muted">Who does what, and how often.</p>
        <div class="grid">
          <div class="grid row-2">
            <label>Who will do the bookkeeping?
              <select name="who_books" required>
                <option value="">Select…</option>
                <option>We will</option>
                <option>You will</option>
              </select>
            </label>
            <label>If it's us, how regularly?
              <select name="books_frequency">
                <option value="">Select…</option>
                <option>Monthly</option>
                <option>Quarterly</option>
              </select>
            </label>
          </div>

          <label>Who will scan and upload records?
            <select name="who_scans" required>
              <option value="">Select…</option>
              <option>We will</option>
              <option>You will</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="btn secondary" type="button" data-back>Back</button>
          <button class="btn" type="button" data-next>Next</button>
        </div>
      </section>

      <!-- Step 6: Catch-up -->
      <section class="step" data-step="6">
        <p class="muted">If you’re behind, how many whole months since year end?</p>
        <div class="grid row-2">
          <label>Months to catch up
            <input name="catchup_months" type="number" min="0" step="1" placeholder="0" required />
          </label>
          <label class="hint">Notes (optional)
            <input name="notes" placeholder="E.g. VAT quarters, deadlines, oddities…" />
          </label>
        </div>

        <div class="actions">
          <button class="btn secondary" type="button" data-back>Back</button>
          <button class="btn" type="button" data-next>Review</button>
        </div>
      </section>

      <!-- Step 7: Review & send -->
      <section class="step" data-step="7">
        <p class="muted">Review your details, then send.</p>
        <div id="qmSummary" class="card" style="border:1px solid var(--border);border-radius:12px;padding:12px"></div>
        <div class="actions">
          <button class="btn secondary" type="button" data-back>Edit</button>
          <a class="btn" href="#" id="qmSend">Send enquiry</a>
        </div>
      </section>
    </main>
  </div>
  `;

  // ---------- Inject once ----------
  function inject() {
    if (document.getElementById("qmOverlay")) return;
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    const wrap = document.createElement("div"); wrap.innerHTML = html; document.body.appendChild(wrap);
  }

  // ---------- State ----------
  const state = loadDraft();
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }
  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- DOM helpers ----------
  const $ = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));

  function showStep(n){
    const steps = $$(".qm .step");
    steps.forEach((s,i)=> s.classList.toggle("active", i===n-1));
    const bar = $("#qmBar");
    if (bar) bar.style.width = ((n-1)/(steps.length-1))*100 + "%";
    if (n===1) bar.style.width = "0%";
  }

  function readForm() {
    const root = $(".qm");
    const data = {...state};

    // Simple fields
    $$("input[name], select[name], textarea[name]", root).forEach(el => {
      if (el.type === "checkbox" && el.name === "bank_accounts") return; // handled below
      if (el.type === "checkbox" || el.type === "radio") data[el.name] = el.checked;
      else data[el.name] = el.value.trim();
    });

    // Checkboxes group
    data.bank_accounts = $$('input[name="bank_accounts"]:checked', root).map(el => el.value);

    return data;
  }

  function writeForm(data) {
    const root = $(".qm");
    if (!root) return;
    $$("input[name], select[name], textarea[name]", root).forEach(el => {
      const v = data[el.name];
      if (el.type === "checkbox" && el.name === "bank_accounts") {
        el.checked = (data.bank_accounts||[]).includes(el.value);
      } else if (el.type === "checkbox" || el.type === "radio") {
        el.checked = !!v;
      } else if (typeof v !== "undefined") {
        el.value = v;
      }
    });
  }

  function validate(step) {
    const current = $(`.qm .step[data-step="${step}"]`);
    const required = $$("[required]", current);
    let ok = true;
    required.forEach(el => {
      const good = (el.type === "checkbox" || el.type === "radio") ? el.checked : !!el.value.trim();
      if (!good) ok = false;
      el.style.outline = good ? "" : "2px solid #ef4444";
    });
    return ok;
  }

  function summarise(data) {
    const p = (k, v)=> v ? `<p><strong>${k}:</strong> ${v}</p>` : "";
    const list = (k, arr)=> (arr && arr.length) ? `<p><strong>${k}:</strong> ${arr.join(", ")}</p>` : "";
    return [
      p("Contact", `${data.contact_name || ""} · ${data.email || ""}`),
      p("Business", data.business_name),
      p("Entity", data.trading_entity),
      p("Sector", data.sector),
      p("Turnover", data.turnover),
      p("Owners", data.owners),
      list("Bank accounts", data.bank_accounts),
      p("Geography", data.geo),
      p("Multi-currency", data.multi_currency),
      p("Cash handling", data.cash),
      p("Sales Ledger", data.sales_ledger),
      p("Purchase Ledger", data.purchase_ledger),
      p("VAT", data.vat),
      p("PAYE", data.paye),
      p("CIS", data.cis),
      p("Backlog", data.backlog),
      p("System", data.system),
      p("Record quality", data.record_quality),
      p("Bank reconciliation", data.bank_rec),
      p("OOP expenses repaid", data.oop_expenses),
      p("Who does bookkeeping", data.who_books),
      p("Bookkeeping frequency", data.books_frequency),
      p("Who scans/uploads", data.who_scans),
      p("Months to catch up", data.catchup_months),
      p("Notes", data.notes)
    ].join("");
  }

  // TODO: Pricing Engine
  // Hook point where we can compute:
  // const { monthly, catchup } = computePrice(state);
  // and render those figures into the review, plus include in mailto.

  function mailtoHref(data) {
    const subject = encodeURIComponent(`Quote request — ${data.business_name || "New enquiry"}`);
    const lines = [
      `Contact: ${data.contact_name || ""}`,
      `Email: ${data.email || ""}`,
      `Business: ${data.business_name || ""}`,
      `Entity: ${data.trading_entity || ""}`,
      `Sector: ${data.sector || ""}`,
      `Turnover: ${data.turnover || ""}`,
      `Owners: ${data.owners || ""}`,
      `Bank accounts: ${(data.bank_accounts||[]).join(", ")}`,
      `Geography: ${data.geo || ""}`,
      `Multi-currency: ${data.multi_currency || ""}`,
      `Cash handling: ${data.cash || ""}`,
      `Sales Ledger: ${data.sales_ledger || ""}`,
      `Purchase Ledger: ${data.purchase_ledger || ""}`,
      `VAT: ${data.vat || ""}`, `PAYE: ${data.paye || ""}`, `CIS: ${data.cis || ""}`,
      `Backlog: ${data.backlog || ""}`,
      `System: ${data.system || ""}`, `Record quality: ${data.record_quality || ""}`,
      `Bank rec: ${data.bank_rec || ""}`, `OOP expenses: ${data.oop_expenses || ""}`,
      `Who does bookkeeping: ${data.who_books || ""}`, `Books frequency: ${data.books_frequency || ""}`,
      `Who scans: ${data.who_scans || ""}`,
      `Months to catch up: ${data.catchup_months || ""}`,
      `Notes: ${data.notes || ""}`
    ];
    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${EMAIL_TO}?subject=${subject}&body=${body}`;
  }

  // ---------- Open/Close ----------
  function openModal(auto=false){
    inject();
    const modal = $(".qm"), overlay = $("#qmOverlay");
    modal.style.display = "block"; overlay.style.display = "block"; overlay.removeAttribute("aria-hidden");
    writeForm(state); showStep(1);
  }
  function closeModal(){
    const modal = $(".qm"), overlay = $("#qmOverlay");
    if (modal) modal.style.display = "none";
    if (overlay) { overlay.style.display = "none"; overlay.setAttribute("aria-hidden","true"); }
  }

  // ---------- Wiring ----------
  function wire() {
    document.addEventListener("click", (e)=>{
      const t = e.target;

      if (t && t.id === "open-quote-modal") { e.preventDefault(); openModal(true); }
      if (t && (t.id === "qmClose" || t.dataset.cancel !== undefined)) { e.preventDefault(); closeModal(); }

      if (t && t.dataset.next !== undefined) {
        e.preventDefault();
        const current = Number($(".qm .step.active").dataset.step);
        if (!validate(current)) return;
        Object.assign(state, readForm()); saveDraft();
        const next = Math.min(current + 1, 7); showStep(next);
        if (next === 7) {
          $("#qmSummary").innerHTML = summarise(state);
          $("#qmSend").setAttribute("href", mailtoHref(state));
        }
      }
      if (t && t.dataset.back !== undefined) {
        e.preventDefault();
        const current = Number($(".qm .step.active").dataset.step);
        Object.assign(state, readForm()); saveDraft();
        showStep(Math.max(1, current - 1));
      }
    });

    // Close on overlay click
    document.addEventListener("mousedown", (e)=>{
      if (e.target && e.target.id === "qmOverlay") closeModal();
    });

    // Auto-open on /quote.html
    if (location.pathname.endsWith("/quote.html")) {
      if (!document.getElementById("open-quote-modal")) {
        const btn = document.createElement("a");
        btn.href="#"; btn.id="open-quote-modal"; btn.className="btn hidden"; btn.textContent="Open quote";
        document.body.appendChild(btn);
      }
      openModal(true);
    }
  }

  // Init
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
