// Wizard v5

/* Wizard v5 — single-file refactor (Block 1/2) */
(function () {
  const STORAGE_KEY = "quote_wizard_state_v5";

/* ========== DOM + Styles ========== */
  function ensureRoot() {
    let root = document.getElementById("wizard-root");
    if (!root) { root = document.createElement("div"); root.id = "wizard-root"; document.body.appendChild(root); }
    root.classList.add("wizard-root"); return root;
  }
  function injectStyles() {
    if (document.getElementById("wizard-v5-styles")) return;
    const css = `
      .wizard-root{max-width:720px;margin:0 auto;padding:20px}
      .wiz-progress{height:6px;background:#eee;border-radius:999px;overflow:hidden;margin:6px 0 18px}
      .wiz-progress>.bar{height:100%;width:0%;background:#4f46e5;transition:width .3s}
      .wiz-step{opacity:0;transform:translateY(6px);transition:opacity .22s,transform .22s;display:none}
      .wiz-step.active{opacity:1;transform:none;display:block}
      .wiz-label{display:block;font-weight:600;margin:12px 0 6px}
      .wiz-input{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:16px}
      .wiz-actions{margin-top:16px;display:flex;gap:10px}
      .wiz-btn{border:0;border-radius:12px;padding:10px 14px;font-weight:600;cursor:pointer}
      .wiz-btn.primary{background:#4f46e5;color:#fff}
      .wiz-btn.ghost{background:transparent;border:1px solid #d1d5db}
      .wiz-helper{color:#6b7280;margin:6px 0 2px}
      .wiz-error{color:#b91c1c;margin-top:8px}
    `;
    const s = document.createElement("style"); s.id="wizard-v5-styles"; s.textContent=css; document.head.appendChild(s);
  }

/* ========== UTM + State ========== */
  function readUTMs() {
    try {
      const p = new URLSearchParams(location.search);
      const keys = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
      const out = {}; let found=false; keys.forEach(k=>{const v=p.get(k); if(v){out[k]=v; found=true;}});
      return found ? out : null;
    } catch { return null; }
  }
  function initState(){ return {
    index:0, utms:readUTMs(), createdAt:new Date().toISOString(),
    contact:{name:"",email:"",businessName:""}, entityType:null, route:null,
    isConstruction:false, mtdItsaFlag:false, answers:{} }; }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch{return null;} }
  function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function resetState(){ state = initState(); saveState(); }
  let state = loadState() || initState();

/* ========== Registry + Order ========== */
  const registry = new Map(); // key -> {render, validate, persist}
  const stepsOrder = [
    "contact","businessType","sector","cis","turnoverBand","mtdItsaNote",
    "ownersCount","paye","vat","vatFlatRate","geography","multicurrency",
    "bankAccounts","systems","requirements"
  ];
  function addStep(key, def){ registry.set(key, def); }

/* ========== Chrome + Nav ========== */
  let root, progressEl, stepsWrap;
  function renderChrome(){
    root.innerHTML="";
    progressEl=document.createElement("div"); progressEl.className="wiz-progress";
    const bar=document.createElement("div"); bar.className="bar"; bar.id="wiz-bar"; progressEl.appendChild(bar);
    stepsWrap=document.createElement("div"); root.appendChild(progressEl); root.appendChild(stepsWrap);
  }
  function updateProgress(){ const bar=document.getElementById("wiz-bar");
    const pct=Math.round(((state.index+1)/stepsOrder.length)*100); if(bar) bar.style.width=`${pct}%`; }
  function renderError(msg){ let el=document.getElementById("wiz-error");
    if(!el){ el=document.createElement("p"); el.id="wiz-error"; el.className="wiz-error"; stepsWrap.appendChild(el); }
    el.textContent=msg;
  }
  function showStep(i){
    state.index=i; saveState(); stepsWrap.innerHTML="";
    const key=stepsOrder[i]; const def=registry.get(key);
    const stepEl=document.createElement("section"); stepEl.className="wiz-step active";
    if(!def){ stepEl.innerHTML=`<p class="wiz-error">Step "${key}" not registered.</p>`; stepsWrap.appendChild(stepEl); updateProgress(); return; }
    def.render.call(def, stepEl); stepsWrap.appendChild(stepEl); updateProgress();
    const first=stepEl.querySelector("input,select,textarea,button"); if(first) first.focus();
  }
  function next(){
    const key=stepsOrder[state.index]; const def=registry.get(key);
    if(def?.validate){ const err=def.validate(); if(err){ renderError(err); return; } }
    if(def?.persist) def.persist();
    const n=Math.min(state.index+1, stepsOrder.length-1); if(n!==state.index) showStep(n);
  }
  function prev(){ const p=Math.max(state.index-1,0); if(p!==state.index) showStep(p); }

/* ========== Public API (minimal) ========== */
  window.Wizard = {
    getState: ()=>({...state}),
    reset: resetState,
    getSteps: ()=>[...stepsOrder],
    next, prev, showStep: (i)=>showStep(Math.max(0,Math.min(i,stepsOrder.length-1)))
  };

/* ========== Step: Contact ========== */
  addStep("contact", {
    render(container){
      const self=this;
      container.innerHTML = `
        <h2>Let’s start with your details</h2>
        <p class="wiz-helper">We’ll use this to send your quote and follow up if needed.</p>
        <label class="wiz-label" for="lead_name">Your name *</label>
        <input id="lead_name" class="wiz-input" type="text" autocomplete="name" placeholder="Jane Doe" />
        <label class="wiz-label" for="lead_email">Email *</label>
        <input id="lead_email" class="wiz-input" type="email" autocomplete="email" placeholder="jane@example.com" />
        <label class="wiz-label" for="lead_business">Business name (optional)</label>
        <input id="lead_business" class="wiz-input" type="text" autocomplete="organization" placeholder="Acme Ltd" />
        <div class="wiz-actions">
          <button id="c-prev" class="wiz-btn ghost" type="button" style="visibility:hidden">Back</button>
          <button id="c-next" class="wiz-btn primary" type="button">Next</button>
        </div>
      `;
      const nameEl=container.querySelector('#lead_name'),
            emailEl=container.querySelector('#lead_email'),
            bizEl=container.querySelector('#lead_business');
      nameEl.value=state.contact.name||""; emailEl.value=state.contact.email||""; bizEl.value=state.contact.businessName||"";
      const onEnter=(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); next(); } };
      [nameEl,emailEl,bizEl].forEach(el=>{
        el.addEventListener("keydown",onEnter);
        el.addEventListener("input",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); });
        el.addEventListener("blur", ()=> self.persist());
      });
      container.querySelector("#c-next").addEventListener("click", next);
    },
    validate(){
      const name=(document.getElementById('lead_name')?.value||'').trim();
      const email=(document.getElementById('lead_email')?.value||'').trim();
      if(name.length<2) return "Please enter your full name.";
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";
      return null;
    },
    persist(){
      const name=(document.getElementById('lead_name')?.value||'').trim();
      const email=(document.getElementById('lead_email')?.value||'').trim();
      const businessName=(document.getElementById('lead_business')?.value||'').trim();
      state.contact={name,email,businessName}; state.answers.contact={...state.contact}; saveState();
    }
  });

