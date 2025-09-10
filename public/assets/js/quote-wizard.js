// /assets/js/quote-wizard.js
// Integrated Accounts — Single-question Quote Wizard (v3)
// - Self-contained: pricing engine included
// - Fetches Supabase credentials from Vercel: /api/supabase-env
// - Saves to Supabase (insert-only), with mailto & copy fallbacks
// - Branching flow; localStorage persistence

(function(){
  /* ======================= PRICING ENGINE ======================= */
  const IA_PRICE = (() => {
    const BUSINESS_TYPE = {
      "Limited Company": 450,
      "Sole Trader": 275,
      "CIS Subcontractor": 350,
      "Partnership/LLP": 450,
      "Community Interest Company": 375
    };
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
    const INVOICE_PRICE = [
      { band: "None", price: 0 },
      { band: "1 to 24", price: 600 },
      { band: "25 to 49", price: 900 },
      { band: "50 to 99", price: 1200 },
      { band: "100 to 149", price: 1800 }
    ];
    const PAYROLL_PRICE = [
      { band: "None", p1: 0,   p2: 0,   p3: 0,   p4: 0 },
      { band: "1 to 5", p1: 20, p2: 22, p3: 40,  p4: 80 },
      { band: "6 to 19", p1: 60, p2: 62, p3: 120, p4: 240 },
      { band: "20 to 49", p1: 140,p2: 142,p3: 280, p4: 560 },
      { band: "50 or more", p1: 180,p2: 182,p3: 360, p4: 720 }
    ];
    const SYSTEM_PCT = {
      "Cloud Based (Xero, Quickbooks etc)": 0,
      "Desktop Based (Sage etc)": 30,
      "Excel or Spreadsheet": 50,
      "Manual": 75
    };
    const FREQUENCY_PCT = { "Monthly": 0, "Quarterly": 20, "Weekly": 20 };
    const RECORD_DELIVERY_PCT = { "Upload": 0, "Post": 50 };
    const EXTRAS = {
      vat: { monthly: 40, quarterly: 30, annually: 10 },
      cisMonthly: 25,
      confirmationStatementAnnual: 60,
      propertyPct: 15,
      mtdItsaPerTaxpayer: 10
    };

    const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const pct   = (base, p) => base * (p / 100);

    function findInvoicePrice(band){ return (INVOICE_PRICE.find(r=>r.band===band)?.price)||0; }
    function findPayrollPrice(band, cadence="monthly"){
      const row = PAYROLL_PRICE.find(r=>r.band===band); if(!row) return 0;
      const map = { monthly:"p1", fortnightly:"p2", weekly:"p3", daily:"p4" };
      return row[map[cadence]||"p1"]||0;
    }

    function computePrice(state){
      const breakdown = [];
      const base = BUSINESS_TYPE[state.trading_entity] || 0;
      breakdown.push([`Base (${state.trading_entity||"Unknown"})`, base]);

      const mult = SECTOR_MULTIPLIER[state.sector] ?? 1.0;
      const afterSector = base * mult;
      breakdown.push([`Sector multiplier ×${mult}`, money(afterSector - base)]);

      const invoices = findInvoicePrice(state.invoices_band || "None");
      breakdown.push([`Invoices (${state.invoices_band||"None"})`, invoices]);

      const payroll = findPayrollPrice(state.payroll_band || "None", (state.payroll_cadence||"monthly").toLowerCase());
      if (payroll) breakdown.push([`Payroll (${state.payroll_band||"None"}, ${state.payroll_cadence||"monthly"})`, payroll]);

      let subtotal = afterSector + invoices + payroll;

      const sysPct = SYSTEM_PCT[state.system] ?? 0;
      if (sysPct) { const v=money(pct(subtotal, sysPct)); breakdown.push([`System uplift (${state.system} ${sysPct}%)`, v]); subtotal += v; }

      const freqPct = FREQUENCY_PCT[state.books_frequency] ?? 0;
      if (freqPct) { const v=money(pct(subtotal, freqPct)); breakdown.push([`Bookkeeping frequency uplift (${state.books_frequency} ${freqPct}%)`, v]); subtotal += v; }

      const recPct = RECORD_DELIVERY_PCT[state.record_delivery] ?? 0;
      if (recPct) { const v=money(pct(subtotal, recPct)); breakdown.push([`Record delivery uplift (${state.record_delivery} ${recPct}%)`, v]); subtotal += v; }

      if (state.vat && /^yes/i.test(state.vat)) {
        const vf = (state.vat_frequency||"quarterly").toLowerCase();
        const v  = EXTRAS.vat[vf] ?? EXTRAS.vat.quarterly;
        breakdown.push([`VAT returns (${vf})`, v]); subtotal += v;
      }
      if (state.cis_monthly && /^yes/i.test(state.cis_monthly)) {
        breakdown.push(["CIS monthly return", EXTRAS.cisMonthly]); subtotal += EXTRAS.cisMonthly;
      }
      if (state.trading_entity === "Limited Company") {
        const v = money(EXTRAS.confirmationStatementAnnual/12);
        breakdown.push(["Confirmation Statement (pro-rated monthly)", v]); subtotal += v;
      }
      if (state.is_property_business && /^yes/i.test(state.is_property_business)) {
        const v = money(pct(subtotal, EXTRAS.propertyPct));
        breakdown.push([`Property business uplift (${EXTRAS.propertyPct}%)`, v]); subtotal += v;
      }
      const itsaCount = Number(state.mtd_itsa_count||0);
      if (itsaCount>0){ const v = itsaCount*EXTRAS.mtdItsaPerTaxpayer; breakdown.push([`MTD ITSA (${itsaCount} taxpayer/s)`, v]); subtotal += v; }

      return { monthly: money(subtotal), breakdown };
    }

    return { computePrice };
  })();

  /* ======================= SUPABASE FETCH ======================= */
  let cachedEnv = null;
  async function getSupabaseEnv(){
    if (cachedEnv) return cachedEnv;
    try {
      const res = await fetch("/api/supabase-env");
      if (!res.ok) throw new Error("Bad env response");
      const json = await res.json();
      cachedEnv = json;
      return json;
    } catch (e) {
      return { SUPABASE_URL:"", SUPABASE_ANON_KEY:"", configured:false, error:String(e) };
    }
  }

  async function saveToSupabase(payload){
    const env = await getSupabaseEnv();
    if (!env.configured) return { ok:false, error:"Supabase not configured" };
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const { error } = await supabase.from("quote_leads").insert(payload);
    return { ok: !error, error };
  }

  /* ======================= FLOW & STATE ======================= */
  const STORAGE_KEY = "iaQuoteWizard";
  const root = document.getElementById("quote-root");
  if (!root) return;

  const FLOW = {
    start:             { t:"Let’s get you a bespoke quote", k:"_start", tp:"button", options:[{label:"Begin", value:"go"}], next: ()=>"trading_entity" },
    trading_entity:    { t:"Trading entity", k:"trading_entity", tp:"select", req:true, options:["Limited Company","Sole Trader","Partnership/LLP","Community Interest Company","CIS Subcontractor"], next:(s)=> s.trading_entity==="Limited Company" ? "confirm_stmt" : "sector" },
    confirm_stmt:      { t:"Companies House Confirmation Statement?", k:"confirm_stmt", tp:"select", req:true, options:["Yes","No"], next: ()=>"sector" },
    sector:            { t:"Sector", k:"sector", tp:"select", req:true, options:["Professional & Consulting","Trades & Construction","Hospitality & Retail","Creative & Media","Tech & SaaS","Retail","Restaurants & Bars","Other"], next:()=> "property" },
    property:          { t:"Is this a property business?", k:"is_property_business", tp:"select", req:true, options:["Yes","No"], next:()=> "vat" },
    vat:               { t:"Are you VAT registered?", k:"vat", tp:"select", req:true, options:["Yes","No"], next:(s)=> s.vat==="Yes" ? "vat_frequency" : "payroll_band" },
    vat_frequency:     { t:"VAT return frequency", k:"vat_frequency", tp:"select", req:true, options:["monthly","quarterly","annually"], next:()=> "payroll_band" },
    payroll_band:      { t:"Payroll size", k:"payroll_band", tp:"select", req:true, options:["None","1 to 5","6 to 19","20 to 49","50 or more"], next:(s)=> s.payroll_band==="None" ? "invoices_band" : "payroll_cadence" },
    payroll_cadence:   { t:"Payroll frequency", k:"payroll_cadence", tp:"select", req:true, options:["monthly","fortnightly","weekly","daily"], next:()=> "invoices_band" },
    invoices_band:     { t:"Sales invoices per month", k:"invoices_band", tp:"select", req:true, options:["None","1 to 24","25 to 49","50 to 99","100 to 149"], next:()=> "system" },
    system:            { t:"Accounting system", k:"system", tp:"select", req:true, options:["Cloud Based (Xero, Quickbooks etc)","Desktop Based (Sage etc)","Excel or Spreadsheet","Manual"], next:()=> "books_frequency" },
    books_frequency:   { t:"Bookkeeping frequency", k:"books_frequency", tp:"select", req:true, options:["Monthly","Quarterly","Weekly"], next:()=> "record_delivery" },
    record_delivery:   { t:"How do you deliver records?", k:"record_delivery", tp:"select", req:true, options:["Upload","Post"], next:()=> "catchup_months" },
    catchup_months:    { t:"Months to catch up (beyond current year)", k:"catchup_months", tp:"number", req:true, min:0, step:1, next:()=> "mtd_itsa_count" },
    mtd_itsa_count:    { t:"MTD ITSA taxpayers (if any)", k:"mtd_itsa_count", tp:"number", req:false, min:0, step:1, next:()=> "review" },
    review:            { t:"Review & send", k:"_review", tp:"review" }
  };

  let state = load();
  let path  = ["start"];

  function load(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}catch{return{}} }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  /* ======================= RENDER ======================= */
  function labelise(k){ return k.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); }
  function pulse(el){ el.style.boxShadow="0 0 0 2px #ef4444 inset"; setTimeout(()=> el.style.boxShadow="", 450); }

  function render(){
    const node = FLOW[path[path.length-1]];
    if (!node){ root.innerHTML="<p>Something went wrong.</p>"; return; }

    root.innerHTML = `
      <div class="card" style="max-width:720px;margin:24px auto;padding:16px">
        <div class="muted" style="margin-bottom:8px">Step ${path.length} of ~${Object.keys(FLOW).length-1}</div>
        <h1 style="margin:.25rem 0">${node.t}</h1>
        <div id="q-body"></div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:12px;flex-wrap:wrap">
          <div>
            <button class="btn secondary" id="q-back" ${path.length===1?'disabled':''}>Back</button>
          </div>
          <div id="q-actions">
            ${node.tp==="review"
              ? `<a class="btn" id="q-send" href="#">Email result</a>
                 <button class="btn secondary" id="q-copy">Copy summary</button>
                 <button class="btn secondary" id="q-save">Save to CRM</button>`
              : `<button class="btn" id="q-next">Next</button>`
            }
          </div>
        </div>
      </div>
    `;

    const body = document.getElementById("q-body");
    if (node.tp==="select") {
      body.innerHTML = `
        <label style="display:grid;gap:6px;font-weight:600">
          <select name="${node.k}">
            <option value="">Select…</option>
            ${(node.options||[]).map(o=>`<option ${state[node.k]===o?'selected':''}>${o}</option>`).join("")}
          </select>
        </label>`;
    } else if (node.tp==="number") {
      body.innerHTML = `
        <label style="display:grid;gap:6px;font-weight:600">
          <input type="number" name="${node.k}" value="${state[node.k]||''}" min="${node.min||0}" step="${node.step||1}">
        </label>`;
    } else if (node.tp==="button") {
      body.innerHTML = node.options.map(o=>`<button class="btn secondary" data-val="${o.value}">${o.label}</button>`).join("");
      body.addEventListener("click",(e)=>{
        const val = e.target?.dataset?.val;
        if (!val) return;
        state[node.k]=val; save(); goNext();
      });
    } else if (node.tp==="review") {
      const { monthly, breakdown } = IA_PRICE.computePrice(state);
      body.innerHTML = `
        ${Object.entries(state).map(([k,v])=>`<p class="muted"><strong>${labelise(k)}:</strong> ${v||''}</p>`).join("")}
        <hr style="border:none;border-top:1px solid var(--border);margin:12px 0" />
        <h3 style="margin:0 0 6px">Estimated monthly investment</h3>
        ${breakdown.map(([l,v])=>`<p class="muted" style="display:flex;justify-content:space-between"><span>${l}</span><strong>£${Number(v).toFixed(2)}</strong></p>`).join("")}
        <p style="display:flex;justify-content:space-between"><span><strong>Total</strong></span><strong>£${Number(monthly).toFixed(2)}/month</strong></p>
        <p class="hint" style="margin-top:6px">Figures are estimates and may change after we review your records.</p>
      `;

      // Wire review actions
      const sendBtn = document.getElementById("q-send");
      const copyBtn = document.getElementById("q-copy");
      const saveBtn = document.getElementById("q-save");

      sendBtn.setAttribute("href", buildMailto(state, monthly, breakdown));
      copyBtn.onclick = () => copySummary(state, monthly, breakdown, copyBtn);

      // If Supabase not configured, disable Save button gracefully
      getSupabaseEnv().then(env => {
        if (!env.configured) {
          saveBtn.disabled = true;
          saveBtn.title = "Supabase not configured on this deployment";
        }
      });

      saveBtn.onclick = async ()=>{
        saveBtn.disabled = true; const old = saveBtn.textContent; saveBtn.textContent="Saving…";
        const payload = {
          contact_name: state.contact_name || null,
          email: state.email || null,
          phone: state.phone || null,
          business_name: state.business_name || null,
          monthly,
          breakdown,
          answers: state,
          source_page: location.pathname,
          referer: document.referrer || null,
          user_agent: navigator.userAgent || null
        };
        const res = await saveToSupabase(payload);
        saveBtn.textContent = res.ok ? "Saved ✓" : "Save failed — try again";
        if (!res.ok) saveBtn.disabled = false; else setTimeout(()=>{ saveBtn.disabled=false; saveBtn.textContent=old; }, 1500);
      };
    }

    // nav buttons
    document.getElementById("q-back").onclick = ()=>{ if(path.length>1){ path.pop(); render(); } };
    const nextBtn = document.getElementById("q-next");
    if (nextBtn) nextBtn.onclick = goNext;

    // persist select/number immediately
    const inputEl = root.querySelector(`[name="${node.k}"]`);
    if (inputEl) inputEl.addEventListener("change", (e)=>{ state[node.k]=e.target.value; save(); });
  }

  function goNext(){
    const node = FLOW[path[path.length-1]];
    // required check
    if (node.req && (state[node.k]===undefined || state[node.k]==="" )) { pulse(root); return; }
    const nextId = typeof node.next==="function" ? node.next(state) : node.next;
    if (nextId){ path.push(nextId); render(); }
  }

  /* ======================= UTILITIES ======================= */
  function labelise(k){ return k.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); }
  function textSummary(state, monthly, breakdown){
    const lines = [
      ...Object.entries(state).map(([k,v])=>`${labelise(k)}: ${v??''}`),
      "",
      "Breakdown:",
      ...breakdown.map(([l,v])=>`  - ${l}: £${Number(v).toFixed(2)}`),
      `Total monthly: £${Number(monthly).toFixed(2)}`
    ];
    return lines.join("\n");
  }
  function buildMailto(state, monthly, breakdown){
    const subject = encodeURIComponent(`Quote — ${state.business_name || state.trading_entity || "New enquiry"}`);
    const body = encodeURIComponent(textSummary(state, monthly, breakdown));
    return `mailto:info@integratedaccounts.co.uk?subject=${subject}&body=${body}`;
  }
  async function copySummary(state, monthly, breakdown, btn){
    const txt = textSummary(state, monthly, breakdown);
    try { await navigator.clipboard.writeText(txt); btn.textContent="Copied ✓"; }
    catch { btn.textContent="Copy failed"; }
    setTimeout(()=> btn.textContent="Copy summary", 1500);
  }

  /* ======================= BOOT ======================= */
  render();
})();

