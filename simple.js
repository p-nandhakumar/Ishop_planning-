// I-Shop demonstration workflow. User edits stay in this browser's localStorage.
const ismr = window.ismrData;
const STORAGE_KEY = "ishop_cotd_v3_job_master";
const DASHBOARD_KEY = "ishop_cotd_v4_dashboard_demo";
const GATES = ["Input Readiness","Cutting & Forming","Fabrication / Welding","Machining","Finishing","Inspection","Dispatch"];
const SECTIONS = ["Planning / Engineering","Cutting Bay","Fabrication","Machining","Welding","Heat Treatment","Shot Blasting","Painting","Quality / NDT","Dispatch"];
const RESOURCES = ["PC-1","PC-2","PC-3","PC-4","PC-5","CNC Gantry Milling","CNC Floor Boring","CNC VTL","CNC HMC","Deep Hole Drilling","Lathe Group","Plate Cutting","Plate Rolling","Press Brake","SAW Welding","MIG / TIG Welding","Heat Treatment Cell","Shot Blasting Cell","Painting Cell","Quality / NDT","Dispatch / SAP","Other"];
const STATES = ["Pending","In Progress","Completed","Hold"];
let jobs = readJobs();
let currentPage = "dashboard";
let draft = newDraft();
let editingId = null;
let masterSearch = "";
let trackingSearch = "";
let trackingId = "";
let showingSavedJobs = true;
let masterMessage = "";
let dashboardOverrides = readDashboardOverrides();
let dashboardEditorOpen = false;

