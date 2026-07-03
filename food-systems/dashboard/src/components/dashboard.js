// dashboard.js · chart engine for the regenerated Food Systems dashboard.
// Framework-agnostic: receives { Plot, topojson, data, root }.
// data = { obesity, statesMarg, muniMarg, municipios(topojson), estados(geojson),
//          comparison, muniBivariate }
// Shared by the standalone story.html (CDN imports) and the Observable
// Framework page (npm imports). One source of truth.

const MARG_LEVELS = ["Muy bajo","Bajo","Medio","Alto","Muy alto"];
const MARG_COLORS = {
  "Muy bajo":"#0D9B8C", "Bajo":"#52B788", "Medio":"#D4A843",
  "Alto":"#E07B39", "Muy alto":"#C0392B"
};
// Bivariate quadrant colors (INFORMAS food env × CONAPO marginación)
const QUAD_COLORS = {
  "Doble vulnerabilidad":      "#8B1A1A",  // dark crimson, critical
  "Rezago con acceso":         "#E07B39",  // orange, social lag with some food access
  "Riqueza sin acceso fresco": "#4A7FA3",  // steel blue, wealthier food desert
  "Ventaja doble":             "#0D9B8C"   // teal, best scenario
};
const QUAD_ORDER = [
  "Doble vulnerabilidad","Rezago con acceso",
  "Riqueza sin acceso fresco","Ventaja doble"
];

const NAVY="#1B365D", TEAL="#0D9B8C", MUTED="#718096", GRID="#E4EBE8",
      GLOBAL_COL="#94A3B8", MX_COL="#C0392B";
const gradeColor = g => MARG_COLORS[g] ?? "#C9D3CE";
const quadColor  = q => QUAD_COLORS[q]  ?? "#C9D3CE";
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;

export function initDashboard({ Plot, topojson, data, root, shinyUrl = "" }){
  renderObesity(root.querySelector("#chart-obesity"), data.obesity, Plot);
  setupMap(root, data, topojson, Plot);
  setupComparison(root, data.comparison, Plot);
  if(data.muniBivariate) setupFoodEnv(root, data, topojson, Plot);
  wireShinyCTA(root, shinyUrl);
}

// The Shiny panel runs as a separate R process; there is no fixed URL until it is
// launched or deployed. If a real URL is configured the button links to it; if not,
// clicking reveals launch instructions instead of navigating to a dead path.
function wireShinyCTA(root, shinyUrl){
  const btn  = root.querySelector("#open-shiny");
  const note = root.querySelector("#shiny-note");
  if(!btn) return;
  if(shinyUrl){
    btn.setAttribute("href", shinyUrl);
    btn.setAttribute("target", "_blank");
    btn.setAttribute("rel", "noopener");
    return;
  }
  btn.setAttribute("href", "#");
  btn.addEventListener("click", (e)=>{
    e.preventDefault();
    if(note) note.classList.toggle("show");
  });
}

