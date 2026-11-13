/* Major Job Tracking demo: all 10 example jobs and dates are fictional. */
(function(){
const KEY='ishop_major_10_demo_v2';
const GATE_NAMES=['Input Readiness','Cutting & Forming','Fabrication / Welding','Machining','Finishing','Inspection','Dispatch'];
const MONTHS=[['Jun 2026',82],['Jul 2026',83],['Aug 2026',84],['Sep 2026',85],['Oct 2026',87],['Nov 2026',88]];
const seed=[
['MAJ-SAL-001','Salem Project – Horizontal Segment','Salem Project','PC-1','2026-09-02','2026-10-28','2026-10-30',10.8,[3,6,12,5,4,3,1],[0,1,2,1,1,1,2],['Drawing revision approval required','Plate profile marking correction','Weld distortion controlled through staggered sequence','Gantry slot rescheduled','Blasting held for inspection clearance','Additional dimensional check at journal seat','Dispatched after final clearance']],
['MAJ-SAL-002','Salem Project – Bender Segment','Salem Project','PC-3','2026-09-05','2026-11-10','',14.2,[4,7,14,6,3,3,1],[0,1,3,2,0,0,0],['BOM clarification closed','Rolling pass added for thicker plate','Fit-up mismatch required re-setting','Gantry machining awaiting available slot','Shot blasting planned after fabrication','NDT access arrangement pending','Dispatch planned after QA release']],
['MAJ-SAL-003','Salem Project – Vertical Segment','Salem Project','PC-2','2026-09-12','2026-11-25','',12.5,[4,6,16,8,3,3,1],[1,0,1,0,0,0,0],['Drawing issue resolved after review','Cutting completed after nest approval','Welding in progress; crane rotation required','Special boring capacity reserved','Painting requires QA clearance','Inspection hold point scheduled','Dispatch subject to complete assembly']],
['MAJ-LAD-004','350T Steel Ladle Manufacturing','Ladle','PC-1','2026-08-15','2026-11-05','',75,[6,12,24,10,6,5,2],[1,2,5,0,0,0,0],['P355NH WPS/PQR verification completed','Heavy plates required additional handling','Preheat/interpass monitoring and crane rotation delayed work','Trunnion machining pending slot confirmation','Stress relief and primer after welding clearance','100% NDT of critical joints awaiting availability','Customer release still pending']],
['MAJ-LAD-005','Ladle Trunnion & Support Refurbishment','Ladle','PC-4','2026-09-10','2026-10-31','2026-11-02',21,[3,5,14,8,3,3,1],[0,1,2,2,1,1,2],['Repair scope frozen','Material preparation completed','Rework after visual defect identification','Bore alignment took extra setting hours','Blasting delayed by machining handover','UT repeat examination performed','Released after repair acceptance']],
['MAJ-CBV-006','Conventional Bundle – Main Frame','Conventional Bundle','PC-5','2026-09-18','2026-11-18','',18,[4,8,16,6,3,3,1],[0,0,1,1,0,0,0],['Drawing and BOM approved','Profile cutting completed','Frame welding in progress; manpower reallocation needed','Gantry support machining planned in parallel','Surface preparation not yet due','Dimensional inspection pending','Customer delivery after assembly']],
['MAJ-CBV-007','Conventional Bundle – Support Assembly','Conventional Bundle','PC-2','2026-09-20','2026-11-22','',9.5,[3,6,12,5,3,3,1],[0,1,0,1,0,0,0],['Material issue complete','Bending completed with extra set-up','Fit-up work progressing','Boring of mounting faces planned','Primer not yet started','Stage inspection to follow','Target dispatch under review']],
['MAJ-CBV-008','Conventional Bundle – Base Structure','Conventional Bundle','PC-3','2026-09-21','2026-10-24','2026-10-24',12,[3,5,10,4,2,2,1],[0,0,0,0,0,0,0],['All drawing inputs available','Plate cutting per plan','Weld dimensions accepted','Machining completed to tolerance','Primer clearance received','Final dimensional checks accepted','Dispatched on commitment']],
['MAJ-LAD-009','Ladle Shell Patch & Nozzle Repair','Ladle','PC-4','2026-09-08','2026-10-20','2026-10-19',15,[3,6,12,4,3,3,1],[0,0,0,0,0,0,-1],['Material released','Nozzle opening cutting completed','Patch welding complete','Facing completed','Finishing and primer completed','Repair NDT accepted','Delivered one day early']],
['MAJ-SAL-010','Salem Project – Roller Guide Segment','Salem Project','PC-5','2026-10-01','2026-11-29','',16,[3,5,14,7,3,3,1],[0,1,2,0,0,0,0],['Engineering inputs verified','Bending sequence required extra trial','Welding work in progress; fixture access constraint','Special milling in next available shift','Painting not yet started','QA release not yet due','Dispatch planned by original commitment']]
];
function shift(date,n){let d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function delta(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)}
function build(){return seed.map(([id,name,kind,pc,received,committed,dispatched,weight,durs,late,notes])=>{
 const activeGateByJob = {
  'MAJ-SAL-002': 3, 'MAJ-SAL-003': 2, 'MAJ-LAD-004': 2,
  'MAJ-CBV-006': 2, 'MAJ-CBV-007': 2, 'MAJ-SAL-010': 2
 };
 const activeGate = activeGateByJob[id];
 const totalDuration = durs.reduce((total, days) => total + days, 0);
 let elapsed = 0;
 let previousActual = received;
 const gates=GATE_NAMES.map((gate,i)=>{
  elapsed += durs[i];
  const planned = shift(received, Math.round(elapsed * delta(received, committed) / totalDuration));
  const finished = Boolean(dispatched) || i < activeGate;
  const actual = !finished ? '' : i === 6 ? dispatched
    : [shift(planned, late[i]), previousActual].sort().at(-1);
  if (actual) previousActual = actual;
  const status = actual ? 'Completed' : i === activeGate ? 'In Progress' : 'Pending';
  const section = ['Planning / Engineering', 'Cutting Bay', 'Fabrication', 'Machining',
   'Shot Blasting', 'Quality / NDT', 'Dispatch'][i];
  const resource = ['Other', 'Plate Cutting', pc, 'CNC Gantry Milling',
   'Shot Blasting Cell', 'Quality / NDT', 'Dispatch / SAP'][i];
  const planHours = Math.round(durs[i] * 5.5 + weight * (i === 2 ? 1.7 : 0.15));
  const actualHours = actual ? Math.round(planHours * (1 + delta(planned, actual) * 0.06)) : '';
  return {gate, section, resource, planned, actual, status, planHours, actualHours, remarks: notes[i]};
 });
 return {id,name,kind,pc,received,committed,dispatched,weight,remarks:notes[2],gates};
});}
// Import previous gate edits when a browser first opens the integrated job records.
window.loadMajorJobSamples = () => {
 let previous;
 try {
  previous = JSON.parse(localStorage.getItem(KEY));
 } catch {
  previous = [];
 }
 return build().map(sample => {
  const saved = Array.isArray(previous) ? previous.find(job => job?.id === sample.id) : null;
  const gates = Array.isArray(saved?.gates) && saved.gates.length === sample.gates.length ? saved.gates : [];
  return {
   id: sample.id, sampleId: sample.id, description: sample.name, department: sample.kind,
   primaryPC: sample.pc, received: sample.received, committed: sample.committed,
   dispatched: saved?.dispatched ?? sample.dispatched, quantity: 1, tonnes: sample.weight,
   priority: 'Normal', source: 'Illustrative major job', remarks: sample.remarks,
   operations: sample.gates.map((base, i) => {
    const gate = gates[i] ?? base;
    return {
     seq: i + 1, gate: base.gate, name: base.gate, section: base.section, resource: base.resource,
     plannedDate: gate.planned, actualDate: gate.actual, plan: gate.planHours,
     actual: gate.actualHours, status: gate.status, feedback: gate.remarks
    };
   })
  };
 });
};
window.sampleCOTDTrend = MONTHS;
})();