function todayLocal() {
  const d = new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
}
function readDashboardOverrides() {
  try {
    const x=JSON.parse(localStorage.getItem(DASHBOARD_KEY));
    return x&&typeof x==="object"&&!Array.isArray(x)?x:{};
  } catch(e) { return {}; }
}
function overridden(key,fallback) {
  const x=dashboardOverrides[key];
  return x===undefined||x===null||x===""?fallback:x;
}
function asOfDate() { return overridden("asOf",todayLocal()); }
function daysBetween(a,b) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||""))return null;
  return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
}
function jobCOTD(j) {
  if(!j||!j.committed)return {status:"No Date",note:"Enter the original commitment"};
  if(j.dispatched){
    const delta=daysBetween(j.committed,j.dispatched);
    if(delta===null)return {status:"No Date",note:"Check date fields"};
    return delta<=0?{status:"On Time",note:delta===0?"Dispatched on commitment date":`${-delta} day(s) early`}
                   :{status:"Late",note:`${delta} day(s) after commitment`};
  }
  const remaining=daysBetween(asOfDate(),j.committed);
  if(remaining===null)return {status:"No Date",note:"Check date fields"};
  if(remaining<0)return {status:"Overdue",note:`${-remaining} day(s) past commitment · open`};
  if(remaining<=3)return {status:"Due Soon",note:`${remaining} day(s) remaining · open`};
  return {status:"Open",note:`${remaining} day(s) remaining · open`};
}
function cotdClass(status) {
  return ({"On Time":"completed","Late":"hold","Overdue":"hold","Due Soon":"inprogress","Open":"pending","No Date":"na"})[status]||"na";
}
function cotdNeedlePosition(status) {
  return ({"Late":13,"Overdue":17,"Due Soon":50,"Open":79,"On Time":89})[status]??null;
}
function cotdGauge(job,compact=false) {
  const state=jobCOTD(job);
  const needle=cotdNeedlePosition(state.status);
  const polar=(pct,r)=>{
    const rad=Math.PI*(1-pct/100);
    return {x:110+r*Math.cos(rad),y:103-r*Math.sin(rad)};
  };
  const curve=(from,to)=>{
    const a=polar(from,80),b=polar(to,80);
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A 80 80 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const sections=needle===null?`<path d="${curve(0,100)}" fill="none" stroke="#c9d3da" stroke-width="17"/>`:
    `<path d="${curve(0,34)}" fill="none" stroke="#d96f66" stroke-width="17"/>
     <path d="${curve(34,66)}" fill="none" stroke="#e7b447" stroke-width="17"/>
     <path d="${curve(66,100)}" fill="none" stroke="#39a16d" stroke-width="17"/>`;
  const p=needle===null?null:polar(needle,64);
  return `<div class="cotd-gauge ${compact?"compact":""}" title="${h(state.note)}">
    <svg viewBox="0 0 220 119" role="img" aria-label="Job COTD gauge: ${h(state.status)}. ${h(state.note)}">
      ${sections}
      ${p?`<line x1="110" y1="103" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#29485a" stroke-width="${compact?3:3.5}" stroke-linecap="round"/><circle cx="110" cy="103" r="5" fill="#29485a"/>`:`<text x="110" y="88" text-anchor="middle" fill="#8796a2" font-size="21" font-weight="700">?</text>`}
    </svg>
    <strong class="${cotdClass(state.status)}">${h(state.status)}</strong>
    <small>${h(state.note)}</small>
  </div>`;
}
function cotdSummary() {
  const assessed=jobs.filter(j=>j.committed&&j.dispatched&&daysBetween(j.committed,j.dispatched)!==null);
  const onTime=assessed.filter(j=>jobCOTD(j).status==="On Time").length;
  return {assessed:assessed.length,onTime,percent:assessed.length?(onTime/assessed.length*100):null};
}

function withMajorJobSamples(saved) {
  const samples = loadMajorJobSamples();
  return [...samples.filter(sample => !saved.some(job => job.id === sample.id || job.sampleId === sample.id)), ...saved];
}
function readJobs() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = [];
  }
  return withMajorJobSamples(Array.isArray(saved) ? saved : []);
}
function saveJobs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}
function newDraft() {
  return {id:"",description:"",department:"",primaryPC:"PC-1",quantity:1,tonnes:"",received:"",committed:"",dispatched:"",priority:"Normal",remarks:"",source:"Manual",operations:[]};
}
function newOperation(seq=1) {
  return {seq,gate:"Input Readiness",name:"",section:"Planning / Engineering",resource:"PC-1",status:"Pending",plan:"",actual:"",feedback:""};
}
function h(x) {
  return String(x ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function formatQty(v) {
  return Number(v).toLocaleString("en-IN",{maximumFractionDigits:1});
}
function optionList(arr,value) {
  return arr.map(x=>`<option value="${h(x)}"${x===value?" selected":""}>${h(x)}</option>`).join("");
}
function dateView(x) {
  if (!x) return "—";
  const a=String(x).split("-");
  return a.length===3 ? a[2]+" / "+a[1]+" / "+a[0] : h(x);
}
function toast(msg) {
  const t=document.getElementById("toast");
  t.textContent=msg;t.className="show";
  setTimeout(()=>t.className="",3200);
}
function go(page) {
  currentPage=page;
  render();
  scrollTo(0,0);
}
function nav() {
  const tabs=[["dashboard","Command Center"],["master","Add / Edit Job"],["tracking","Job Tracking"],["scheduler","Monthly Scheduler"]];
  document.getElementById("tabs").innerHTML=tabs.map(x=>`<button type="button" class="${currentPage===x[0]?"active":""}" onclick="go('${x[0]}')">${x[1]}</button>`).join("");
}
function head(title,description,action="") {
  return `<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function title(text,subtitle="") {
  return `<div class="panel-title"><h2>${text}</h2><small>${subtitle}</small></div>`;
}
function statusClass(s) {
  return s==="Completed"?"completed":s==="In Progress"?"inprogress":s==="Hold"?"hold":s==="Recorded"?"recorded":s==="Pending"?"pending":"na";
}
function statusCell(s) {
  return `<td class="status-cell ${statusClass(s)}">${h(s||"—")}</td>`;
}
function kpi(l,v,icon) {
  return `<div class="kpi"><div class="kpi-icon">${icon}</div><div><div class="kpi-label">${l}</div><div class="kpi-val">${v}</div></div></div>`;
}
function gauge() {
  const goal=overridden("cotdTarget","91.8");
  return `<div class="target-box">
  <svg viewBox="0 0 340 190" role="img" aria-label="FY27 COTD target of ${h(goal)} percent">
    <path d="M 47 160 A 123 123 0 0 1 109 53" fill="none" stroke="#e97f67" stroke-width="30"/>
    <path d="M 109 53 A 123 123 0 0 1 231 53" fill="none" stroke="#f2d42d" stroke-width="30"/>
    <path d="M 231 53 A 123 123 0 0 1 293 160" fill="none" stroke="#32a26b" stroke-width="30"/>
    <text x="37" y="182" font-size="11" fill="#728899">0</text>
    <text x="165" y="23" font-size="11" fill="#728899">50</text>
    <text x="290" y="182" font-size="11" fill="#728899">100</text>
  </svg>
  <div class="gauge-text"><strong>${h(goal)}%</strong><span>FY27 OSM draft target${dashboardOverrides.cotdTarget!==undefined?" · demo edited":""}</span></div>
  </div>`;
}
function monthlyChart() {
  const data=ismr.monthly.map((x,i)=>({...x,...(dashboardOverrides.monthly?.[i]||{})}));
  const max=Math.max(...data.map(x=>Number(x.received)||0),...data.map(x=>Number(x.dispatchRecorded)||0),1);
  return `<div class="bar-chart">${data.map(x=>`<div class="bar-pair">
    <div class="chart-col" style="height:${x.received/max*88}%"><span>${x.received}</span></div>
    <div class="chart-col gold" style="height:${Math.max(1,x.dispatchRecorded/max*88)}%"><span>${x.dispatchRecorded}</span></div>
    <label>${x.label}</label>
  </div>`).join("")}</div>
  <div class="legend"><span><i class="swatch"></i>Received</span><span><i class="swatch gold"></i>Dispatch date recorded</span></div>`;
}
function sourceTable(records) {
  return `<div class="tablewrap"><table class="sheet"><thead><tr><th>Job code</th><th>Description</th><th>Dept.</th><th>PC in source</th><th>Received</th><th>Dispatch entry</th></tr></thead><tbody>
    ${records.map(r=>`<tr class="row-link" onclick="track('${h(r.id)}')"><td>${h(r.id)}</td><td>${h(r.description)}</td><td>${h(r.department)}</td><td>${h(r.pc||"—")}</td><td>${dateView(r.received)}</td>${statusCell(r.dispatched?"Recorded":"—")}</tr>`).join("")}
  </tbody></table></div>`;
}
function overriddenPC(key) {
  const base=key==="Other / blank"?(ismr.pcCounts.Unspecified||0):(ismr.pcCounts[key]||0);
  return Number(dashboardOverrides.pcCounts?.[key]??base);
}
function dashboardEditor() {
  const fields=[
    ["fyReceipts","FY27 jobs received",ismr.fyReceipts,1],
    ["fyDispatchRecorded","Dispatch dates recorded",ismr.fyDispatchRecorded,1],
    ["fyNoDispatchRecorded","No dispatch date recorded",ismr.fyNoDispatchRecorded,1],
    ["manufacturingTarget","Manufacturing target (t)","3920",0.1],
    ["machiningTarget","Machining COTD target (%)","81.6",0.1],
    ["cotdTarget","I-Shop COTD target (%)","91.8",0.1]
  ];
  return `<section class="panel editor-panel">
    <div class="panel-title"><h2>Edit Command Center · Demo Values</h2><small>Saving changes affects this browser only</small></div>
    <div class="small-tip">Change any number and select <b>Save Demo Dashboard</b>. Job-specific COTD is calculated from job dates in Add / Edit Job. To return to the reference figures, select <b>Restore Source Figures</b>.</div>
    <div class="editor-label">Summary &amp; review date</div>
    <div class="form-grid">
      ${fields.map(([key,label,base,step])=>`<label class="field">${label}<input type="number" min="0" step="${step}" data-dash="${key}" value="${h(overridden(key,base))}"></label>`).join("")}
      <label class="field">Manual COTD demo (%)<input type="number" min="0" max="100" step="0.1" data-dash="cotdActual" value="${h(dashboardOverrides.cotdActual??"")}" placeholder="Leave blank for sample shop-wide COTD"></label>
      <label class="field">Review / as-of date<input type="date" data-dash="asOf" value="${h(asOfDate())}"></label>
    </div>
    <div class="editor-tables">
      <div><div class="editor-label">Monthly comparison</div><table class="sheet edit-table"><thead><tr><th>Month</th><th>Received</th><th>Dispatch entries</th></tr></thead><tbody>
        ${ismr.monthly.map((m,i)=>`<tr><td>${h(m.label)}</td><td><input type="number" min="0" step="1" data-month="${i}" data-column="received" value="${h(dashboardOverrides.monthly?.[i]?.received??m.received)}"></td><td><input type="number" min="0" step="1" data-month="${i}" data-column="dispatchRecorded" value="${h(dashboardOverrides.monthly?.[i]?.dispatchRecorded??m.dispatchRecorded)}"></td></tr>`).join("")}
      </tbody></table></div>
      <div><div class="editor-label">Production centre comparison</div><table class="sheet edit-table"><thead><tr><th>Production centre</th><th>Received jobs</th></tr></thead><tbody>
        ${["PC-1","PC-2","PC-3","PC-4","PC-5","PC-6","Other / blank"].map(key=>`<tr><td>${key}</td><td><input type="number" min="0" step="1" data-pc="${key}" value="${h(overriddenPC(key))}"></td></tr>`).join("")}
      </tbody></table></div>
    </div>
    <div class="actionrow sectionspace"><button class="btn" onclick="saveDashboardEdits()">Save Demo Dashboard</button><button class="btn secondary" onclick="exportDemoData()">Export Demo File</button><button class="btn secondary" onclick="document.getElementById('importDemoFile').click()">Import Demo File</button><input id="importDemoFile" class="visually-hidden" type="file" accept=".json,application/json" onchange="importDemoData(event)"><button class="btn secondary" onclick="restoreDashboardSource()">Restore Source Figures</button><button class="btn secondary" onclick="toggleDashboardEditor()">Close</button></div>
    <div class="source-note">Export saves your editable demo jobs and dashboard values to a JSON file. Import allows the same prepared demo to be loaded in another browser; it replaces existing local demo entries after confirmation.</div>
  </section>`;
}
function toggleDashboardEditor() { dashboardEditorOpen=!dashboardEditorOpen;render(); }
function saveDashboardEdits() {
  const next={};
  document.querySelectorAll("[data-dash]").forEach(el=>{
    if(el.value!=="")next[el.dataset.dash]=el.type==="date"?el.value:Number(el.value);
  });
  next.monthly=ismr.monthly.map((_,i)=>({
    received:Math.max(0,Number(document.querySelector(`[data-month="${i}"][data-column="received"]`)?.value)||0),
    dispatchRecorded:Math.max(0,Number(document.querySelector(`[data-month="${i}"][data-column="dispatchRecorded"]`)?.value)||0)
  }));
  next.pcCounts={};
  document.querySelectorAll("[data-pc]").forEach(el=>next.pcCounts[el.dataset.pc]=Math.max(0,Number(el.value)||0));
  dashboardOverrides=next;
  localStorage.setItem(DASHBOARD_KEY,JSON.stringify(next));
  dashboardEditorOpen=false;render();toast("Demo dashboard figures saved");
}
function restoreDashboardSource() {
  if(!window.confirm("Restore original reference figures and clear all dashboard demo overrides? Saved jobs will remain."))return;
  dashboardOverrides={};localStorage.removeItem(DASHBOARD_KEY);
  dashboardEditorOpen=false;render();toast("Source figures restored");
}
function exportDemoData() {
  const data={format:"IShopCOTDDemo",version:2,exportedAt:new Date().toISOString(),dashboard:dashboardOverrides,jobs,scheduler:typeof sched!=="undefined"?sched:undefined};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="IShop_COTD_Demo_Data.json";
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Demo file downloaded");
}
async function importDemoData(event) {
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  if(file.size>5_000_000){toast("File is too large (5 MB limit)");return;}
  try {
    const data=JSON.parse(await file.text());
    if(data.format!=="IShopCOTDDemo"||!Array.isArray(data.jobs)||!data.dashboard||typeof data.dashboard!=="object")throw new Error("Not a supported I-Shop demo file");
    if(data.jobs.length>1000||!data.jobs.every(j=>typeof j.id==="string"&&typeof j.description==="string"&&Array.isArray(j.operations)))throw new Error("Invalid job list");
    if(!window.confirm(`Load ${data.jobs.length} saved jobs and dashboard demo values? This replaces existing browser demo data; the I-SMR source snapshot is unchanged.`))return;
    jobs=withMajorJobSamples(data.jobs);dashboardOverrides=data.dashboard;
    saveJobs();localStorage.setItem(DASHBOARD_KEY,JSON.stringify(dashboardOverrides));
    if(data.scheduler&&typeof data.scheduler==="object"&&typeof sched!=="undefined"){
      sched={...sched,...data.scheduler};saveSched();
    }
    dashboardEditorOpen=false;render();toast("Demo data imported into this browser");
  } catch(e) {toast(e.message||"Could not read this demo file");}
}
function dashboard() {
  const counts=["PC-1","PC-2","PC-3","PC-4","PC-5","PC-6","Other / blank"].map(k=>[k,overriddenPC(k)]);
  const recent=ismr.records.slice(0,7);
  const result=cotdSummary();
  const trend = sampleCOTDTrend;
  const demoActual=dashboardOverrides.cotdActual!==undefined&&dashboardOverrides.cotdActual!=="";
  const actual=demoActual?`${h(dashboardOverrides.cotdActual)}%`:`${trend.at(-1)[1]}%`;
  const actualSource=demoActual?"Manual demo entry":"Sample shop-wide COTD · Nov 2026";
  return head("I-Shop | COTD Command Center","Management overview · FY 2026–27 · I-SMR reference + separately editable demo values",`<div class="actionrow"><button class="btn secondary" onclick="toggleDashboardEditor()">${dashboardEditorOpen?"Close Editor":"Edit Demo Dashboard"}</button><button class="btn" onclick="startNew()">+ Add Job</button></div>`)
  +(dashboardEditorOpen?dashboardEditor():"")
  +(Object.keys(dashboardOverrides).filter(k=>k!=="asOf").length?`<div class="demo-banner">DEMO VIEW — Blue figures may contain manually edited values. I-SMR remains unchanged. <button type="button" onclick="toggleDashboardEditor()">Edit values</button></div>`:"")
  +`<div class="dashboard-grid">
     <div class="kpi-grid">
       ${kpi("FY27 Jobs Received",h(overridden("fyReceipts",ismr.fyReceipts)),"▣")}
       ${kpi("Dispatch Dates Recorded",h(overridden("fyDispatchRecorded",ismr.fyDispatchRecorded)),"↗")}
       ${kpi("No Dispatch Date on Record",h(overridden("fyNoDispatchRecorded",ismr.fyNoDispatchRecorded)),"◷")}
       ${kpi("FY27 Manufacturing Target",formatQty(overridden("manufacturingTarget",3920))+" t","▤")}
       ${kpi("Plant Machining COTD Target",h(overridden("machiningTarget","81.6"))+"%","◎")}
       ${kpi("Editable Demo Jobs",jobs.length,"✎")}
     </div>
     <section class="panel target-panel">
       ${title("COTD Target","FY27 OSM draft")}${gauge()}
       <div class="panel-foot"><span>Demo COTD<br><small>${actualSource}</small></span><b class="${result.assessed?"good-text":"pending"}">${actual}</b></div>
       <div class="source-note">Sample trend · ${trend.map(([month, value])=>`${month.slice(0,3)} ${value}%`).join(" · ")}</div>
       ${result.assessed?`<div class="source-note">Saved job dispatches · ${result.onTime} of ${result.assessed} on time (${result.percent.toFixed(1)}%)</div>`:""}
     </section>
     <section class="panel">
       ${title("Jobs Received vs Dispatch Entries",dashboardOverrides.monthly?"Apr–Oct 2026 · demo edited":"Apr–Oct 2026 · source")}
       ${monthlyChart()}
     </section>
   </div>
   <div class="dashboard-lower">
     <section class="panel">${title("PC-Wise Job Register",dashboardOverrides.pcCounts?"Demo edited figures":"FY27 source work-centre codes")}
       <table class="pc-table"><thead><tr><th>Production centre</th><th class="right">Received jobs</th></tr></thead><tbody>${counts.map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join("")}</tbody></table>
     </section>
     <section class="panel">${title("Job-Wise COTD Indicator",`Latest 4 demo jobs · review ${dateView(asOfDate())}`)}
       <div class="tablewrap"><table class="sheet cotd-register"><thead><tr><th>Job Code</th><th>PC</th><th>Committed</th><th>Individual COTD Gauge</th><th>Action</th></tr></thead><tbody>
       ${jobs.slice(-4).reverse().map(j=>`<tr><td><button class="text-action" onclick="track('${h(j.id)}')">${h(j.id)}</button></td><td>${h(j.primaryPC)}</td><td>${dateView(j.committed)}</td><td class="gauge-td">${cotdGauge(j,true)}</td><td><button class="text-action" onclick="editSaved('${h(j.id)}')">Edit dates</button></td></tr>`).join("")}
       ${!jobs.length?`<tr><td colspan="5" class="empty">No demo jobs. Add a job and its original committed date to see its gauge.</td></tr>`:""}
       </tbody></table>
       </div><div class="source-note">Red: late / overdue · Yellow: due soon · Green: on time / date not yet due · Gray: missing commitment. The gauge represents date status, not an individual COTD %. <button class="text-action" onclick="showSavedList()">View all demo jobs</button></div>
     </section>
   </div>
   <section class="panel sectionspace">${title("Latest I-SMR Job Cards","Click a job to open tracking")}${sourceTable(recent)}
     <div class="source-note"><b>Source:</b> NEW ISMR JOBS LIST.xlsx, job codes sheet. Original committed dates and gate-level operation status are not reliably available. Missing dispatch entries do not prove delivery delay. Demo dashboard edits do not modify this reference list.</div>
   </section>`;
}
function overallStatus(j) {
  const arr=j.operations||[];
  if(!arr.length)return "—";
  if(arr.some(x=>x.status==="Hold"))return "Hold";
  if(arr.every(x=>x.status==="Completed"))return "Completed";
  if(arr.some(x=>x.status==="In Progress"||x.status==="Completed"))return "In Progress";
  return "Pending";
}
function findSource(q,limit=7) {
  const s=q.trim().toLowerCase();
  if(!s)return [];
  return ismr.records.filter(r=>[r.id,r.description,r.department].some(x=>String(x).toLowerCase().includes(s))).slice(0,limit);
}
function startNew() {
  editingId=null;draft=newDraft();masterSearch="";masterMessage="";
  go("master");
}
function editSaved(id) {
  const found=jobs.find(j=>j.id===id);
  if(!found)return;
  editingId=id;draft=JSON.parse(JSON.stringify(found));masterMessage="";
  go("master");
}
function importSource(id) {
  const existing=jobs.find(j=>j.id===id);
  if(existing){editSaved(id);return;}
  const r=ismr.records.find(x=>x.id===id);
  if(!r){toast("Job not found in the FY27 snapshot");return;}
  editingId=null;
  draft={...newDraft(),id:r.id,description:r.description,department:r.department,primaryPC:["PC-1","PC-2","PC-3","PC-4","PC-5"].includes(r.pc)?r.pc:"PC-1",
    quantity:r.quantity||1,tonnes:r.tonnes??"",received:r.received||"",dispatched:r.dispatched||"",source:"I-SMR working copy"};
  masterMessage="Imported as an editable working copy. Check the primary PC and add the actual operation route before saving.";
  go("master");
}
function master() {
  const hit=findSource(masterSearch);
  return head(editingId?"Edit Job & Routing":"Add Job & Routing","One job master form. Assign a primary PC, then add operations with machine and sequence details.")
  +`<section class="panel">
     ${title("Find Existing I-SMR Job","Create an editable working copy")}
     <div class="filters"><input id="importSearch" placeholder="Enter job code or description" value="${h(masterSearch)}"><button class="btn secondary" onclick="lookUpSource()">Find in I-SMR</button><button class="btn secondary" onclick="startNew()">Blank New Job</button></div>
     ${masterSearch?`<div style="margin-top:9px">${hit.length?`<table class="sheet"><thead><tr><th>Code</th><th>Description</th><th>Action</th></tr></thead><tbody>${hit.map(r=>`<tr><td>${h(r.id)}</td><td>${h(r.description)}</td><td><button class="btn secondary" onclick="importSource('${h(r.id)}')">${jobs.some(j=>j.id===r.id)?"Edit saved":"Use job"}</button></td></tr>`).join("")}</tbody></table>`:`<div class="small-tip">No matching job in the April–October FY27 source snapshot. You may create a new job manually.</div>`}</div>`:""}
   </section>
   <section class="panel sectionspace">
     ${title("1. Job Master","Required fields marked *")}
     ${masterMessage?`<div class="small-tip">${h(masterMessage)}</div>`:""}
     <form id="jobForm" onsubmit="event.preventDefault();saveJob()">
       <div class="form-grid">
         <label class="field">Job Code *<input id="jobId" value="${h(draft.id)}" required placeholder="e.g. ISMR-XXXX-07294"></label>
         <label class="field span2">Job Description *<input id="description" value="${h(draft.description)}" required></label>
         <label class="field">Customer Department<input id="department" value="${h(draft.department)}"></label>
         <label class="field">Primary PC *<select id="primaryPC">${optionList(["PC-1","PC-2","PC-3","PC-4","PC-5"],draft.primaryPC)}</select></label>
         <label class="field">Quantity<input id="quantity" type="number" min="0" step="any" value="${h(draft.quantity)}"></label>
         <label class="field">Total Weight (t)<input id="tonnes" type="number" min="0" step="any" value="${h(draft.tonnes)}"></label>
         <label class="field">Priority<select id="priority">${optionList(["Normal","High","Breakdown / Shutdown"],draft.priority)}</select></label>
         <label class="field">Received Date<input id="received" type="date" value="${h(draft.received)}"></label>
         <label class="field">Original Committed Date<input id="committed" type="date" value="${h(draft.committed)}"></label>
         <label class="field">Actual Dispatch Date<input id="dispatched" type="date" value="${h(draft.dispatched)}"></label>
         <label class="field span2">Job Remarks<input id="remarks" value="${h(draft.remarks)}" placeholder="Scope, constraints or customer notes"></label>
       </div>
       <div class="source-note"><b>Job-wise COTD:</b> Enter original committed date and actual dispatch date. If dispatch is blank, status is Open, Due Soon or Overdue based on the dashboard review date. A dispatch date means full job dispatch for this demo.</div>
       <div class="sectionspace">${title("2. Operation Routing","Same sequence number = parallel operations; next number = later stage")}
         <div id="routeRows">${(draft.operations||[]).map((op,i)=>operationRow(op,i)).join("")}</div>
         ${!draft.operations.length?`<div class="small-tip">No operations assigned yet. Add the first operation and choose its gate, section and machine.</div>`:""}
         <div class="actionrow" style="margin-top:10px"><button type="button" class="btn secondary" onclick="addOperation()">+ Add Operation</button></div>
       </div>
       <div class="actionrow sectionspace"><button type="submit" class="btn">Save Job & Routing</button><button type="button" class="btn secondary" onclick="go('tracking')">Cancel</button></div>
     </form>
   </section>
   <section class="panel sectionspace">${title("Editable Demo Job List",jobs.length+" saved")}
     ${jobs.length?`<div class="tablewrap"><table class="sheet"><thead><tr><th>Job Code</th><th>Description</th><th>PC</th><th>Operations</th><th>Action</th></tr></thead><tbody>${jobs.map(j=>`<tr><td>${h(j.id)}</td><td>${h(j.description)}</td><td>${h(j.primaryPC)}</td><td>${j.operations.length}</td><td><button class="btn secondary" onclick="editSaved('${h(j.id)}')">Edit</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No demo jobs saved in this browser.</div>`}
     <div class="source-note">Changes save only in this browser on this device. The original I-SMR spreadsheet is not altered.</div>
   </section>`;
}
function operationRow(op,i) {
  return `<div class="route-entry route-entry-dated" data-route="${i}">
    <label>Sequence<input data-key="seq" type="number" min="1" value="${h(op.seq)}"></label>
    <label>Gate<select data-key="gate">${optionList(GATES,op.gate)}</select></label>
    <label>Operation<input data-key="name" value="${h(op.name)}" placeholder="Specific activity"></label>
    <label>Section<select data-key="section">${optionList(SECTIONS,op.section)}</select></label>
    <label>Assigned PC / Machine<select data-key="resource">${optionList(RESOURCES,op.resource)}</select></label>
    <label>Planned gate date<input data-key="plannedDate" type="date" value="${h(op.plannedDate)}"></label>
    <label>Actual gate date<input data-key="actualDate" type="date" value="${h(op.actualDate)}" ${draft.sampleId && op.gate==="Dispatch" ? 'readonly title="Edit the job dispatch date above"' : ''}></label>
    <label>Plan h<input data-key="plan" type="number" min="0" step="any" value="${h(op.plan)}"></label>
    <label>Actual h<input data-key="actual" type="number" min="0" step="any" value="${h(op.actual)}"></label>
    <label>Status<select data-key="status">${optionList(STATES,op.status)}</select></label>
    <label>Feedback<input data-key="feedback" value="${h(op.feedback)}" placeholder="Issue / reason"></label>
    <button type="button" class="btn danger" onclick="removeOperation(${i})">Remove</button>
  </div>`;
}
function collectMaster() {
  const val=id=>document.getElementById(id)?.value??"";
  if(!document.getElementById("jobId"))return;
  Object.assign(draft,{id:val("jobId").trim(),description:val("description").trim(),department:val("department").trim(),primaryPC:val("primaryPC"),
    quantity:val("quantity"),tonnes:val("tonnes"),priority:val("priority"),received:val("received"),committed:val("committed"),dispatched:val("dispatched"),remarks:val("remarks")});
  draft.operations=[...document.querySelectorAll("#routeRows .route-entry")].map(row=>{
    const op={};
    row.querySelectorAll("[data-key]").forEach(field=>op[field.dataset.key]=field.value);
    op.seq=Math.max(1,Number(op.seq)||1);
    return op;
  });
}
function addOperation() {
  collectMaster();
  const max=Math.max(0,...draft.operations.map(x=>Number(x.seq)||0));
  draft.operations.push(newOperation(max+1));
  render();
}
function removeOperation(idx) {
  collectMaster();draft.operations.splice(idx,1);render();
}
function lookUpSource() {
  collectMaster();
  masterSearch=document.getElementById("importSearch")?.value.trim()||"";
  render();
}
function saveJob() {
  collectMaster();
  if(!draft.id||!draft.description){toast("Enter Job Code and Description");return;}
  if(!/^[-A-Za-z0-9_\/.]+$/.test(draft.id)){toast("Use a simple job code without spaces");return;}
  if(jobs.some(j=>j.id===draft.id&&j.id!==editingId)){toast("This Job Code already exists in your editable list");return;}
  const clean=JSON.parse(JSON.stringify(draft));
  clean.operations=clean.operations.map(o=>({...o,name:o.name||o.gate,status:STATES.includes(o.status)?o.status:"Pending"}));
  if (clean.sampleId) {
    const dispatch = clean.operations.find(op=>op.gate==="Dispatch");
    if (dispatch) {
      dispatch.actualDate = clean.dispatched;
      if (clean.dispatched) dispatch.status = "Completed";
      else if (dispatch.status==="Completed") dispatch.status = "Pending";
    }
  }
  const at=jobs.findIndex(j=>j.id===editingId);
  if(at>=0)jobs[at]=clean;else jobs.push(clean);
  saveJobs();
  trackingId=clean.id;showingSavedJobs=false;trackingSearch="";
  toast("Job and routing saved in this browser");
  go("tracking");
}
function track(id) {
  trackingId=id;trackingSearch="";showingSavedJobs=false;
  go("tracking");
}
function activeRecord() {
  return jobs.find(j=>j.id===trackingId)||ismr.records.find(r=>r.id===trackingId);
}
function gateStatus(job,gate) {
  if(!job?.operations)return "—";
  const rows=job.operations.filter(o=>o.gate===gate);
  if(!rows.length)return "—";
  if(rows.some(o=>o.status==="Hold"))return "Hold";
  if(rows.every(o=>o.status==="Completed"))return "Completed";
  if(rows.some(o=>o.status==="Completed"||o.status==="In Progress"))return "In Progress";
  return "Pending";
}
function tracking() {
  const selected=activeRecord();
  const editable=jobs.some(j=>j.id===trackingId);
  const result=showingSavedJobs?jobs:(trackingSearch?[...jobs,...ismr.records.filter(r=>!jobs.some(j=>j.id===r.id))].filter(r=>[r.id,r.description].some(x=>String(x).toLowerCase().includes(trackingSearch.toLowerCase()))).slice(0,10):[]);
  return head("Job Tracking | Gate Status","Find a job by Job Code. Saved demo jobs show operation status; I-SMR-only jobs show source fields without invented gate progress.",
    `<button class="btn" onclick="startNew()">+ Add Job</button>`)
  +`<section class="panel">
    ${title("Find Job","I-SMR + editable demo jobs")}
    <div class="filters"><input id="trackSearch" placeholder="Search Job Code / Description" value="${h(trackingSearch)}" onkeydown="if(event.key==='Enter'){event.preventDefault();searchTracking()}"><button class="btn secondary" onclick="searchTracking()">Find</button><button class="btn secondary" onclick="showSavedList()">Saved Jobs</button></div>
    ${trackingSearch||showingSavedJobs?`<div style="margin-top:10px">${result.length?`<div class="tablewrap"><table class="sheet"><thead><tr><th>Job Code</th><th>Description</th><th>Type</th><th>Individual COTD Gauge</th></tr></thead><tbody>${result.map(x=>`<tr><td><button class="text-action" onclick="track('${h(x.id)}')">${h(x.id)}</button></td><td>${h(x.description)}</td><td>${x.sampleId?"Major job · sample":jobs.some(j=>j.id===x.id)?"Editable":"I-SMR reference"}</td><td class="gauge-td">${cotdGauge(x,true)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No matching job found.</div>`}</div>`:""}
  </section>
  ${selected?`<section class="panel sectionspace">
    <div class="panel-title"><h2>${h(selected.id)} — ${h(selected.description)}</h2><div class="actionrow">${editable?`<button class="btn secondary" onclick="editSaved('${h(selected.id)}')">Edit Job / Route</button>`:`<button class="btn" onclick="importSource('${h(selected.id)}')">Create Editable Copy</button>`}</div></div>
    ${selected.sampleId?'<div class="demo-banner">Sample major job · dates, hours and remarks are illustrative.</div>':""}
    <div class="details">
      <div>${selected.sampleId?"Project":"Customer Department"}<b>${h(selected.department||"—")}</b></div>
      <div>Primary PC<b>${h(editable?selected.primaryPC:(selected.pc||"Not assigned"))}</b></div>
      <div>Received Date<b>${dateView(selected.received)}</b></div>
      <div>Committed Date<b>${dateView(editable?selected.committed:"")}</b></div>
    </div>
    <div class="job-cotd-focus">
      <div class="job-cotd-graphic">${cotdGauge(selected)}</div>
      <div class="job-cotd-explain"><h3>Job-Specific COTD Gauge</h3><p>${editable?"Date-based delivery status from this job's own commitment and dispatch record.":"Not assessable from the I-SMR snapshot. The original commitment is missing."}</p>
        <div class="job-dates"><span>Original commitment <b>${dateView(editable?selected.committed:"")}</b></span><span>Actual dispatch <b>${dateView(editable?selected.dispatched:"")}</b></span><span>Review date <b>${dateView(asOfDate())}</b></span></div>
        <div class="source-note">This is a job status gauge—not a percentage COTD measure. Green for an open job means only that its due date has not passed.</div>
      </div>
      ${editable?`<button class="btn secondary" onclick="editSaved('${h(selected.id)}')">Edit Job Dates</button>`:""}
    </div>
    ${title("Gate Status Matrix","Excel-style indicators · green = complete, yellow = in progress, red = hold")}
    <div class="gate-grid"><table><thead><tr>${GATES.map(g=>`<th>${h(g)}</th>`).join("")}</tr></thead><tbody><tr>${GATES.map(g=>`<td class="status-cell ${statusClass(gateStatus(selected,g))}">${h(gateStatus(selected,g))}</td>`).join("")}</tr></tbody></table></div>
    <div class="source-note">${editable?"The status matrix is calculated from the operations below. Multiple operations in the same gate are combined.":"I-SMR does not contain sufficient operation-level records to fill these cells. Create an editable working copy and assign the actual route."}</div>
  </section>
  ${editable?operationTracking(selected):`<section class="panel sectionspace">${title("I-SMR Source Fields","Reference only")}
    <div class="details"><div>Quantity<b>${h(selected.quantity??"—")}</b></div><div>Weight<b>${selected.tonnes==null?"—":h(selected.tonnes)+" t"}</b></div><div>Completion Declared<b>${dateView(selected.declared)}</b></div><div>Dispatch Entry<b>${dateView(selected.dispatched)}</b></div></div>
    <p class="small-tip">The source may contain a dispatch date, but it does not establish original commitment, COTD classification, or all gate statuses.</p></section>`}
  `:`<section class="panel sectionspace"><div class="empty">Select a job to see its gates. Create an editable job to enter routing and updates.</div></section>`}`;
}
function operationTracking(job) {
  const rows=[...job.operations].map((o,i)=>({...o,_idx:i})).sort((a,b)=>Number(a.seq)-Number(b.seq));
  const showDates = Boolean(job.sampleId) || rows.some(o=>o.plannedDate || o.actualDate);
  return `<section class="panel sectionspace">
    ${title("Operation-Wise Route & Updates","Same sequence = parallel activities")}
    <div class="tablewrap"><table class="sheet">
    <thead><tr><th>Seq.</th><th>Gate</th><th>Operation</th><th>Section</th><th>Assigned PC / Machine</th>${showDates?"<th>Planned date</th><th>Actual date</th><th>Delay (days)</th>":""}<th>Plan h</th><th>Actual h</th><th>Status</th><th>Feedback / Issue</th></tr></thead><tbody>
    ${rows.map(o=>{
      const delay = daysBetween(o.plannedDate, o.actualDate || asOfDate());
      const delayText = delay === null || (!o.actualDate && delay <= 0)
        ? "—" : o.actualDate ? String(delay) : `${delay} open`;
      return `<tr><td class="center">${h(o.seq)}</td><td>${h(o.gate)}</td><td>${h(o.name)}</td><td>${h(o.section)}</td><td>${h(o.resource)}</td>${showDates?`<td>${dateView(o.plannedDate)}</td><td>${dateView(o.actualDate)}</td><td class="center">${delayText}</td>`:""}<td class="right">${h(o.plan||"—")}</td>
       <td><input style="width:64px;padding:5px;border:1px solid #cbd8e2" data-actual="${o._idx}" type="number" min="0" step="any" value="${h(o.actual)}"></td>
       <td class="status-cell ${statusClass(o.status)}"><select data-status="${o._idx}" style="width:120px;border:1px solid #b8c5ce;padding:5px;background:#fff">${optionList(STATES,o.status)}</select></td>
       <td><textarea class="route-feedback" rows="2" data-feedback="${o._idx}" aria-label="${h(o.gate)} remarks" placeholder="Problem / reason">${h(o.feedback)}</textarea></td></tr>`;}).join("")}
    ${!rows.length?`<tr><td colspan="${showDates?12:9}" class="empty">No route operations yet. Select Edit Job / Route to add them.</td></tr>`:""}
    </tbody></table></div>
    <div class="actionrow sectionspace"><button class="btn" onclick="saveTrackUpdates()">Save Status / Feedback</button><button class="btn secondary" onclick="editSaved('${h(job.id)}')">Edit Routing</button></div>
    <div class="source-note">These updates belong to your saved demo job. They do not modify the original I-SMR workbook.</div>
  </section>`;
}
function saveTrackUpdates() {
  const j=jobs.find(x=>x.id===trackingId);
  if(!j)return;
  document.querySelectorAll("[data-status]").forEach(el=>j.operations[Number(el.dataset.status)].status=el.value);
  document.querySelectorAll("[data-actual]").forEach(el=>j.operations[Number(el.dataset.actual)].actual=el.value);
  document.querySelectorAll("[data-feedback]").forEach(el=>j.operations[Number(el.dataset.feedback)].feedback=el.value);
  if (j.sampleId && j.dispatched) {
    const dispatch = j.operations.find(op=>op.gate==="Dispatch");
    if (dispatch) dispatch.status = "Completed";
  }
  saveJobs();toast("Operation status and feedback saved");render();
}
function searchTracking() {
  showingSavedJobs=false;
  trackingSearch=document.getElementById("trackSearch")?.value.trim()||"";
  const exact=jobs.find(x=>x.id.toLowerCase()===trackingSearch.toLowerCase())||ismr.records.find(x=>x.id.toLowerCase()===trackingSearch.toLowerCase());
  if(exact){track(exact.id);return;}
  render();
}
function showSavedList() {
  trackingSearch="";trackingId="";showingSavedJobs=true;
  go("tracking");
}
function render() {
  nav();
  // scheduler.js loads after this file; resolve its page only when selected.
  document.getElementById("screen").innerHTML=currentPage==="scheduler"?scheduler():({dashboard,master,tracking}[currentPage])();
}
render();