// Categorical marginación legend (5 tiers), rendered as HTML swatches.
export function buildLegend(el){
  if(!el) return;
  el.replaceChildren();
  MARG_LEVELS.forEach(g=>{
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<i style="background:${MARG_COLORS[g]}"></i>${g}`;
    el.appendChild(item);
  });
}

/* ══ 1 · Obesity ribbon: México vs mundo ═══════════════════════════════════ */
function renderObesity(el, obesity, Plot){
  if(!el) return;
  const last = obesity[obesity.length-1];
  const width = Math.min(760, el.clientWidth || 760);
  el.replaceChildren(Plot.plot({
    width, height: 380,
    marginLeft:44, marginRight:96, marginTop:24, marginBottom:36,
    style:{ fontFamily:"Inter, sans-serif", fontSize:"12px", background:"transparent" },
    x:{ label:null, tickFormat:"d", ticks:obesity.map(d=>d.year), grid:false },
    y:{ label:"↑ Adultos con obesidad (%)", grid:true, domain:[0,40], tickFormat:d=>d+"%" },
    marks:[
      // ribbon = the Mexico-minus-world gap
      Plot.areaY(obesity, { x:"year", y1:"global", y2:"mexico",
        fill:MX_COL, fillOpacity:0.10, curve:"catmull-rom" }),
      Plot.line(obesity, { x:"year", y:"global", stroke:GLOBAL_COL, strokeWidth:2.5,
        curve:"catmull-rom" }),
      Plot.line(obesity, { x:"year", y:"mexico", stroke:MX_COL, strokeWidth:3,
        curve:"catmull-rom" }),
      Plot.dot(obesity, { x:"year", y:"global", r:3.2, fill:GLOBAL_COL }),
      Plot.dot(obesity, { x:"year", y:"mexico", r:3.6, fill:MX_COL }),
      Plot.text([last], { x:"year", y:"mexico", text:d=>`México ${d.mexico}%`,
        dx:10, textAnchor:"start", fill:MX_COL, fontWeight:700, fontSize:13 }),
      Plot.text([last], { x:"year", y:"global", text:d=>`Mundo ${d.global}%`,
        dx:10, textAnchor:"start", fill:GLOBAL_COL, fontWeight:700, fontSize:13 }),
      Plot.text([obesity[0]], { x:"year", y:"mexico", text:d=>`${d.mexico}%`,
        dy:-12, fill:MX_COL, fontWeight:600, fontSize:11 }),
      Plot.text([obesity[0]], { x:"year", y:"global", text:d=>`${d.global}%`,
        dy:14, fill:GLOBAL_COL, fontWeight:600, fontSize:11 })
    ]
  }));
}

/* ══ 2 · Choropleth: municipal / estatal / bivariado toggle ════════════════ */
function setupMap(root, data, topojson, Plot){
  const el = root.querySelector("#chart-map");
  if(!el) return;
  const btns    = root.querySelectorAll("[data-map-level]");
  const legendEl = root.querySelector("#map-legend");

  // Bivariate: inseguridad alimentaria (red axis) × empleo agropecuario (blue axis)
  const BIV_COLORS = {
    "Paradoja agrícola":     "#8B1A1A",  // high insec + high agro  → crimson
    "Inseguridad sin campo": "#D4522A",  // high insec + low agro   → orange-red
    "Campo con seguridad":   "#1B365D",  // low insec  + high agro  → navy
    "Entorno protector":     "#0D9B8C"   // low insec  + low agro   → teal
  };
  const BIV_ORDER = ["Paradoja agrícola","Inseguridad sin campo","Campo con seguridad","Entorno protector"];
  const bivColor = q => BIV_COLORS[q] ?? "#C9D3CE";

  // ── Feature collections ────────────────────────────────────────────────────
  const muniFC = topojson.feature(data.municipios, data.municipios.objects.municipios);
  const muniGrade = new Map(data.muniMarg.map(d=>[d.code, d]));
  muniFC.features.forEach(f=>{ const m=muniGrade.get(f.properties.id);
    f.properties.grade = m? m.grade : null;
    f.properties.nom   = m? m.name  : f.properties.id;
    f.properties.score = m? m.score : null; });

  const stateFC = data.estados;
  const stGrade = new Map(data.statesMarg.map(d=>[d.state, d]));
  stateFC.features.forEach(f=>{ const s=stGrade.get(f.properties.state_name);
    f.properties.grade = s? s.grade : null;
    f.properties.score = s? s.score : null; });

  // ── Bivariate classification from comparison.json ─────────────────────────
  const cmpMap   = new Map(data.comparison.states.map(s=>[s.state, s]));
  const insecArr = data.comparison.states.map(s=>s.insec?.raw).filter(v=>v!=null).sort((a,b)=>a-b);
  const agroArr  = data.comparison.states.map(s=>s.agro?.raw).filter(v=>v!=null).sort((a,b)=>a-b);
  const medInsec = insecArr[Math.floor(insecArr.length/2)];
  const medAgro  = agroArr[Math.floor(agroArr.length/2)];

  stateFC.features.forEach(f=>{
    const s = cmpMap.get(f.properties.state_name);
    const insec = s?.insec?.raw, agro = s?.agro?.raw;
    if(insec==null||agro==null){ f.properties.bivQuad=null; return; }
    const hi = insec>medInsec, ha = agro>medAgro;
    f.properties.bivQuad  = hi&&ha ? "Paradoja agrícola"
                          : hi     ? "Inseguridad sin campo"
                          : ha     ? "Campo con seguridad"
                          :          "Entorno protector";
    f.properties.insecVal = insec;
    f.properties.agroVal  = agro;
  });

  // ── Legend update ─────────────────────────────────────────────────────────
  function updateLegend(level){
    if(!legendEl) return;
    legendEl.replaceChildren();
    if(level==="bivariate"){
      BIV_ORDER.forEach(q=>{
        const item=document.createElement("span");
        item.className="legend-item";
        item.innerHTML=`<i style="background:${BIV_COLORS[q]}"></i>${q}`;
        legendEl.appendChild(item);
      });
    } else {
      buildLegend(legendEl);
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  function draw(level){
    const width = Math.min(820, el.clientWidth || 820);

    if(level==="bivariate"){
      el.replaceChildren(Plot.plot({
        width, height:480,
        projection:{ type:"mercator", domain:stateFC },
        style:{ fontFamily:"Inter, sans-serif", fontSize:"11px" },
        marks:[
          Plot.geo(stateFC,{
            fill:  d=>bivColor(d.properties.bivQuad),
            fillOpacity: d=>d.properties.bivQuad ? 0.92 : 0.25,
            stroke:"#F0F5F2", strokeWidth:0.7,
            title: d=>{
              const p=d.properties;
              return `${p.state_name}\n${p.bivQuad ?? "sin dato"}`+
                (p.insecVal!=null?`\nInseguridad: ${p.insecVal}%`:"")+
                (p.agroVal!=null ?`\nEmpleo agropecuario: ${p.agroVal}%`:"");
            }
          })
        ]
      }));
    } else {
      const fc = level==="muni" ? muniFC : stateFC;
      el.replaceChildren(Plot.plot({
        width, height:480,
        // Fixed domain: always use stateFC so state/muni views don't shift
        projection:{ type:"mercator", domain:stateFC },
        style:{ fontFamily:"Inter, sans-serif", fontSize:"11px" },
        marks:[
          Plot.geo(fc,{
            fill: d=>gradeColor(d.properties.grade),
            stroke: level==="muni" ? "white" : "#5A6B7B",
            strokeWidth: level==="muni" ? 0.15 : 0.6,
            title: d=> level==="muni"
              ? `${d.properties.nom}\nMarginación: ${d.properties.grade ?? "s/d"}`
              : `${d.properties.state_name}\nMarginación: ${d.properties.grade ?? "s/d"}`
          }),
          // State border overlay: keeps islands visible in all views
          Plot.geo(stateFC,{stroke:"#5A6B7B", strokeWidth:0.45, fill:"none"}),
          level==="state"
            ? Plot.geo(stateFC,{stroke:"#33475B", strokeWidth:0.9, fill:"none"})
            : null
        ].filter(Boolean)
      }));
    }
    updateLegend(level);
  }

  btns.forEach(b=>b.addEventListener("click", ()=>{
    btns.forEach(x=>x.classList.remove("on"));
    b.classList.add("on");
    draw(b.dataset.mapLevel);
  }));
  draw("state");
}

/* ══ 3 · State comparison: beeswarm, one row per indicator ══════════════════ */
function setupComparison(root, comparison, Plot){
  const host = root.querySelector("#cmp-rows");
  if(!host) return;
  const { indicators, states } = comparison;
  const PILLARS = ["Salud","Sostenibilidad","Medios de vida"];

  let pillar = "Salud", mode = "score", highlight = "";

  // controls
  const pillarBtns = root.querySelectorAll("[data-pillar]");
  const modeBtns   = root.querySelectorAll("[data-mode]");
  const sel        = root.querySelector("#cmp-state");

  // populate state <select>
  if(sel){
    sel.innerHTML = `<option value="">Ninguno</option>` +
      states.map(s=>s.state).sort((a,b)=>a.localeCompare(b,"es"))
        .map(s=>`<option value="${s}">${s}</option>`).join("");
    sel.addEventListener("change", ()=>{ highlight = sel.value; render(); });
  }
  pillarBtns.forEach(b=>b.addEventListener("click", ()=>{
    pillarBtns.forEach(x=>x.classList.remove("on")); b.classList.add("on");
    pillar = b.dataset.pillar; render();
  }));
  modeBtns.forEach(b=>b.addEventListener("click", ()=>{
    modeBtns.forEach(x=>x.classList.remove("on")); b.classList.add("on");
    mode = b.dataset.mode; render();
  }));

  function render(){
    host.replaceChildren();
    const inds = indicators.filter(i=>i.pillar===pillar);
    // shared symmetric z-domain across the pillar for comparability
    let maxAbs = 0;
    inds.forEach(ind=> states.forEach(s=>{
      const z = s[ind.key]?.z; if(z!=null) maxAbs = Math.max(maxAbs, Math.abs(z)); }));
    maxAbs = Math.ceil(maxAbs*10)/10 || 2.5;

    inds.forEach(ind=>{
      const rows = states.map(s=>{
        const c = s[ind.key] || {};
        return { state:s.state, grade:s.grade,
                 val: mode==="score" ? c.z : c.rank, raw:c.raw, z:c.z, rank:c.rank };
      }).filter(d=>d.val!=null);

      // readout for the highlighted state (always correct, unlike a floating label)
      let readout = "";
      if(highlight){
        const h = rows.find(d=>d.state===highlight);
        readout = h
          ? `<span class="cmp-readout">${highlight}: <b>${h.raw}${ind.unit}</b> · rango ${h.rank}/32</span>`
          : `<span class="cmp-readout">${highlight}: sin dato</span>`;
      }

      const block = document.createElement("div");
      block.className = "cmp-block";
      block.innerHTML =
        `<div class="cmp-head">
           <span class="cmp-name">${ind.label}</span>
           <span class="cmp-def">${ind.def} <b>Fuente:</b> ${ind.source}</span>
           ${readout}
         </div>`;
      const holder = document.createElement("div");
      block.appendChild(holder);
      host.appendChild(block);

      const width = Math.min(820, host.clientWidth || 820);
      const xScale = mode==="score"
        ? { domain:[-maxAbs, maxAbs], label:null, ticks:5,
            tickFormat:d=> d===0 ? "prom." : (d>0?"+":"")+d }
        : { domain:[32.6,0.4], label:null, ticks:[1,8,16,24,32],
            tickFormat:d=>d };

      holder.replaceChildren(Plot.plot({
        width, height: 96,
        marginLeft:14, marginRight:14, marginTop:6, marginBottom:26,
        style:{ fontFamily:"Inter, sans-serif", fontSize:"10px" },
        x: xScale, y:{ axis:null },
        marks:[
          mode==="score" ? Plot.ruleX([0], {stroke:MUTED, strokeDasharray:"3,3"}) : null,
          Plot.dot(rows, Plot.dodgeY("middle", {
            x:"val", r:6, fill:d=>gradeColor(d.grade),
            fillOpacity:d=> highlight && d.state!==highlight ? 0.28 : 0.95,
            stroke:d=> d.state===highlight ? NAVY : "white",
            strokeWidth:d=> d.state===highlight ? 2.5 : 1,
            title:d=>`${d.state}\n${ind.label}: ${d.raw}${ind.unit}\n`+
                     `z ${d.z>=0?"+":""}${d.z} · rango ${d.rank}/32` }))
        ].filter(Boolean)
      }));
    });

    // axis hint under the rows
    const hint = document.createElement("div");
    hint.className = "cmp-hint";
    hint.textContent = mode==="score"
      ? "Escala z: 0 es el promedio nacional. A la derecha, valores más altos que el promedio."
      : "Rango 1 = estado con el valor más alto. Color por grado de marginación (CONAPO 2020).";
    host.appendChild(hint);
  }

  render();
}

/* ══ 4 · Food environment × marginación bivariate ══════════════════════════ */
export function buildQuadLegend(el){
  if(!el) return;
  el.replaceChildren();
  QUAD_ORDER.forEach(q=>{
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<i style="background:${QUAD_COLORS[q]}"></i>${q}`;
    el.appendChild(item);
  });
}

