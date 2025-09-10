// /assets/js/quote-wizard.js
// Integrated Accounts — Quote Wizard (branching, one Q per page)
// Reuses IA_PRICE.computePrice from quote-modal.js

(function(){
  const STORAGE_KEY = "iaQuoteWizard";
  const root = document.getElementById("quote-root");

  // ---- FLOW SCHEMA ----
  const FLOW = {
    start: {
      title: "Let’s get you a bespoke quote",
      name: "start",
      type: "button",
      options: [{label:"Begin", value:"go"}],
      next: () => "trading_entity"
    },
    trading_entity: {
      title: "Trading entity",
      name: "trading_entity",
      type: "select",
      required: true,
      options: ["Limited Company","Sole Trader","Partnership/LLP","Community Interest Company","CIS Subcontractor"],
      next: (s) => s.trading_entity==="Limited Company" ? "confirm_stmt" : "sector"
    },
    confirm_stmt: {
      title: "Companies House Confirmation Statement?",
      name: "confirm_stmt",
      type: "select",
      options: ["Yes","No"],
      required: true,
      next: () => "sector"
    },
    sector: {
      title: "Sector",
      name: "sector",
      type: "select",
      required: true,
      options: ["Professional & Consulting","Trades & Construction","Hospitality & Retail","Creative & Media","Tech & SaaS","Retail","Restaurants & Bars","Other"],
      next: () => "property"
    },
    property: {
      title: "Is this a property business?",
      name: "is_property_business",
      type: "select",
      required: true,
      options: ["Yes","No"],
      next: () => "vat"
    },
    vat: {
      title: "Are you VAT registered?",
      name: "vat",
      type: "select",
      options: ["Yes","No"],
      required: true,
      next: (s)=> s.vat==="Yes" ? "vat_frequency" : "payroll_band"
    },
    vat_frequency: {
      title: "VAT return frequency",
      name: "vat_frequency",
      type: "select",
      options: ["monthly","quarterly","annually"],
      required: true,
      next: () => "payroll_band"
    },
    payroll_band: {
      title: "Payroll size",
      name: "payroll_band",
      type: "select",
      options: ["None","1 to 5","6 to 19","20 to 49","50 or more"],
      required: true,
      next: (s)=> s.payroll_band==="None" ? "invoices_band" : "payroll_cadence"
    },
    payroll_cadence: {
      title: "Payroll frequency",
      name: "payroll_cadence",
      type: "select",
      options: ["monthly","fortnightly","weekly","daily"],
      required: true,
      next: () => "invoices_band"
    },
    invoices_band: {
      title: "Sales invoices per month",
      name: "invoices_band",
      type: "select",
      options: ["None","1 to 24","25 to 49","50 to 99","100 to 149"],
      required: true,
      next: () => "system"
    },
    system: {
      title: "Accounting system",
      name: "system",
      type: "select",
      options: ["Cloud Based (Xero, Quickbooks etc)","Desktop Based (Sage etc)","Excel or Spreadsheet","Manual"],
      required: true,
      next: () => "books_frequency"
    },
    books_frequency: {
      title: "Bookkeeping frequency",
      name: "books_frequency",
      type: "select",
      options: ["Monthly","Quarterly","Weekly"],
      required: true,
      next: () => "record_delivery"
    },
    record_delivery: {
      title: "How do you deliver records?",
      name: "record_delivery",
      type: "select",
      options: ["Upload","Post"],
      required: true,
      next: () => "catchup_months"
    },
    catchup_months: {
      title: "Months to catch up",
      name: "catchup_months",
      type: "number",
      required: true,
      next: () => "mtd_itsa_count"
    },
    mtd_itsa_count: {
      title: "MTD ITSA taxpayers",
      name: "mtd_itsa_count",
      type: "number",
      required: false,
      next: () => "review"
    },
    review: {
      title: "Review & send",
      type: "review"
    }
  };

  // ---- STATE ----
  let state = load();
  let path = ["start"];

  function load(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")}catch{return{}} }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  // ---- RENDER ----
  function render(){
    const node = FLOW[path[path.length-1]];
    if (!node) return root.innerHTML="<p>Error</p>";

    root.innerHTML = `
      <div class="card" style="max-width:600px;margin:24px auto;padding:16px">
        <h2>${node.title}</h2>
        <div id="q-body"></div>
        <div style="display:flex;justify-content:space-between;margin-top:12px">
          <button class="btn secondary" id="q-back" ${path.length===1?'disabled':''}>Back</button>
          ${node.type==="review"
            ? `<a class="btn" id="q-send" href="#">Send</a>`
            : `<button class="btn" id="q-next">Next</button>`}
        </div>
      </div>
    `;

    const body = document.getElementById("q-body");
    if (node.type==="select") {
      body.innerHTML = `<select name="${node.name}" class="form-control">${node.options.map(o=>
        `<option ${state[node.name]===o?'selected':''}>${o}</option>`).join("")}</select>`;
    } else if (node.type==="number") {
      body.innerHTML = `<input type="number" name="${node.name}" value="${state[node.name]||''}" min="0">`;
    } else if (node.type==="button") {
      body.innerHTML = node.options.map(o=>`<button class="btn secondary" data-val="${o.value}">${o.label}</button>`).join("");
      body.addEventListener("click",(e)=>{
        if(e.target.dataset.val){ state[node.name]=e.target.dataset.val; save(); next(); }
      });
    } else if (node.type==="review") {
      const { monthly, breakdown } = IA_PRICE.computePrice(state);
      body.innerHTML = `
        ${Object.entries(state).map(([k,v])=>`<p class="muted"><strong>${k}:</strong> ${v}</p>`).join("")}
        <hr><h3>Estimated monthly: £${monthly.toFixed(2)}</h3>
        ${breakdown.map(([l,v])=>`<p>${l}: £${v.toFixed(2)}</p>`).join("")}
      `;
      document.getElementById("q-send").setAttribute("href",mailtoHref(state,monthly,breakdown));
    }

    document.getElementById("q-back").onclick = ()=>{ if(path.length>1){ path.pop(); render(); } };
    const nextBtn = document.getElementById("q-next");
    if (nextBtn) nextBtn.onclick = ()=> next();
  }

  function next(){
    const node = FLOW[path[path.length-1]];
    const el = root.querySelector(`[name=${node.name}]`);
    if (el) { state[node.name] = el.value; save(); }
    const nextId = typeof node.next==="function"? node.next(state): node.next;
    if(nextId){ path.push(nextId); render(); }
  }

  function mailtoHref(data, monthly, breakdown){
    const subject=encodeURIComponent(`Quote — ${data.business_name||data.trading_entity||""}`);
    const lines=[...Object.entries(data).map(([k,v])=>`${k}: ${v}`), "", "Breakdown:", ...breakdown.map(([l,v])=>`${l}: £${v}`), `Total: £${monthly}`];
    return `mailto:${EMAIL_TO}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  render();
})();