/* ========== Step: Business Type (sets route) ========== */
  addStep("businessType", {
    render(container){
      const self=this;
      container.innerHTML = `
        <h2>What type of business is this?</h2>
        <p class="wiz-helper">We’ll tailor the next questions based on your choice.</p>
        <label class="wiz-label">Choose one *</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="entity" value="sole_trader" /> <span>Sole trader / Freelancer</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="entity" value="partnership" /> <span>Partnership (non-LLP)</span></label>
        <label style="display:flex;gap:8px;margin:10px 0 4px;"><input type="radio" name="entity" value="ltd" /> <span>Limited company (Ltd)</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="entity" value="llp" /> <span>Partnership (LLP)</span></label>
        <div class="wiz-actions">
          <button id="biz-prev" class="wiz-btn ghost" type="button">Back</button>
          <button id="biz-next" class="wiz-btn primary" type="button">Next</button>
        </div>
      `;
      const radios=[...container.querySelectorAll('input[name="entity"]')];
      const chosen=state.answers?.businessType?.value || state.entityType;
      if(chosen){ const m=radios.find(r=>r.value===chosen); if(m) m.checked=true; }
      radios.forEach(r=>{
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
        r.addEventListener("change",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
      });
      container.querySelector("#biz-prev").addEventListener("click", prev);
      container.querySelector("#biz-next").addEventListener("click", next);
    },
    validate(){ const sel=document.querySelector('input[name="entity"]:checked'); if(!sel) return "Please choose a business type."; return null; },
    persist(){
      const sel=document.querySelector('input[name="entity"]:checked'); const value=sel?sel.value:"";
      const route=(value==="sole_trader"||value==="partnership")?"route1":"route2";
      state.entityType=value; state.route=route; state.answers.businessType={value,route}; saveState();
    }
  });

/* ========== Step: Sector ========== */
  addStep("sector", {
    render(container){
      const self=this;
      const suggestions=["Construction / Building / Trades","Retail","eCommerce","Hospitality","Professional services","Creative / Media","Tech / Software","Healthcare","Manufacturing","Other"];
      const val=state.answers?.sector?.value || "";
      container.innerHTML=`
        <h2>Which sector best describes the business?</h2>
        <p class="wiz-helper">Pick one or type your own.</p>
        <label class="wiz-label" for="sector_input">Business sector *</label>
        <input id="sector_input" class="wiz-input" list="sector_list" placeholder="e.g., Construction, Retail, eCommerce" />
        <datalist id="sector_list">${suggestions.map(s=>`<option value="${s}"></option>`).join("")}</datalist>
        <div class="wiz-actions"><button id="sec-prev" class="wiz-btn ghost" type="button">Back</button><button id="sec-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const input=container.querySelector('#sector_input'); input.value=val;
      input.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      input.addEventListener("input",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); });
      input.addEventListener("blur", ()=> self.persist());
      container.querySelector("#sec-prev").addEventListener("click", prev);
      container.querySelector("#sec-next").addEventListener("click", next);
    },
    validate(){ const v=(document.getElementById('sector_input')?.value||'').trim(); if(!v) return "Please choose or enter a sector."; return null; },
    persist(){
      const v=(document.getElementById('sector_input')?.value||'').trim();
      const norm=v.toLowerCase(); const isConstruction=/\b(construction|building|trades?)\b/i.test(norm);
      state.isConstruction=!!isConstruction; state.answers.sector={value:v,isConstruction:!!isConstruction}; saveState();
    }
  });

/* ========== Step: CIS (conditional by construction + route) ========== */
  addStep("cis", {
    render(container){
      const self=this;
      if(!state.isConstruction){ state.answers.cis={applicable:false}; saveState(); setTimeout(()=>next(),0);
        container.innerHTML=`<p class="wiz-helper">Skipping CIS (not applicable).</p>`; return; }
      const isR1=state.route==="route1";
      const q=isR1 ? "Are you a subcontractor and do you suffer CIS deductions?" :
                     "Are you a contractor and do you make CIS deductions from subcontractors?";
      const stored=state.answers?.cis || {};
      container.innerHTML=`
        <h2>CIS status</h2><p class="wiz-helper">Construction Industry Scheme (CIS)</p>
        <label class="wiz-label">${q} *</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="cis_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="cis_yesno" value="no" /> <span>No</span></label>
        <div class="wiz-actions"><button id="cis-prev" class="wiz-btn ghost" type="button">Back</button><button id="cis-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="cis_yesno"]')];
      if(stored?.answer){ const m=radios.find(r=>r.value===stored.answer); if(m) m.checked=true; }
      radios.forEach(r=>{
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
        r.addEventListener("change",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
      });
      container.querySelector("#cis-prev").addEventListener("click", prev);
      container.querySelector("#cis-next").addEventListener("click", next);
    },
    validate(){ if(!state.isConstruction) return null;
      const sel=document.querySelector('input[name="cis_yesno"]:checked'); if(!sel) return "Please answer the CIS question."; return null; },
    persist(){
      if(!state.isConstruction) return;
      const sel=document.querySelector('input[name="cis_yesno"]:checked'); const ans=sel?sel.value:"";
      const isR2=state.route==="route2";
      state.answers.cis={applicable:true, role: state.route==="route1"?"subcontractor":"contractor", answer:ans, cisReturnsRequired: isR2 && ans==="yes"};
      saveState();
    }
  });

/* ========== Step: Turnover Band ========== */
  addStep("turnoverBand", {
    render(container){
      const self=this;
      const bands=["Under £20k","£20k–£50k","£50k–£85k","£85k–£150k","£150k–£300k","£300k–£600k","£600k–£1m","Over £1m"];
      const v=state.answers?.turnoverBand?.value||"";
      container.innerHTML=`
        <h2>What’s your annual turnover?</h2>
        <p class="wiz-helper">An estimate is fine.</p>
        <label class="wiz-label" for="turnover_select">Turnover band *</label>
        <select id="turnover_select" class="wiz-input">
          <option value="">Select a band</option>${bands.map(b=>`<option value="${b}">${b}</option>`).join("")}
        </select>
        <div class="wiz-actions"><button id="to-prev" class="wiz-btn ghost" type="button">Back</button><button id="to-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const sel=container.querySelector('#turnover_select'); sel.value=v;
      sel.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      sel.addEventListener("change",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
      container.querySelector("#to-prev").addEventListener("click", prev);
      container.querySelector("#to-next").addEventListener("click", next);
    },
    validate(){ const v=(document.getElementById('turnover_select')?.value||'').trim(); if(!v) return "Please choose a turnover band."; return null; },
    persist(){
      const v=(document.getElementById('turnover_select')?.value||'').trim();
      state.answers.turnoverBand={value:v};
      state.mtdItsaFlag = state.route==="route1"; if(state.mtdItsaFlag) state.mtdItsaTaxpayers=1;
      saveState();
    }
  });

/* ========== Step: MTD ITSA Note (route1 only) ========== */
  addStep("mtdItsaNote", {
    render(container){
      if(state.route!=="route1"){ setTimeout(()=>next(),0); container.innerHTML=`<p class="wiz-helper">Skipping MTD ITSA note (not applicable).</p>`; return; }
      container.innerHTML=`
        <h2>MTD ITSA (Heads-up)</h2>
        <p class="wiz-helper">We’ll monitor Making Tax Digital for Income Tax based on your answers. This won’t stop the flow.</p>
        <div class="wiz-actions"><button id="mtd-prev" class="wiz-btn ghost" type="button">Back</button><button id="mtd-next" class="wiz-btn primary" type="button">Continue</button></div>
      `;
      container.querySelector("#mtd-prev").addEventListener("click", prev);
      container.querySelector("#mtd-next").addEventListener("click", next);
    },
    validate(){ return null; }, persist(){ saveState(); }
  });
/* Wizard v5 — single-file refactor (Block 2/2) */
/* ========== Step: Owners (route2 only) ========== */
  addStep("ownersCount", {
    render(container){
      const self=this;
      if(state.route!=="route2"){ setTimeout(()=>next(),0); container.innerHTML=`<p class="wiz-helper">Skipping owners (not applicable).</p>`; return; }
      const val=state.answers?.ownersCount?.value||"";
      container.innerHTML=`
        <h2>How many people own this business?</h2>
        <label class="wiz-label" for="owners_num">Number of owners *</label>
        <input id="owners_num" type="number" min="1" step="1" class="wiz-input" placeholder="e.g., 1" />
        <div class="wiz-actions"><button id="own-prev" class="wiz-btn ghost" type="button">Back</button><button id="own-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const inp=container.querySelector('#owners_num'); inp.value=val;
      inp.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      inp.addEventListener("input",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); });
      inp.addEventListener("blur", ()=> self.persist());
      container.querySelector("#own-prev").addEventListener("click", prev);
      container.querySelector("#own-next").addEventListener("click", next);
    },
    validate(){ if(state.route!=="route2") return null;
      const n=parseInt(document.getElementById('owners_num')?.value||'0',10);
      if(!Number.isFinite(n)||n<1) return "Enter a valid number of owners (at least 1)."; return null; },
    persist(){ if(state.route!=="route2") return;
      const n=parseInt(document.getElementById('owners_num')?.value||'0',10);
      state.answers.ownersCount={value:n}; saveState(); }
  });