function setupFoodEnv(root, data, topojson, Plot){
  const mb = data.muniBivariate;
  if(!mb || !mb.length) return;

  buildQuadLegend(root.querySelector("#quad-legend"));
  _setupFoodEnvScatter(root, mb, Plot);
  _setupFoodEnvMap(root, data, topojson, mb, Plot);

  // Municipality selector: populated once, drives both charts
  const sel = root.querySelector("#muni-select");
  if(sel){
    const byState = {};
    mb.forEach(d=>{ (byState[d.state] = byState[d.state]||[]).push(d); });
    sel.innerHTML = `<option value="">Todos los municipios</option>` +
      Object.keys(byState).sort((a,b)=>a.localeCompare(b,"es"))
        .map(st=>`<optgroup label="${st}">` +
          byState[st].sort((a,b)=>a.name.localeCompare(b.name,"es"))
            .map(d=>`<option value="${d.code}">${d.name}</option>`).join("") +
          `</optgroup>`).join("");
    sel.addEventListener("change", ()=>{
      const code = sel.value;
      _setupFoodEnvScatter(root, mb, Plot, code);
      _setupFoodEnvMap(root, data, topojson, mb, Plot, code);
    });
  }
}

function _setupFoodEnvScatter(root, mb, Plot, highlight=""){
  const el = root.querySelector("#chart-foodenv-scatter");
  if(!el) return;

  const rows = mb.filter(d=>d.marg_score!=null && d.food_env_ratio!=null);
  const medMarg  = rows.map(d=>d.marg_score).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
  const medRatio = rows.map(d=>d.food_env_ratio).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
  const width = Math.min(820, el.clientWidth||820);

  // quadrant background rects
  const qrects = [
    { x1:0,       x2:medMarg, y1:0,        y2:medRatio, q:"Riqueza sin acceso fresco" },
    { x1:0,       x2:medMarg, y1:medRatio, y2:1,        q:"Ventaja doble" },
    { x1:medMarg, x2:100,     y1:0,        y2:medRatio, q:"Doble vulnerabilidad" },
    { x1:medMarg, x2:100,     y1:medRatio, y2:1,        q:"Rezago con acceso" }
  ];

  const hl = highlight ? rows.find(d=>d.code===highlight) : null;

  el.replaceChildren(Plot.plot({
    width, height:440,
    marginLeft:52, marginRight:20, marginTop:20, marginBottom:44,
    style:{ fontFamily:"Inter, sans-serif", fontSize:"11px", background:"transparent" },
    x:{ label:"Marginación (CONAPO 2020) →", domain:[0,100], grid:false,
        tickFormat: d=> d===0?"Muy baja": d===100?"Muy alta": "" },
    y:{ label:"↑ Entorno saludable (ratio)", domain:[0,1],
        tickFormat: d=>(d*100).toFixed(0)+"%" },
    marks:[
      // quadrant backgrounds
      Plot.rect(qrects,{
        x1:"x1", x2:"x2", y1:"y1", y2:"y2",
        fill: d=>quadColor(d.q), fillOpacity:0.08
      }),
      // median lines
      Plot.ruleX([medMarg], {stroke:MUTED, strokeDasharray:"4,3", strokeWidth:1}),
      Plot.ruleY([medRatio], {stroke:MUTED, strokeDasharray:"4,3", strokeWidth:1}),
      // quadrant labels
      Plot.text(qrects, {
        x: d=>(d.x1+d.x2)/2, y: d=>(d.y1+d.y2)/2,
        text:"q", fill: d=>quadColor(d.q), fillOpacity:0.55,
        fontSize:10, fontWeight:600, textAnchor:"middle"
      }),
      // background dots (non-highlighted)
      Plot.dot(rows.filter(d=>d.code!==highlight), {
        x:"marg_score", y:"food_env_ratio",
        r:3.5, fill:d=>quadColor(d.quadrant||""),
        fillOpacity:highlight ? 0.18 : 0.55,
        stroke:"white", strokeWidth:0.5,
        title:d=>`${d.name} (${d.state})\nRezago: ${d.marg_score}\nEntorno saludable: ${(d.food_env_ratio*100).toFixed(1)}%\nCarencia alimentaria: ${d.carencia_ali_pct}%\n${d.quadrant}`
      }),
      // highlighted dot
      hl ? Plot.dot([hl],{
        x:"marg_score", y:"food_env_ratio",
        r:7, fill:d=>quadColor(d.quadrant||""),
        stroke:NAVY, strokeWidth:2.5,
        title:d=>`${d.name} (${d.state})`
      }) : null,
      hl ? Plot.text([hl],{
        x:"marg_score", y:"food_env_ratio",
        text: d=>`${d.name}`,
        dy:-12, fontSize:11, fontWeight:700, fill:NAVY,
        textAnchor:"middle"
      }) : null
    ].filter(Boolean)
  }));
}

