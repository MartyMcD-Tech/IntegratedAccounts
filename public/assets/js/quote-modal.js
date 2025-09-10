// /assets/js/quote-modal.js
// Integrated Accounts — Quote Modal Wizard (v3)
// - Multi-step wizard + localStorage
// - Built-in pricing engine (can be extracted later)
// - Review step shows line-item breakdown and monthly total
// - Final action: mailto summary (can be swapped to Supabase/Webhook later)

(function () {
  const EMAIL_TO = "info@integratedaccounts.co.uk";
  const STORAGE_KEY = "iaQuoteDraft";

  /* ==================== PRICING ENGINE ==================== */
  const IA_PRICE = (() => {
    // 1) Business type → base initial price
    const BUSINESS_TYPE = {
      "Limited Company": 450,
      "Sole Trader": 275,
      "CIS Subcontractor": 350,
      "Partnership/LLP": 450,
      "Community Interest Company": 375
    };

    // 2) Sector multiplier
    const SECTOR_MULTIPLIER = {
      "Retail": 1.1,
      "Restaurants & Bars": 1.3,
      "Professional & Consulting": 1.0,
      "Trades & Construction": 1.15,
      "Hospitality & Retail": 1.2,
      "Creative & Media": 1.05,
      "Tech & SaaS": 1.1,
      "Other": 1.0
    };

    // 3) Invoice volume → monthly price (bands from your sheet)
    const INVOICE_PRICE = [
      { band: "None", price: 0 },
      { band: "1 to 24", price: 600 },
      { band: "25 to 49", price: 900 },
      { band: "50 to 99", price: 1200 },
      { band: "100 to 149", price: 1800 }
      // Extend with more tiers if needed
    ];

    // 4) Payroll tiers (p1=monthly, p2=fortnightly, p3=weekly, p4=daily — adjust mapping if needed)
    const PAYROLL_PRICE = [
      { band: "None", p1: 0,  p2: 0,  p3: 0,  p4: 0 },
      { band: "1 to 5", p1: 20, p2: 22, p3: 40, p4: 80 },
      { band: "6 to 19", p1: 60, p2: 62, p3: 120, p4: 240 },
      { band: "20 to 49", p1: 140, p2: 142, p3: 280, p4: 560 },
      { band: "50 or more", p1: 180, p2: 182, p3: 360, p4: 720 }
    ];

    // 5) System uplift %
    const SYSTEM_PCT = {
      "Cloud Based (Xero, Quickbooks etc)": 0,
      "Desktop Based (Sage etc)": 30,
      "Excel or Spreadsheet": 50,
      "Manual": 75
    };

    // 6) Bookkeeping frequency uplift %
    const FREQUENCY_PCT = {
      "Monthly": 0,
      "Quarterly": 20,
      "Weekly": 20
    };

    // 7) Record delivery uplift %
    const RECORD_DELIVERY_PCT = {
      "Upload": 0,
      "Post": 50
    };

    // 8) Extras (monthly equivalents)
    const EXTRAS = {
      vat: { monthly: 40, quarterly: 30, annually: 10 },
      cisMonthly: 25,
      confirmationStatementAnnual: 60, // spread monthly
      propertyPct: 15,
      mtdItsaPerTaxpayer: 10
    };

    const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

    function findInvoicePrice(band) {
      const row = INVOICE_PRICE.find(r => r.band === band);
      return row ? row.price : 0;
    }

    function findPayrollPrice(band, cadence = "monthly") {
      const row = PAYROLL_PRICE.find(r => r.band === band);
      if (!row) return 0;
      const map = { monthly: "p1", fortnightly: "p2", weekly: "p3", daily: "p4" };
      const col = map[(cadence || "monthly").toLowerCase()] || "p1";
      return row[col] || 0;
    }

    const pct = (base, p) => base * (p / 100);

    function computePrice(state) {
      const breakdown = [];

      // Base + sector
      const base = BUSINESS_TYPE[state.trading_entity] || 0;
      breakdown.push(["Base (" + (state.trading_entity || "Unknown") + ")", base]);

      const mult = SECTOR_MULTIPLIER[state.sector] ?? 1.0;
      const afterSector = base * mult;
      breakdown.push(["Sector multiplier ×" + mult, money(afterSector - base)]);

      // Invoice band
      const invoices = findInvoicePrice(state.invoices_band || "None");
      breakdown.push(["Invoices (" + (state.invoices_band || "None") + ")", invoices]);

      // Payroll
      const payroll = findPayrollPrice(state.payroll_band || "None", state.payroll_cadence || "monthly");
      if (payroll) breakdown.push(["Payroll (" + (state.payroll_band || "None") + ", " + (state.payroll_cadence || "monthly") + ")", payroll]);

      let subtotal = afterSector + invoices + payroll;

      // Uplifts
      const sysPct = SYSTEM_PCT[state.system] ?? 0;
      if (sysPct) { const val = money(pct(subtotal, sysPct)); breakdown.push(["System uplift (" + state.system + " " + sysPct + "%)", val]); subtotal += val; }

      const freqPct = FREQUENCY_PCT[state.books_frequency] ?? 0;
      if (freqPct) { const val = money(pct(subtotal, freqPct)); breakdown.push(["Bookkeeping frequency uplift (" + state.books_frequency + " " + freqPct + "%)", val]); subtotal += val; }

      const recPct = RECORD_DELIVERY_PCT[state.record_delivery] ?? 0;
      if (recPct) { const val = money(pct(subtotal, recPct)); breakdown.push(["Record delivery uplift (" + state.record_delivery + " " + recPct + "%)", val]); subtotal += val; }

      // Extras
      if (state.vat && /^yes/i.test(state.vat)) {
        const vf = (state.vat_frequency || "quarterly").toLowerCase();
        const vatMonthly = EXTRAS.vat[vf] ?? EXTRAS.vat.quarterly;
        breakdown.push(["VAT returns (" + vf + ")", vatMonthly]);
        subtotal += vatMonthly;
      }

      if (state.cis_monthly && /^yes/i.test(state.cis_monthly)) {
        breakdown.push(["CIS monthly return", EXTRAS.cisMonthly]);
        subtotal += EXTRAS.cisMonthly;
      }

      if (state.trading_entity === "Limited Company") {
        const csMonthly = money(EXTRAS.confirmationStatementAnnual / 12);
        breakdown.push(["Confirmation Statement (pro-rated monthly)", csMonthly]);
        subtotal += csMonthly;
      }

      if (state.is_property_business && /^yes/i.test(state.is_property_business)) {
        const propUplift = money(pct(subtotal, EXTRAS.propertyPct));
        breakdown.push(["Property business uplift (" + EXTRAS.propertyPct + "%)", propUplift]);
        subtotal += propUplift;
      }

      const itsaCount = Number(state.mtd_itsa_count || 0);
      if (itsaCount > 0) {
        const itsa = itsaCount * EXTRAS.mtdItsaPerTaxpayer;
        breakdown.push(["MTD ITSA (" + itsaCount + " taxpayer(s))", itsa]);
        subtotal += itsa;
      }

      const monthly = money(subtotal);
      return { monthly, breakdown };
    }

    return { computePrice };
  })();

  /* ==================== STYLES & MARKUP ==================== */
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
  .qm .hint{font-weight:400;color:var(--muted);font-size:.95rem}
  @media (max-width: 640px){ .qm .row-2{grid-template-columns:1fr} }
  `;

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
              <option>Community Interest Company</option>
              <option>CIS Subcontractor</option>
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
              <option>Retail</option>
              <option>Restaurants & Bars</option>
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

          <div class="grid row-2" role="group" aria-label="Bank accounts (tick all that apply)">
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

          <div class="grid row-2">
            <label>Do you accept cash payments?
              <select name="cash" required>
                <option value="">Select…</option>
                <option>Yes - we account for cash</option>
                <option>No - only card and bank transactions</option>
              </select>
            </label>

            <label>Are you a property business (landlord/portfolio)?
              <select name="is_property_business" required>
                <option value="">Select…</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </label>
          </div>
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
            <label>VAT return frequency (if VAT registered)
              <select name="vat_frequency">
                <option value="">Select…</option>
                <option>monthly</option>
                <option selected>quarterly</option>
                <option>annually</option>
              </select>
            </label>
          </div>

          <div class="grid row-2">
            <label>PAYE (employer)?
              <select name="paye" required>
                <option value="">Select…</option>
                <option>Yes - we run a payroll scheme</option>
                <option>No - not necessary</option>
                <option>No - but we should be thinking about it</option>
              </select>
            </label>
            <label>Construction Industry Scheme (CIS)
              <select name="cis" required>
                <option value="">Select…</option>
                <option>Yes - we have CIS deductions made from income</option>
                <option>Yes - we deduct CIS from our subcontractors pay</option>
                <option>No - we're not in that industry</option>
              </select>
            </label>
          </div>

          <label>CIS monthly returns?
            <select name="cis_monthly" required>
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
                <option>Desktop Based (Sage etc)</option>
                <option>Excel or Spreadsheet</option>
                <option>Manual</option>
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

          <div class="grid row-2">
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

          <div class="grid row-2">
            <label>Bookkeeping frequency
              <select name="books_frequency" required>
                <option value="">Select…</option>
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Weekly</option>
              </select>
            </label>
            <label>How do you deliver records?
              <select name="record_delivery" required>
                <option value="">Select…</option>
                <option>Upload</option>
                <option>Post</option>
              </select>
            </label>
          </div>
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
            <label>If payroll, how many employees per run?
              <select name="payroll_band">
                <option>None</option>
                <option>1 to 5</option>
                <option>6 to 19</option>
                <option>20 to 49</option>
                <option>50 or more</option>
              </select>
            </label>
          </div>

          <div class="grid row-2">
            <label>Payroll cadence
              <select name="payroll_cadence">
                <option>monthly</option>
                <option>fortnightly</option>
                <option>weekly</option>
                <option>daily</option>
              </select>
            </label>
            <label>Sales invoices per month
              <select name="invoices_band">
                <option>None</option>
                <option>1 to 24</option>
                <option>25 to 49</option>
                <option>50 to 99</option>
                <option>100 to 149</option>
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

      <!-- Step 6: Catch-up & MTD ITSA -->
      <section class="step" data-step="6">
        <p class="muted">If you’re behind, how many whole months since year end? (and MTD ITSA if relevant)</p>
        <div class="grid row-2">
          <label>Months to catch up
            <input name="catchup_months" type="number" min="0" step="1" placeholder="0" required />
          </label>
          <label>MTD ITSA taxpayers (number)
            <input name="mtd_itsa_count" type="number" min="0" step="1" value="0" />
          </label>
        </div>

        <label class="hint">Notes (optional)
          <input name="notes" placeholder="E.g. VAT quarters, deadlines, oddities…" />
        </label>

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

  /* ==================== INJECT & STATE ==================== */
  function inject() {
    if (document.getElementById("qmOverlay")) return;
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    const wrap = document.createElement("div"); wrap.innerHTML = html; document.body.appendChild(wrap);
  }

  const state = loadDraft();
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }
  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* ==================== HELPERS ==================== */
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

    $$("input[name], select[name], textarea[name]", root).forEach(el => {
      if (el.type === "checkbox" && el.name === "bank_accounts") return; // handled below
      if ((el.type === "checkbox" || el.type === "radio")) data[el.name] = el.checked;
      else data[el.name] = (el.value || "").trim();
    });

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
      const good = (el.type === "checkbox" || el.type === "radio") ? el.checked : !!(el.value||"").trim();
      if (!good) ok = false;
      el.style.outline = good ? "" : "2px solid #ef4444";
    });
    return ok;
  }

  function summariseBlock(data) {
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
      p("VAT frequency", data.vat_frequency),
      p("PAYE", data.paye),
      p("CIS", data.cis),
      p("CIS monthly", data.cis_monthly),
      p("Backlog", data.backlog),
      p("System", data.system),
      p("Record quality", data.record_quality),
      p("Bank reconciliation", data.bank_rec),
      p("OOP expenses repaid", data.oop_expenses),
      p("Bookkeeping frequency", data.books_frequency),
      p("Record delivery", data.record_delivery),
      p("Who does bookkeeping", data.who_books),
      p("Payroll band", data.payroll_band),
      p("Payroll cadence", data.payroll_cadence),
      p("Invoices band", data.invoices_band),
      p("Who scans/uploads", data.who_scans),
      p("Months to catch up", data.catchup_months),
      p("MTD ITSA taxpayers", data.mtd_itsa_count),
      p("Notes", data.notes)
    ].join("");
  }

  function breakdownHTML(breakdown, monthly) {
    const lines = breakdown.map(([label, value]) => 
      `<p class="muted" style="display:flex;justify-content:space-between;gap:12px"><span>${label}</span><strong>£${Number(value).toFixed(2)}</strong></p>`
    ).join("");
    return `
      <hr style="border:none;border-top:1px solid var(--border);margin:12px 0" />
      <h3 style="margin:0 0 6px">Estimated monthly investment</h3>
      ${lines}
      <p style="display:flex;justify-content:space-between;gap:12px;margin-top:8px">
        <span><strong>Total</strong></span>
        <strong>£${Number(monthly).toFixed(2)}/month</strong>
      </p>
      <p class="hint" style="margin:6px 0 0">Figures are estimates based on your inputs and may change after we review your records.</p>
    `;
  }

  function mailtoHref(data, monthly, breakdown) {
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
      `VAT: ${data.vat || ""} (${data.vat_frequency || ""})`,
      `PAYE: ${data.paye || ""}`,
      `CIS: ${data.cis || ""}`,
      `CIS monthly: ${data.cis_monthly || ""}`,
      `System: ${data.system || ""}`,
      `Record quality: ${data.record_quality || ""}`,
      `Bank rec: ${data.bank_rec || ""}`,
      `OOP expenses: ${data.oop_expenses || ""}`,
      `Bookkeeping frequency: ${data.books_frequency || ""}`,
      `Record delivery: ${data.record_delivery || ""}`,
      `Who does bookkeeping: ${data.who_books || ""}`,
      `Payroll: ${data.payroll_band || "None"} (${data.payroll_cadence || "monthly"})`,
      `Invoices band: ${data.invoices_band || "None"}`,
      `Who scans/uploads: ${data.who_scans || ""}`,
      `Months to catch up: ${data.catchup_months || ""}`,
      `MTD ITSA taxpayers: ${data.mtd_itsa_count || 0}`,
      `Notes: ${data.notes || ""}`,
      ``,
      `Breakdown:`,
      ...breakdown.map(([label, value]) => `  - ${label}: £${Number(value).toFixed(2)}`),
      `Total monthly: £${Number(monthly).toFixed(2)}`
    ];
    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${EMAIL_TO}?subject=${subject}&body=${body}`;
  }

  /* ==================== OPEN/CLOSE & WIRING ==================== */
  function openModal(){
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

  function wire() {
    document.addEventListener("click", (e)=>{
      const t = e.target;

      if (t && t.id === "open-quote-modal") { e.preventDefault(); openModal(); }
      if (t && (t.id === "qmClose" || t.dataset.cancel !== undefined)) { e.preventDefault(); closeModal(); }

      if (t && t.dataset.next !== undefined) {
        e.preventDefault();
        const current = Number($(".qm .step.active").dataset.step);
        if (!validate(current)) return;
        Object.assign(state, readForm()); saveDraft();
        const next = Math.min(current + 1, 7); showStep(next);

        if (next === 7) {
          // Render summary + pricing
          const data = {...state};
          const { monthly, breakdown } = IA_PRICE.computePrice(data);
          const summary = summariseBlock(data) + breakdownHTML(breakdown, monthly);
          $("#qmSummary").innerHTML = summary;
          $("#qmSend").setAttribute("href", mailtoHref(data, monthly, breakdown));
        }
      }

      if (t && t.dataset.back !== undefined) {
        e.preventDefault();
        const current = Number($(".qm .step.active").dataset.step);
        Object.assign(state, readForm()); saveDraft();
        showStep(Math.max(1, current - 1));
      }
    });

    // Overlay click closes
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
      openModal();
    }
  }

  // Init
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();

})();