/* ========== Step: PAYE ========== */
  addStep("paye", {
    render(container){
      const self=this; const st=state.answers?.paye||{};
      container.innerHTML=`
        <h2>Employees & PAYE</h2>
        <label class="wiz-label">Do you have employees on payroll? *</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="emp_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="emp_yesno" value="no" /> <span>No</span></label>
        <div id="emp_extra" style="display:none;margin-top:10px;">
          <label class="wiz-label" for="emp_band">Rough employee count (monthly)</label>
          <select id="emp_band" class="wiz-input">
            <option value="">Select band</option><option>1–5</option><option>6–10</option><option>11–20</option><option>21–50</option><option>50+</option>
          </select>
        </div>
        <div class="wiz-actions"><button id="pay-prev" class="wiz-btn ghost" type="button">Back</button><button id="pay-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="emp_yesno"]')];
      const extra=container.querySelector('#emp_extra'); const band=container.querySelector('#emp_band');
      if(st?.hasEmployees===true){ radios.find(x=>x.value==='yes').checked=true; extra.style.display='block'; if(st.band) band.value=st.band; }
      if(st?.hasEmployees===false){ radios.find(x=>x.value==='no').checked=true; }
      radios.forEach(r=>{
        r.addEventListener("change",()=>{ extra.style.display=r.value==='yes'?'block':'none'; const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      });
      band.addEventListener("change",()=> self.persist());
      container.querySelector("#pay-prev").addEventListener("click", prev);
      container.querySelector("#pay-next").addEventListener("click", next);
    },
    validate(){ const sel=document.querySelector('input[name="emp_yesno"]:checked'); if(!sel) return "Please confirm if you have employees.";
      if(sel.value==='yes'){ const b=(document.getElementById('emp_band')?.value||'').trim(); if(!b) return "Please select a rough employee count band."; } return null; },
    persist(){ const sel=document.querySelector('input[name="emp_yesno"]:checked'); const has=sel?sel.value==='yes':null;
      const band=(document.getElementById('emp_band')?.value||'').trim()||null; state.answers.paye={hasEmployees:has, band}; saveState(); }
  });

/* ========== Step: VAT ========== */
  addStep("vat", {
    render(container){
      const self=this; const st=state.answers?.vat||{};
      container.innerHTML=`
        <h2>VAT Registration</h2>
        <label class="wiz-label">Are you VAT registered? *</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="vat_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="vat_yesno" value="no" /> <span>No</span></label>
        <div id="vat_extra" style="display:none;margin-top:10px;">
          <label class="wiz-label" for="vat_freq">VAT return frequency</label>
          <select id="vat_freq" class="wiz-input"><option value="">Select frequency</option><option>Quarterly</option><option>Monthly</option><option>Annually</option></select>
        </div>
        <div class="wiz-actions"><button id="vat-prev" class="wiz-btn ghost" type="button">Back</button><button id="vat-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="vat_yesno"]')];
      const extra=container.querySelector('#vat_extra'); const freq=container.querySelector('#vat_freq');
      if(st?.registered===true){ radios.find(x=>x.value==='yes').checked=true; extra.style.display='block'; if(st.frequency) freq.value=st.frequency; }
      if(st?.registered===false){ radios.find(x=>x.value==='no').checked=true; }
      radios.forEach(r=>{
        r.addEventListener("change",()=>{ extra.style.display=r.value==='yes'?'block':'none'; const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      });
      freq.addEventListener("change",()=> self.persist());
      container.querySelector("#vat-prev").addEventListener("click", prev);
      container.querySelector("#vat-next").addEventListener("click", next);
    },
    validate(){ const sel=document.querySelector('input[name="vat_yesno"]:checked'); if(!sel) return "Please confirm VAT registration.";
      if(sel.value==='yes'){ const f=(document.getElementById('vat_freq')?.value||'').trim(); if(!f) return "Please select a VAT return frequency."; } return null; },
    persist(){ const sel=document.querySelector('input[name="vat_yesno"]:checked'); const reg=sel?sel.value==='yes':null;
      const f=(document.getElementById('vat_freq')?.value||'').trim()||null; state.answers.vat={registered:reg, frequency:f}; saveState(); }
  });

/* ========== Step: VAT Flat Rate (only if registered) ========== */
  addStep("vatFlatRate", {
    render(container){
      const self=this;
      if(!state.answers?.vat?.registered){ setTimeout(()=>next(),0); container.innerHTML=`<p class="wiz-helper">Skipping Flat Rate (not VAT registered).</p>`; return; }
      const st=state.answers?.vat||{};
      container.innerHTML=`
        <h2>VAT Flat Rate Scheme</h2>
        <label class="wiz-label">Are you on the Flat Rate Scheme?</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="vfr_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="vfr_yesno" value="no" /> <span>No</span></label>
        <div class="wiz-actions"><button id="vfr-prev" class="wiz-btn ghost" type="button">Back</button><button id="vfr-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="vfr_yesno"]')];
      if(st.flatRate===true) radios.find(x=>x.value==='yes').checked=true;
      if(st.flatRate===false) radios.find(x=>x.value==='no').checked=true;
      radios.forEach(r=>{
        r.addEventListener("change",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      });
      container.querySelector("#vfr-prev").addEventListener("click", prev);
      container.querySelector("#vfr-next").addEventListener("click", next);
    },
    validate(){ return null; },
    persist(){ const sel=document.querySelector('input[name="vfr_yesno"]:checked'); const v=sel?sel.value==='yes':null;
      state.answers.vat={...(state.answers.vat||{}), flatRate:v}; saveState(); }
  });

/* ========== Step: Geography ========== */
  addStep("geography", {
    render(container){
      const self=this; const st=state.answers?.geography||{};
      container.innerHTML=`
        <h2>Where is the business registered?</h2>
        <p class="wiz-helper">We currently support UK-registered businesses.</p>
        <label class="wiz-label">Is the business UK-registered? *</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="uk_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="uk_yesno" value="no" /> <span>No</span></label>
        <div class="wiz-actions"><button id="geo-prev" class="wiz-btn ghost" type="button">Back</button><button id="geo-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="uk_yesno"]')];
      if(st?.isUK===true) radios.find(x=>x.value==='yes').checked=true;
      if(st?.isUK===false) radios.find(x=>x.value==='no').checked=true;
      radios.forEach(r=>{
        r.addEventListener("change",()=>{ const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      });
      container.querySelector("#geo-prev").addEventListener("click", prev);
      container.querySelector("#geo-next").addEventListener("click", next);
    },
    validate(){ const sel=document.querySelector('input[name="uk_yesno"]:checked'); if(!sel) return "Please confirm UK registration."; return null; },
    persist(){ const sel=document.querySelector('input[name="uk_yesno"]:checked'); const isUK=sel?sel.value==='yes':null;
      state.answers.geography={isUK}; saveState(); }
  });

/* ========== Step: Multi-currency ========== */
  addStep("multicurrency", {
    render(container){
      const self=this; const st=state.answers?.multicurrency||{};
      container.innerHTML=`
        <h2>Multi-currency</h2>
        <label class="wiz-label">Do you use currencies other than GBP?</label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="mc_yesno" value="no" /> <span>No</span></label>
        <label style="display:flex;gap:8px;margin:6px 0;"><input type="radio" name="mc_yesno" value="yes" /> <span>Yes</span></label>
        <div id="mc_extra" style="display:none;margin-top:10px;">
          <label class="wiz-label">Select all that apply</label>
          <label style="display:flex;gap:8px;margin:6px 0;"><input type="checkbox" value="EUR" /> <span>EUR</span></label>
          <label style="display:flex;gap:8px;margin:6px 0;"><input type="checkbox" value="USD" /> <span>USD</span></label>
          <label style="display:flex;gap:8px;margin:6px 0;"><input type="checkbox" value="Other" /> <span>Other</span></label>
        </div>
        <div class="wiz-actions"><button id="mc-prev" class="wiz-btn ghost" type="button">Back</button><button id="mc-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const radios=[...container.querySelectorAll('input[name="mc_yesno"]')];
      const extra=container.querySelector('#mc_extra'); const checks=()=>[...container.querySelectorAll('#mc_extra input[type="checkbox"]')];
      if(st?.enabled===true){ radios.find(x=>x.value==='yes').checked=true; extra.style.display='block'; }
      if(st?.enabled===false){ radios.find(x=>x.value==='no').checked=true; }
      radios.forEach(r=>{
        r.addEventListener("change",()=>{ extra.style.display=r.value==='yes'?'block':'none'; const err=document.getElementById("wiz-error"); if(err) err.remove(); self.persist(); });
        r.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); next(); } });
      });
      checks().forEach(c=> c.addEventListener("change",()=> self.persist()));
      container.querySelector("#mc-prev").addEventListener("click", prev);
      container.querySelector("#mc-next").addEventListener("click", next);
    },
    validate(){ return null; },
    persist(){
      const sel=document.querySelector('input[name="mc_yesno"]:checked'); const enabled=sel?sel.value==='yes':null;
      let list=[]; if(enabled){ list=[...document.querySelectorAll('#mc_extra input[type="checkbox"]:checked')].map(x=>x.value); }
      state.answers.multicurrency={enabled,currencies:list}; saveState();
    }
  });

/* ========== Step: Bank Accounts ========== */
  addStep("bankAccounts", {
    render(container){
      const self=this;
      const banks=["Monzo","Starling","HSBC","Barclays","NatWest","Lloyds","Santander","Other"];
      const prevSel=state.answers?.bankAccounts?.selected||[];
      container.innerHTML=`
        <h2>Bank accounts</h2><p class="wiz-helper">Select all that apply</p>
        <div id="banks_group">${banks.map(b=>`<label style="display:flex;gap:8px;margin:6px 0;"><input type="checkbox" value="${b}" /> <span>${b}</span></label>`).join("")}</div>
        <div class="wiz-actions"><button id="bank-prev" class="wiz-btn ghost" type="button">Back</button><button id="bank-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const boxes=[...container.querySelectorAll('#banks_group input[type="checkbox"]')];
      boxes.forEach(b=>{ if(prevSel.includes(b.value)) b.checked=true; b.addEventListener("change",()=> self.persist()); });
      container.querySelector("#bank-prev").addEventListener("click", prev);
      container.querySelector("#bank-next").addEventListener("click", next);
    },
    validate(){ return null; },
    persist(){ const selected=[...document.querySelectorAll('#banks_group input[type="checkbox"]:checked')].map(x=>x.value);
      state.answers.bankAccounts={selected}; saveState(); }
  });

/* ========== Step: Systems ========== */
  addStep("systems", {
    render(container){
      const self=this; const st=state.answers?.systems||{};
      container.innerHTML=`
        <h2>Systems in use</h2>
        <label class="wiz-label">Cash handling?</label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="cash_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="cash_yesno" value="no" /> <span>No</span></label>

        <label class="wiz-label" style="margin-top:10px;">Sales ledger (invoices to customers)?</label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="sl_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="sl_yesno" value="no" /> <span>No</span></label>

        <label class="wiz-label" style="margin-top:10px;">Purchase ledger (bills from suppliers)?</label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="pl_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="pl_yesno" value="no" /> <span>No</span></label>

        <label class="wiz-label" style="margin-top:10px;">Out-of-pocket expenses?</label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="oop_yesno" value="yes" /> <span>Yes</span></label>
        <label style="display:flex;gap:8px;margin:4px 0;"><input type="radio" name="oop_yesno" value="no" /> <span>No</span></label>

        <div class="wiz-actions"><button id="sys-prev" class="wiz-btn ghost" type="button">Back</button><button id="sys-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const map={cash:'cash_yesno',sl:'sl_yesno',pl:'pl_yesno',oop:'oop_yesno'};
      for(const k in map){
        const val=st?.[k];
        if(val===true){ const r=container.querySelector(`input[name="${map[k]}"][value="yes"]`); if(r) r.checked=true; }
        if(val===false){ const r=container.querySelector(`input[name="${map[k]}"][value="no"]`); if(r) r.checked=true; }
      }
      container.querySelector("#sys-prev").addEventListener("click", prev);
      container.querySelector("#sys-next").addEventListener("click", next);
      container.querySelectorAll('input[type="radio"]').forEach(r=> r.addEventListener("change",()=> self.persist()));
    },
    validate(){ return null; },
    persist(){
      const get=(name)=>{ const sel=document.querySelector(`input[name="${name}"]:checked`); return sel?sel.value==='yes':null; };
      state.answers.systems={ cash:get('cash_yesno'), sl:get('sl_yesno'), pl:get('pl_yesno'), oop:get('oop_yesno') }; saveState();
    }
  });

/* ========== Step: Requirements ========== */
  addStep("requirements", {
    render(container){
      const self=this; const st=state.answers?.requirements||{};
      container.innerHTML=`
        <h2>Requirements & Current Status</h2>
        <label class="wiz-label" for="bk_freq">Bookkeeping frequency</label>
        <select id="bk_freq" class="wiz-input"><option value="">Select</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Ad-hoc</option></select>

        <label class="wiz-label" for="sys_type" style="margin-top:10px;">System</label>
        <select id="sys_type" class="wiz-input"><option value="">Select</option><option>Cloud (Xero/QuickBooks etc)</option><option>Desktop</option><option>Manual / Spreadsheets</option></select>

        <label class="wiz-label" for="rec_quality" style="margin-top:10px;">Record quality</label>
        <select id="rec_quality" class="wiz-input"><option value="">Select</option><option>Poor</option><option>Okay</option><option>Great</option></select>

        <label class="wiz-label" for="bank_rec" style="margin-top:10px;">Bank reconciliation status</label>
        <select id="bank_rec" class="wiz-input"><option value="">Select</option><option>Not reconciled</option><option>Partially reconciled</option><option>Fully reconciled</option></select>

        <label class="wiz-label" for="delivery" style="margin-top:10px;">How do you deliver records?</label>
        <select id="delivery" class="wiz-input"><option value="">Select</option><option>Upload to portal</option><option>Email</option><option>Shared drive</option></select>

        <label class="wiz-label" for="who_books" style="margin-top:10px;">Who does the bookkeeping?</label>
        <select id="who_books" class="wiz-input"><option value="">Select</option><option>We will</option><option>You will</option></select>

        <label class="wiz-label" for="inv_band" style="margin-top:10px;">Invoices per month</label>
        <select id="inv_band" class="wiz-input"><option value="">Select</option><option>None</option><option>1–10</option><option>11–50</option><option>51–200</option><option>200+</option></select>

        <label class="wiz-label" for="scan_by" style="margin-top:10px;">Who scans/uploads invoices/receipts?</label>
        <select id="scan_by" class="wiz-input"><option value="">Select</option><option>We will</option><option>You will</option></select>

        <label class="wiz-label" for="catchup" style="margin-top:10px;">Months to catch up</label>
        <select id="catchup" class="wiz-input"><option value="">Select</option><option>0</option><option>1–2</option><option>3–6</option><option>7–12</option><option>12+</option></select>

        <div class="wiz-actions" style="margin-top:14px;"><button id="req-prev" class="wiz-btn ghost" type="button">Back</button><button id="req-next" class="wiz-btn primary" type="button">Next</button></div>
      `;
      const setVal=(id,v)=>{ const el=container.querySelector('#'+id); if(el&&v) el.value=v; };
      setVal('bk_freq',st.bkFreq); setVal('sys_type',st.system); setVal('rec_quality',st.recordQuality);
      setVal('bank_rec',st.bankRec); setVal('delivery',st.delivery); setVal('who_books',st.whoBooks);
      setVal('inv_band',st.invoicesBand); setVal('scan_by',st.scanBy); setVal('catchup',st.catchUpMonths);
      ['bk_freq','sys_type','rec_quality','bank_rec','delivery','who_books','inv_band','scan_by','catchup']
        .forEach(id=> container.querySelector('#'+id).addEventListener("change",()=> self.persist()));
      container.querySelector("#req-prev").addEventListener("click", prev);
      container.querySelector("#req-next").addEventListener("click", next);
    },
    validate(){ return null; },
    persist(){
      const get=(id)=> (document.getElementById(id)?.value||'').trim()||null;
      state.answers.requirements={ bkFreq:get('bk_freq'), system:get('sys_type'), recordQuality:get('rec_quality'),
        bankRec:get('bank_rec'), delivery:get('delivery'), whoBooks:get('who_books'),
        invoicesBand:get('inv_band'), scanBy:get('scan_by'), catchUpMonths:get('catchup') };
      saveState();
    }
  });

/* ========== Boot ========== */
  document.addEventListener("DOMContentLoaded", () => {
    root = ensureRoot(); injectStyles(); renderChrome();
    const start=Math.max(0, Math.min(state.index||0, stepsOrder.length-1)); showStep(start);
  });

})(); /* end file */
