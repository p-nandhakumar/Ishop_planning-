// Monthly Priority Scheduler — browser-local planning prototype.
// Capacity and priority rules are editable DEMO assumptions, not JSW standards.
const SCHED_KEY = "ishop_monthly_priority_scheduler_v1";
const SCHED_DEFAULT_HOURS = 208; // Example only: 26 days x 8 hours, one resource.
let sched = loadSched();

function loadSched() {
  try {
    const raw=JSON.parse(localStorage.getItem(SCHED_KEY));
    if(raw&&typeof raw==="object"&&!Array.isArray(raw))
      return {month:raw.month||todayLocal().slice(0,7),capacities:raw.capacities||{},boosts:raw.boosts||{},included:raw.included||{},plans:raw.plans||{}};
  } catch(e) {}
  return {month:todayLocal().slice(0,7),capacities:{},boosts:{},included:{},plans:{}};
}
function saveSched() { localStorage.setItem(SCHED_KEY,JSON.stringify(sched)); }
function schedOpenJobs() { return jobs.filter(j=>!j.dispatched); }
function schedRoute(j) { return (j.operations||[]).map((op,i)=>({...op,opIndex:i})).filter(op=>op.status!=="Completed"); }
function schedResource(op,j) { return op.resource||j.primaryPC||"Unassigned"; }
function schedCap(key) { return Number(sched.capacities[key]??SCHED_DEFAULT_HOURS); }
function schedCapacityKeys() {
  const all=new Set(["PC-1","PC-2","PC-3","PC-4","PC-5"]);
  schedOpenJobs().forEach(j=>schedRoute(j).forEach(op=>all.add(schedResource(op,j))));
  return [...all].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function schedReviewDate() {
  const now=todayLocal();
  return now.slice(0,7)===sched.month?now:sched.month+"-01";
}
function schedReadiness(j) {
  const checks=(j.operations||[]).filter(op=>op.gate==="Input Readiness");
  if(checks.some(op=>op.status==="Hold"))return "Hold";
  if(checks.length&&checks.every(op=>op.status==="Completed"))return "Ready";
  if(checks.length)return "Not Cleared";
  return "Not Verified";
}
function schedPriority(j) {
  const base={"Breakdown / Shutdown":55,"High":35,"Normal":15}[j.priority]??15;
  const due=j.committed?daysBetween(schedReviewDate(),j.committed):null;
  const urgency=due===null?0:due<0?30:due<=7?28:due<=14?20:due<=30?12:0;
  const readiness=schedReadiness(j)==="Ready"?10:schedReadiness(j)==="Hold"?-20:0;
  const age=j.received?daysBetween(j.received,schedReviewDate()):null;
  const aging=age===null||age<=14?0:age<=30?3:5;
  const boost=Math.max(0,Math.min(20,Number(sched.boosts[j.id])||0));
  return {score:Math.max(0,Math.min(100,base+urgency+readiness+aging+boost)),base,urgency,readiness,aging,boost};
}
function schedMonthLast(month) {
  const parts=month.split("-");
  return new Date(Number(parts[0]),Number(parts[1]),0).getDate();
}
function schedWeekEnd(month,week) {
  const day=week===4?schedMonthLast(month):week*7;
  return `${month}-${String(day).padStart(2,"0")}`;
}
function schedIncluded(j) { return sched.included[j.id]!==false; }
function schedSignature() {
  return JSON.stringify(schedOpenJobs().map(j=>[j.id,j.priority,j.committed,j.received,(j.operations||[]).map(o=>[o.seq,o.gate,o.resource,o.plan,o.status])]));
}
function schedSelectedMonth(next) {
  if(!/^\d{4}-\d{2}$/.test(next||""))return;
  sched.month=next;saveSched();render();
}
function schedReadControls() {
  document.querySelectorAll("[data-cap]").forEach(el=>sched.capacities[el.dataset.cap]=Math.max(0,Number(el.value)||0));
  document.querySelectorAll("[data-boost]").forEach(el=>sched.boosts[el.dataset.boost]=Math.max(0,Math.min(20,Number(el.value)||0)));
  document.querySelectorAll("[data-sched-include]").forEach(el=>sched.included[el.dataset.schedInclude]=el.checked);
  saveSched();
}
function schedPlanMonth() {
  schedReadControls();
  const period=sched.month;
  const capacityKeys=schedCapacityKeys();
  const loads=Object.fromEntries(capacityKeys.map(key=>[key,[0,0,0,0]]));
  const queue=schedOpenJobs().filter(schedIncluded).sort((a,b)=>schedPriority(b).score-schedPriority(a).score || (a.committed||"9999").localeCompare(b.committed||"9999"));
  const rows=[];
  const results={};
  for(const job of queue) {
    const remaining=schedRoute(job).sort((a,b)=>Number(a.seq)-Number(b.seq));
    if(!remaining.length){results[job.id]="No Open Routing";continue;}
    const groups=new Map();
    remaining.forEach(op=>{
      const seq=Math.max(1,Number(op.seq)||1);
      if(!groups.has(seq))groups.set(seq,[]);
      groups.get(seq).push(op);
    });
    let earliest=0;
    let failed=false;
    let firstFailure="";
    const held=schedReadiness(job)==="Hold";
    for(const [seq,group] of [...groups.entries()].sort((a,b)=>a[0]-b[0])) {
      const missing=group.some(op=>!(Number(op.plan)>0));
      const onHold=held||group.some(op=>op.status==="Hold");
      let pieces=[];
      let status="Scheduled";
      if(failed)status="Blocked by Predecessor";
      else if(onHold)status="On Hold";
      else if(missing)status="Need Estimate";
      else {
        // Plan long operations over consecutive weeks. Reserve a whole sequence
        // group atomically so a failed activity does not consume capacity.
        const provisional=Object.fromEntries(capacityKeys.map(key=>[key,[...loads[key]]]));
        let complete=true;
        for(const op of group){
          const key=schedResource(op,job);
          let remaining=Number(op.plan);
          for(let w=earliest;w<4 && remaining>1e-7;w++){
            const available=Math.max(0,schedCap(key)/4-provisional[key][w]);
            const allotted=Math.min(remaining,available);
            if(allotted<=1e-7)continue;
            provisional[key][w]+=allotted;
            pieces.push({op,week:w+1,hours:Number(allotted.toFixed(4))});
            remaining-=allotted;
          }
          if(remaining>1e-7){complete=false;break;}
        }
        if(!complete){status="Capacity Gap";pieces=[];}
        else {
          for(const key of capacityKeys)loads[key]=provisional[key];
          earliest=Math.max(...pieces.map(p=>p.week))-1;
        }
      }
      if(!pieces.length){failed=true;if(!firstFailure)firstFailure=status;}
      const rowFor=(op,week,hours)=>({jobId:job.id,description:job.description,primaryPC:job.primaryPC||"—",priority:job.priority||"Normal",score:schedPriority(job).score,committed:job.committed||"",seq,opIndex:op.opIndex,gate:op.gate,operation:op.name||op.gate,resource:schedResource(op,job),hours,week,status});
      if(pieces.length)pieces.forEach(p=>rows.push(rowFor(p.op,p.week,p.hours)));
      else group.forEach(op=>rows.push(rowFor(op,0,Number(op.plan)||0)));
    }
    results[job.id]=firstFailure||"Scheduled";
  }
  const plan={month:period,rows,results,signature:schedSignature(),createdAt:new Date().toISOString()};
  sched.plans[period]=plan;saveSched();render();toast(`Monthly plan generated for ${queue.length} open job(s)`);
}
function schedLoadByResource(plan) {
  const load={};
  (plan?.rows||[]).forEach(r=>{
    if(!r.week||r.week<1||r.week>4)return;
    load[r.resource]??=[0,0,0,0];
    load[r.resource][r.week-1]+=(Number(r.hours)||0);
  });
  return load;
}
function schedResult(j,plan) {
  if(!schedIncluded(j))return "Excluded";
  return plan?.results?.[j.id]||"Not Planned";
}
function schedFlag(row) {
  if(["Capacity Exceeded","Sequence Conflict"].includes(row.status))return row.status;
  if(!row.week)return row.status||"Unscheduled";
  return row.committed&&schedWeekEnd(sched.month,row.week)>row.committed?"After Due Date":"Within Due Date";
}
function schedFlagClass(flag) {
  return ["After Due Date","Capacity Gap","On Hold","Blocked by Predecessor","Capacity Exceeded","Sequence Conflict"].includes(flag)?"hold":flag==="Need Estimate"?"inprogress":flag==="Within Due Date"||flag==="Scheduled"?"completed":"pending";
}
function schedApplyWeeks() {
  const plan=sched.plans[sched.month];if(!plan)return;
  document.querySelectorAll("[data-assign-week]").forEach(el=>{
    const r=plan.rows[Number(el.dataset.assignWeek)];
    if(!r)return;
    r.week=Number(el.value)||0;
    r.status=r.week?"Scheduled":"Manually Unscheduled";
  });
  const loads=schedLoadByResource(plan);
  const alerts=[];
  for(const [res,weeks] of Object.entries(loads)){
    weeks.forEach((value,i)=>{if(value>schedCap(res)/4+1e-9)alerts.push(`${res} W${i+1}`);});
  }
  const overloaded=new Set(alerts);
  for(const r of plan.rows){
    if(r.week&&overloaded.has(`${r.resource} W${r.week}`))r.status="Capacity Exceeded";
  }
  const byJob={};
  for(const r of plan.rows){
    byJob[r.jobId]??=[];
    byJob[r.jobId].push(r);
  }
  plan.results={};
  const sequenceAlerts=[];
  for(const [id,rows] of Object.entries(byJob)){
    const stages=[...new Set(rows.map(r=>Number(r.seq)))].sort((a,b)=>a-b);
    for(let i=1;i<stages.length;i++){
      const earlier=rows.filter(r=>Number(r.seq)===stages[i-1]);
      const later=rows.filter(r=>Number(r.seq)===stages[i]);
      if(earlier.some(r=>!r.week)||later.some(r=>!r.week))continue;
      if(Math.max(...earlier.map(r=>r.week))>Math.min(...later.map(r=>r.week))){
        later.forEach(r=>r.status="Sequence Conflict");sequenceAlerts.push(id);break;
      }
    }
    plan.results[id]=rows.some(r=>r.status==="Sequence Conflict")?"Sequence Conflict":rows.some(r=>r.status==="Capacity Exceeded")?"Capacity Exceeded":rows.every(r=>r.week>0)?"Scheduled":"Partly Planned";
  }
  saveSched();render();
  toast(alerts.length?`Saved with capacity warning: ${alerts.slice(0,2).join(", ")}`:sequenceAlerts.length?`Saved with routing sequence warning on ${sequenceAlerts.slice(0,2).join(", ")}`:"Manual week assignments saved");
}
function schedAddSamples() {
  const month=sched.month;
  const day=n=>`${month}-${String(Math.min(n,schedMonthLast(month))).padStart(2,"0")}`;
  const op=(seq,gate,name,section,resource,plan,status="Pending")=>({seq,gate,name,section,resource,plan:String(plan),actual:"",status,feedback:""});
  const samples=[
    {id:"DEMO-SHUT-001",description:"Emergency gear housing refurbishment",primaryPC:"PC-2",priority:"Breakdown / Shutdown",received:day(1),committed:day(7),operations:[op(1,"Input Readiness","Material and drawing release","Planning / Engineering","PC-2",3,"Completed"),op(2,"Fabrication / Welding","Housing repair","Fabrication","PC-2",24),op(2,"Machining","Special face milling","Machining","CNC Gantry Milling",16),op(3,"Inspection","Final dimensional check","Quality / NDT","Quality / NDT",5)]},
    {id:"DEMO-LADLE-002",description:"Ladle shell plate refurbishment",primaryPC:"PC-1",priority:"High",received:day(2),committed:day(24),operations:[op(1,"Cutting & Forming","Plate cutting","Cutting Bay","Plate Cutting",12),op(2,"Cutting & Forming","Plate rolling","Cutting Bay","Plate Rolling",14),op(3,"Fabrication / Welding","Shell welding","Fabrication","PC-1",64),op(3,"Machining","Special machining of insert","Machining","CNC Gantry Milling",18),op(4,"Inspection","Weld NDT","Quality / NDT","Quality / NDT",8)]},
    {id:"DEMO-ROLL-003",description:"Guide roll refurbishment",primaryPC:"PC-4",priority:"Normal",received:day(4),committed:day(27),operations:[op(1,"Machining","Finish turning","Machining","Lathe Group",20),op(2,"Fabrication / Welding","SAW cladding","Welding","SAW Welding",16),op(3,"Inspection","Runout verification","Quality / NDT","Quality / NDT",4)]},
    {id:"DEMO-FAB-004",description:"Transfer chute fabrication",primaryPC:"PC-3",priority:"High",received:day(3),committed:day(17),operations:[op(1,"Cutting & Forming","Plate cutting","Cutting Bay","Plate Cutting",12),op(2,"Fabrication / Welding","Chute fit-up and welding","Fabrication","PC-3",36),op(3,"Finishing","Shot blasting","Shot Blasting","Shot Blasting Cell",8),op(4,"Finishing","Painting","Painting","Painting Cell",6)]}
  ];
  let added=0;
  samples.forEach(s=>{
    if(jobs.some(j=>j.id===s.id))return;
    jobs.push({...newDraft(),...s,source:"Illustrative sample",quantity:1,department:"Demo"});added++;
  });
  saveJobs();render();toast(`${added} illustrative sample job(s) added. Actual I-SMR data was not changed.`);
}

function schedExportCsv() {
  const plan=sched.plans[sched.month];
  if(!plan?.rows?.length){toast("Generate a monthly plan first");return;}
  const headings=["Job Code","Priority Score","Primary PC","Original Commitment","Sequence","Gate","Operation","Work Centre / Machine","Planned Hours","Assigned Week","Status / Risk"];
  const csv=[headings,...plan.rows.map(r=>[r.jobId,r.score,r.primaryPC,r.committed,r.seq,r.gate,r.operation,r.resource,r.hours,r.week?`W${r.week}`:"Unscheduled",schedFlag(r)])]
    .map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=`IShop_Monthly_Priority_Plan_${sched.month}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast("Monthly plan CSV downloaded");
}
function scheduler() {
  const queued=schedOpenJobs().sort((a,b)=>schedPriority(b).score-schedPriority(a).score || (a.committed||"9999").localeCompare(b.committed||"9999"));
  const resources=schedCapacityKeys();
  const plan=sched.plans[sched.month];
  const load=schedLoadByResource(plan);
  const totalPlanned=new Set((plan?.rows||[]).filter(r=>r.week>0).map(r=>`${r.jobId}:${r.opIndex}`)).size;
  const eligible=queued.filter(schedIncluded).length;
  const scheduledCount=Object.values(plan?.results||{}).filter(s=>s==="Scheduled").length;
  const atRiskCount=new Set((plan?.rows||[]).filter(r=>schedFlag(r)==="After Due Date").map(r=>r.jobId)).size;
  const gapCount=new Set((plan?.rows||[]).filter(r=>!r.week).map(r=>r.jobId)).size;
  const stale=plan&&plan.signature!==schedSignature();
  return head("Monthly Priority Scheduler","Priority-weighted monthly loading · editable demo capacity · week-wise routing across PCs and shared machines",
    `<div class="actionrow"><button class="btn secondary" onclick="startNew()">+ Add Job</button><button class="btn" onclick="schedPlanMonth()">Generate Priority Plan</button></div>`)
    +`<div class="scheduler-top-grid">
      <section class="panel">
        ${title("Planning Controls","Draft plan, not an approved production schedule")}
        <div class="filters sched-top-controls"><label class="field">Plan Month<input type="month" value="${h(sched.month)}" onchange="schedSelectedMonth(this.value)"></label><button class="btn secondary" onclick="schedAddSamples()">+ Load 4 Sample Jobs</button><button class="btn secondary" onclick="schedExportCsv()">Download Plan CSV</button></div>
        <div class="source-note">W1: 1–7 · W2: 8–14 · W3: 15–21 · W4: 22–month end. Available monthly hours are divided equally into four approximate planning buckets. Completed route operations and dispatched jobs are excluded.</div>
      </section>
      <section class="panel">
        ${title("Priority Score Method","Transparent demonstration rule · 0–100")}
        <div class="scoring-legend"><span><b>55 / 35 / 15</b> Breakdown / High / Normal</span><span><b>+0 to 30</b> Due-date urgency</span><span><b>+10 / −20</b> Ready / Hold</span><span><b>+0 to 5</b> Job age</span><span><b>+0 to 20</b> Manual boost</span></div>
        <div class="source-note">Priority is a planning recommendation only. Original commitments, capacity and readiness must be checked before confirming a shop load plan.</div>
      </section>
    </div>
    <div class="scheduler-stats">
      ${kpi("Open Demo Jobs",queued.length,"▣")}
      ${kpi("Included in Plan",eligible,"☑")}
      ${kpi("Fully Scheduled",scheduledCount,"▤")}
      ${kpi("Possible Late Jobs",atRiskCount,"◷")}
      ${kpi("Capacity / Input Gaps",gapCount,"!")}
    </div>
    <section class="panel sectionspace">
      ${title("1. Monthly Capacity","Input available hours per PC / machine. 208 h is a sample assumption, not verified I-Shop availability.")}
      <div class="capacity-editor">${resources.map(key=>`<label class="field">${h(key)}<input type="number" min="0" step="any" data-cap="${h(key)}" value="${h(schedCap(key))}"><small>hours / month</small></label>`).join("")}</div>
    </section>
    <section class="panel sectionspace">
      ${title("2. Priority Queue","Only open editable jobs · change the bonus or inclusion, then Generate Priority Plan")}
      <div class="tablewrap"><table class="sheet scheduler-queue"><thead><tr><th>Include</th><th>Job Code</th><th>Primary PC</th><th>Priority</th><th>Committed</th><th>Job COTD</th><th>Input Ready?</th><th>Remaining Plan h</th><th>Score</th><th>Extra Boost</th><th>Plan Result</th></tr></thead><tbody>
        ${queued.map(j=>{const rank=schedPriority(j),route=schedRoute(j),hours=route.reduce((s,o)=>s+(Number(o.plan)||0),0),cotd=jobCOTD(j);return `<tr><td><input type="checkbox" data-sched-include="${h(j.id)}" ${schedIncluded(j)?"checked":""} aria-label="Include ${h(j.id)}"></td><td><button class="text-action" onclick="editSaved('${h(j.id)}')">${h(j.id)}</button></td><td>${h(j.primaryPC)}</td><td>${h(j.priority||"Normal")}</td><td>${dateView(j.committed)}</td><td class="status-cell ${cotdClass(cotd.status)}" title="${h(cotd.note)}">${h(cotd.status)}</td><td>${h(schedReadiness(j))}</td><td class="right">${formatQty(hours)}</td><td class="center"><b title="Base ${rank.base} + Urgency ${rank.urgency} + Readiness ${rank.readiness} + Age ${rank.aging} + Boost ${rank.boost}">${rank.score}</b></td><td><input type="number" min="0" max="20" step="1" data-boost="${h(j.id)}" value="${rank.boost}"></td><td class="status-cell ${schedFlagClass(schedResult(j,plan))}">${h(schedResult(j,plan))}</td></tr>`;}).join("")}
        ${!queued.length?`<tr><td colspan="11" class="empty">No open editable jobs. Select “Load 4 Sample Jobs”, or add your own job with routing and planned hours.</td></tr>`:""}
      </tbody></table></div>
      <div class="actionrow sectionspace"><button class="btn" onclick="schedPlanMonth()">Generate Priority Plan</button><span class="mini-label">Jobs are considered in descending score; parallel operations with the same sequence are planned together.</span></div>
    </section>
    ${stale?`<div class="small-tip"><b>Plan needs refresh:</b> Job priority, due date, or route details changed since the last plan. Select Generate Priority Plan.</div>`:""}
    <div class="scheduler-results">
      <section class="panel">
        ${title("3. Capacity Loading",`Work-centre utilisation · ${totalPlanned} operations assigned`)}
        <div class="tablewrap"><table class="sheet scheduler-load"><thead><tr><th>PC / Machine</th><th>Month Cap. h</th><th>W1 h</th><th>W2 h</th><th>W3 h</th><th>W4 h</th><th>Load %</th></tr></thead><tbody>
          ${resources.map(key=>{const weeks=load[key]||[0,0,0,0],cap=schedCap(key),total=weeks.reduce((a,b)=>a+b,0),pct=cap>0?Math.round(total/cap*100):(total?999:0),over=weeks.some(n=>n>cap/4+1e-9);return `<tr><td>${h(key)}</td><td class="right">${formatQty(cap)}</td>${weeks.map(v=>`<td class="right ${v>cap/4+1e-9?"schedule-overload":""}">${formatQty(v)}</td>`).join("")}<td class="status-cell ${over?"hold":pct>=85?"inprogress":"completed"}">${pct===999?">100":pct}%</td></tr>`;}).join("")}
        </tbody></table></div>
      </section>
      <section class="panel">
        ${title("4. Operation-Wise Weekly Schedule","One row per routed activity; manual week changes are editable")}
        ${plan?.rows?.length?`<div class="tablewrap"><table class="sheet scheduler-operations"><thead><tr><th>Job Code</th><th>Score</th><th>Seq.</th><th>Operation / Gate</th><th>PC / Machine</th><th>Plan h</th><th>Week</th><th>Due Date</th><th>Risk / Constraint</th></tr></thead><tbody>
          ${plan.rows.map((r,i)=>`<tr><td>${h(r.jobId)}</td><td class="center">${r.score}</td><td class="center">${r.seq}</td><td><b>${h(r.operation)}</b><div class="mini-label">${h(r.gate)}</div></td><td>${h(r.resource)}</td><td class="right">${formatQty(r.hours)}</td><td><select data-assign-week="${i}" ${r.hours<=0||r.status==="On Hold"?"disabled": ""}>${[0,1,2,3,4].map(w=>`<option value="${w}" ${Number(r.week)===w?"selected":""}>${w?`W${w}`:"—"}</option>`).join("")}</select></td><td>${dateView(r.committed)}</td><td class="status-cell ${schedFlagClass(schedFlag(r))}">${h(schedFlag(r))}</td></tr>`).join("")}
        </tbody></table></div><div class="actionrow sectionspace"><button class="btn secondary" onclick="schedApplyWeeks()">Save Manual Week Changes</button></div>`:`<div class="empty">No monthly plan yet. Enter capacities and select Generate Priority Plan.</div>`}
      </section>
    </div>
    <div class="source-note sectionspace"><b>Planning logic:</b> Operations can be divided across weeks when their estimated hours exceed one week's available capacity. Activities sharing a sequence may overlap; later sequences begin only from the final week of the preceding group in the automatic plan. Manual edits are checked for capacity and sequence conflicts. “After Due Date” means potential planning risk, not confirmed COTD failure. All figures are a demo saved only in this browser.</div>`;
}