function _setupFoodEnvMap(root, data, topojson, mb, Plot, highlight=""){
  const el = root.querySelector("#chart-foodenv-map");
  if(!el) return;

  const muniFC = topojson.feature(data.municipios, data.municipios.objects.municipios);
  const byCode = new Map(mb.map(d=>[d.code, d]));
  muniFC.features.forEach(f=>{
    const m = byCode.get(f.properties.id);
    f.properties.quadrant = m ? m.quadrant : null;
    f.properties.nom      = m ? m.name    : f.properties.id;
    f.properties.foodRatio= m ? m.food_env_ratio : null;
    f.properties.carencia = m ? m.carencia_ali_pct : null;
    f.properties.highlight= f.properties.id === highlight;
  });

  const width = Math.min(820, el.clientWidth||820);
  el.replaceChildren(Plot.plot({
    width, height:480,
    projection:{ type:"mercator", domain:muniFC },
    style:{ fontFamily:"Inter, sans-serif", fontSize:"11px" },
    marks:[
      Plot.geo(muniFC,{
        fill: d=>quadColor(d.properties.quadrant),
        fillOpacity: d=> highlight
          ? (d.properties.highlight ? 1 : 0.30)
          : 0.85,
        stroke:"white", strokeWidth:0.12,
        title: d=>{
          const p=d.properties;
          return `${p.nom}\n${p.quadrant||"sin dato"}`+
            (p.foodRatio!=null?`\nEntorno saludable: ${(p.foodRatio*100).toFixed(1)}%`:"")+
            (p.carencia!=null?`\nCarencia alimentaria: ${p.carencia}%`:"");
        }
      }),
      highlight ? Plot.geo(
        { type:"FeatureCollection",
          features: muniFC.features.filter(f=>f.properties.highlight) },
        { stroke:NAVY, strokeWidth:2, fill:"none" }
      ) : null
    ].filter(Boolean)
  }));
}
