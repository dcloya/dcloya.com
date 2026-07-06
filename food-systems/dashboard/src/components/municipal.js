// municipal.js · chart engine for the municipal-first visualization page (v2).
// Five views:
//   V1 bivariate 3x3 choropleth: carencia alimentaria x sin agua entubada
//   V2 basin map: presion hidrica por cuenca (RHA CONAGUA) + overlay municipal
//   V3 scatter: agua x carencia, state filter (no statistical annotations)
//   V4 scatter: marginacion x entorno, neutral dots + quadrant labels
//   V5 map: the 83 triple-deficit municipalities vs everything else
// One state selector drives V1 zoom, V3 filter and the conditional
// municipality selector; the municipality selector drives highlights + profile.
//
// Bivariate palette: Joshua Stevens 3x3 (teal x purple), the de facto standard
// for bivariate choropleths (also used by Observable's reference example).
// Sequential teal ramp and accent colors validated with the dataviz six-checks.

const BIV = [
  "#e8e8e8", "#dfb0d6", "#be64ac",   // row 0: low water   | carencia ->
  "#ace4e4", "#a5add3", "#8c62aa",   // row 1: mid water
  "#5ac8c8", "#5698b9", "#3b4994"    // row 2: high water
];
const TEAL_RAMP = ["#74B8AE", "#3D9E92", "#177E71", "#0A5C54"];
const DEEP_RED  = "#7C1610", FAINT = "#E7EAE8";
const NODATA = "#F4F4F0", NAVY = "#1B365D", MUTED = "#718096", FADE = "#C9D3CE";

const fmt  = (v, d = 1) => v == null ? "s/d" :
  v.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });
const fpop = v => v == null ? "s/d" : v.toLocaleString("es-MX");

function terciles(vals) {
  const s = vals.filter(v => v != null).sort((a, b) => a - b);
  const q = p => s[Math.floor((s.length - 1) * p)];
  return [q(1 / 3), q(2 / 3)];
}
const tclass = (v, t) => v == null ? null : v <= t[0] ? 0 : v <= t[1] ? 1 : 2;

// Official CONAGUA pressure classes (EAM 2023): collapsed to 4 legend steps
const pressColor = p => p == null ? NODATA :
  p < 10 ? TEAL_RAMP[0] : p < 40 ? TEAL_RAMP[1] : p <= 100 ? TEAL_RAMP[2] : TEAL_RAMP[3];
const PRESS_LABELS = ["Sin estrés (menos de 10%)", "Bajo a medio (10 a 40%)",
                      "Alto (40 a 100%)", "Muy alto (más de 100%)"];

export function initMunicipal({ Plot, topojson, data, root }) {
  const { muni, municipios, estados, rha, comparison } = data;

  // ── joins ──────────────────────────────────────────────────────────────────
  const byCode = new Map(muni.map(d => [d.code, d]));
  const muniFC = topojson.feature(municipios, municipios.objects.municipios);
  muniFC.features.forEach(f => { f.properties.m = byCode.get(f.properties.id) ?? null; });

  const states = [...new Set(muni.map(d => d.state))].sort((a, b) => a.localeCompare(b, "es"));
  const munisOf = st => muni.filter(d => d.state === st)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // national cuts
  const T_CAR   = terciles(muni.map(d => d.carencia));
  const T_WATER = terciles(muni.map(d => d.water_no));
  const quart = (vals, p) => {
    const s = vals.filter(v => v != null).sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) * p)];
  };
  const Q75_WATER = quart(muni.map(d => d.water_no), 0.75);
  const MED_WATER = quart(muni.map(d => d.water_no), 0.5);
  const MED_CAR   = quart(muni.map(d => d.carencia), 0.5);
  const MED_MARG  = quart(muni.map(d => d.marg_score), 0.5);
  const MED_ENV   = quart(muni.map(d => d.food_env), 0.5);

  const bivColor = m => {
    if (!m) return NODATA;
    const cx = tclass(m.carencia, T_CAR), cy = tclass(m.water_no, T_WATER);
    return (cx == null || cy == null) ? NODATA : BIV[cy * 3 + cx];
  };

  // ── shared control state ───────────────────────────────────────────────────
  let selState = "", selMuni = "";
  const stateSel = root.querySelector("#sel-state");
  const muniSel  = root.querySelector("#sel-muni");

  stateSel.innerHTML = `<option value="">Todo el pais</option>` +
    states.map(s => `<option value="${s}">${s}</option>`).join("");
  muniSel.innerHTML = `<option value="">Elige un estado primero</option>`;
  muniSel.disabled = true;

  stateSel.addEventListener("change", () => {
    selState = stateSel.value; selMuni = "";
    if (selState) {
      muniSel.disabled = false;
      muniSel.innerHTML = `<option value="">Todos los municipios</option>` +
        munisOf(selState).map(d => `<option value="${d.code}">${d.name}</option>`).join("");
    } else {
      muniSel.disabled = true;
      muniSel.innerHTML = `<option value="">Elige un estado primero</option>`;
    }
    renderAll();
  });
  muniSel.addEventListener("change", () => { selMuni = muniSel.value; renderAll(); });

  // ── V0: state comparison beeswarm (raw values, neutral dots) ──────────────
  // comparison.json uses "México"; the municipal vocabulary uses
  // "Estado de México"
  const cmpName = s => s === "México" ? "Estado de México" : s;
  const PILLARS = ["Salud", "Sostenibilidad", "Medios de vida"];
  const cmpGroupsEl = root.querySelector("#cmp-groups");
  const cmpOpen = Object.fromEntries(PILLARS.map(p => [p, true]));

  function drawComparison() {
    if (!cmpGroupsEl || !comparison) return;
    const { indicators, states } = comparison;
    cmpGroupsEl.replaceChildren();

    const note = root.querySelector("#cmp-note");
    if (note) note.textContent = selState
      ? `${selState} resaltado en cada fila, con su valor encima del punto.`
      : "Elige un estado arriba para ver su posicion en cada indicador.";

    PILLARS.forEach(pillar => {
      const group = document.createElement("div");
      group.className = "cmp-group";
      const head = document.createElement("button");
      head.className = "cmp-group-head";
      head.innerHTML = `<span class="tg">${cmpOpen[pillar] ? "−" : "+"}</span>${pillar}`;
      const body = document.createElement("div");
      body.className = "cmp-group-body" + (cmpOpen[pillar] ? "" : " closed");
      head.addEventListener("click", () => {
        cmpOpen[pillar] = !cmpOpen[pillar];
        body.classList.toggle("closed", !cmpOpen[pillar]);
        head.querySelector(".tg").textContent = cmpOpen[pillar] ? "−" : "+";
      });
      group.appendChild(head);
      group.appendChild(body);
      cmpGroupsEl.appendChild(group);

      indicators.filter(i => i.pillar === pillar).forEach(ind => {
        const rows = states
          .map(s => ({ state: cmpName(s.state), raw: s[ind.key]?.raw,
                       rank: s[ind.key]?.rank }))
          .filter(d => d.raw != null);
        const meanV = rows.reduce((a, d) => a + d.raw, 0) / rows.length;
        const maxV  = Math.max(...rows.map(d => d.raw));
        const hl    = selState ? rows.find(d => d.state === selState) : null;

        const block = document.createElement("div");
        block.className = "cmp-block";
        block.innerHTML =
          `<div class="cmp-head">
             <span class="cmp-name">${ind.label}</span>
             <span class="cmp-def">${ind.def} <b>Fuente:</b> ${ind.source}</span>
           </div>`;
        const holder = document.createElement("div");
        block.appendChild(holder);
        body.appendChild(block);

        const width = Math.min(880, cmpGroupsEl.clientWidth || 880);
        holder.replaceChildren(Plot.plot({
          width, height: 96,
          marginLeft: 14, marginRight: 14, marginTop: 20, marginBottom: 24,
          style: { fontFamily: "Inter, sans-serif", fontSize: "10px" },
          x: { domain: [0, maxV * 1.08], label: null, ticks: 5,
               tickFormat: d => d + "%" },
          y: { axis: null },
          marks: [
            Plot.ruleX([meanV], { stroke: MUTED, strokeDasharray: "3,3" }),
            Plot.dot(rows, Plot.dodgeY("middle", {
              x: "raw", r: 5.5,
              fill: d => hl && d.state === selState ? "#0A5C54" : "#5A6B7B",
              fillOpacity: d => !selState ? 0.45
                : d.state === selState ? 0.95 : 0.22,
              stroke: d => hl && d.state === selState ? NAVY : "white",
              strokeWidth: d => hl && d.state === selState ? 2 : 0.8,
              tip: true,
              title: d => `${d.state}\n${ind.label}: ${fmt(d.raw)}%\nLugar ${d.rank} de 32`
            })),
            hl ? Plot.text([hl], {
              x: "raw", text: d => `${fmt(d.raw)}%`,
              frameAnchor: "top", dy: -2,
              fontWeight: 700, fontSize: 11, fill: NAVY,
              textAnchor: "middle"
            }) : null
          ].filter(Boolean)
        }));
      });
    });
  }

  // ── V1: bivariate choropleth ───────────────────────────────────────────────
  function bivLegend(el) {
    if (!el || el.childElementCount) return;
    const cell = 22, pad = 62;
    const svg = `
    <svg width="${3 * cell + pad + 10}" height="${3 * cell + 46}" style="overflow:visible">
      <g transform="translate(${pad},6)">
        ${[0, 1, 2].map(y => [0, 1, 2].map(x =>
          `<rect x="${x * cell}" y="${(2 - y) * cell}" width="${cell - 1.5}" height="${cell - 1.5}"
             fill="${BIV[y * 3 + x]}" rx="2"></rect>`).join("")).join("")}
        <text x="${1.5 * cell}" y="${3 * cell + 16}" text-anchor="middle"
          font-size="10" fill="#4B5A55">Más carencia alimentaria →</text>
        <text x="-10" y="${1.5 * cell}" text-anchor="middle" font-size="10" fill="#4B5A55"
          transform="rotate(-90 -10 ${1.5 * cell})">Más sin agua ↑</text>
      </g>
    </svg>`;
    el.innerHTML = svg;
  }

  function domainFC() {
    if (!selState) return muniFC;
    const feats = muniFC.features.filter(f => f.properties.m?.state === selState);
    return feats.length ? { type: "FeatureCollection", features: feats } : muniFC;
  }

  function drawBivMap() {
    const el = root.querySelector("#map-biv");
    if (!el) return;
    const dom = domainFC();
    const zoomed = !!selState;
    const width = Math.min(880, el.clientWidth || 880);
    el.replaceChildren(Plot.plot({
      width, height: zoomed ? 520 : 490,
      projection: { type: "mercator", domain: dom },
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      marks: [
        Plot.geo(dom, {
          fill: f => bivColor(f.properties.m),
          stroke: "white", strokeWidth: zoomed ? 0.5 : 0.15,
          tip: true,
          title: f => {
            const m = f.properties.m;
            if (!m) return f.properties.id;
            return `${m.name} (${m.state})\nCarencia alimentaria: ${fmt(m.carencia)}%\n` +
                   `Sin agua entubada: ${fmt(m.water_no)}%\nPoblacion: ${fpop(m.pop)}`;
          }
        }),
        zoomed ? null : Plot.geo(estados, { stroke: "#6B7B76", strokeWidth: 0.5, fill: "none" }),
        selMuni ? Plot.geo(
          { type: "FeatureCollection",
            features: dom.features.filter(f => f.properties.id === selMuni) },
          { stroke: NAVY, strokeWidth: 2.2, fill: "none" }) : null
      ].filter(Boolean)
    }));
    bivLegend(root.querySelector("#legend-biv"));
  }

  // ── profile card ───────────────────────────────────────────────────────────
  const profileEl = root.querySelector("#muni-profile");
  function drawProfile() {
    if (!selMuni) { profileEl.replaceChildren(); profileEl.classList.remove("show"); return; }
    const m = byCode.get(selMuni);
    if (!m) return;
    profileEl.classList.add("show");
    profileEl.innerHTML = `
      <div class="mp-name">${m.name} <span class="mp-state">${m.state}</span></div>
      <div class="mp-grid">
        <div><span class="mp-k">Poblacion</span><span class="mp-v">${fpop(m.pop)}</span></div>
        <div><span class="mp-k">Marginacion</span><span class="mp-v">${m.marg_grade ?? "s/d"}</span></div>
        <div><span class="mp-k">Carencia alimentaria</span><span class="mp-v">${fmt(m.carencia)}%</span></div>
        <div><span class="mp-k">Sin agua entubada</span><span class="mp-v">${fmt(m.water_no)}%</span></div>
        <div><span class="mp-k">Entorno saludable</span><span class="mp-v">${m.food_env == null ? "s/d" : fmt(m.food_env * 100)}%</span></div>
        <div><span class="mp-k">Carencias acumuladas</span><span class="mp-v">${m.excl} de 3</span></div>
      </div>`;
  }

  // ── V2: basins + municipal overlay ─────────────────────────────────────────
  function drawBasins() {
    const el = root.querySelector("#map-basins");
    if (!el) return;
    const width = Math.min(880, el.clientWidth || 880);
    const dryMunis = {
      type: "FeatureCollection",
      features: muniFC.features.filter(f => {
        const w = f.properties.m?.water_no;
        return w != null && w > Q75_WATER;
      })
    };
    el.replaceChildren(Plot.plot({
      width, height: 500,
      projection: { type: "mercator", domain: muniFC },
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      marks: [
        Plot.geo(rha, {
          fill: f => pressColor(f.properties.pressure),
          fillOpacity: 0.8,
          stroke: "white", strokeWidth: 1.8,
          tip: true,
          title: f => `Cuenca ${f.properties.clv}: ${f.properties.name}\n` +
                      `Presion hidrica: ${fmt(f.properties.pressure)}% (${f.properties.grade})`
        }),
        Plot.geo(dryMunis, {
          fill: DEEP_RED, fillOpacity: 0.85,
          stroke: "white", strokeWidth: 0.15,
          tip: true,
          title: f => {
            const m = f.properties.m;
            return `${m.name} (${m.state})\nSin agua entubada: ${fmt(m.water_no)}%`;
          }
        })
      ]
    }));
    const lg = root.querySelector("#legend-basins");
    if (lg && !lg.childElementCount) {
      PRESS_LABELS.forEach((t, i) => {
        const s = document.createElement("span");
        s.className = "legend-item";
        s.innerHTML = `<i style="background:${TEAL_RAMP[i]};opacity:.8"></i>${t}`;
        lg.appendChild(s);
      });
      const s = document.createElement("span");
      s.className = "legend-item";
      s.innerHTML = `<i style="background:${DEEP_RED}"></i>Municipios donde falta agua en las casas`;
      lg.appendChild(s);
    }
  }

  // ── V3: water x carencia scatter ───────────────────────────────────────────
  function drawWaterScatter() {
    const el = root.querySelector("#scatter-water");
    if (!el) return;
    const rows = muni.filter(d => d.water_no != null && d.carencia != null);
    const width = Math.min(880, el.clientWidth || 880);
    const inState = d => selState && d.state === selState;

    const note = root.querySelector("#scatter-water-note");
    if (note) note.textContent = !selState
      ? "Vista nacional: cada punto es un municipio. Selecciona un estado para ver el suyo."
      : `${selState}: ${rows.filter(inState).length} municipios resaltados sobre el fondo nacional.`;

    el.replaceChildren(Plot.plot({
      width, height: 460,
      marginLeft: 52, marginRight: 20, marginTop: 24, marginBottom: 46,
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      x: { label: "Viviendas sin agua entubada (%)", type: "sqrt",
           domain: [0, 85], ticks: [0, 1, 5, 10, 25, 50, 80] },
      y: { label: "Carencia alimentaria (%)", domain: [0, 75], grid: true },
      marks: [
        Plot.ruleX([MED_WATER], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.ruleY([MED_CAR], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.text([{ x: 70, y: 72, t: "Sin agua y con hambre" }],
          { x: "x", y: "y", text: "t", fill: DEEP_RED, fontSize: 10.5, fontWeight: 600 }),
        Plot.dot(rows.filter(d => !inState(d)), {
          x: "water_no", y: "carencia", r: 2.6,
          fill: selState ? FADE : "#3D9E92",
          fillOpacity: selState ? 0.35 : 0.45,
          stroke: "white", strokeWidth: 0.3,
          tip: !selState,
          title: d => `${d.name} (${d.state})\nSin agua: ${fmt(d.water_no)}%\nCarencia: ${fmt(d.carencia)}%`
        }),
        selState ? Plot.dot(rows.filter(inState), {
          x: "water_no", y: "carencia", r: 4.5,
          fill: "#0A5C54", stroke: "white", strokeWidth: 0.8, tip: true,
          title: d => `${d.name}\nSin agua: ${fmt(d.water_no)}%\nCarencia: ${fmt(d.carencia)}%\nPoblacion: ${fpop(d.pop)}`
        }) : null,
        selState ? Plot.linearRegressionY(rows.filter(inState), {
          x: "water_no", y: "carencia", stroke: "#0A5C54", strokeWidth: 1.5, ci: 0
        }) : null,
        selMuni ? Plot.dot(rows.filter(d => d.code === selMuni), {
          x: "water_no", y: "carencia", r: 8, fill: "none",
          stroke: NAVY, strokeWidth: 2.5
        }) : null,
        selMuni ? Plot.text(rows.filter(d => d.code === selMuni), {
          x: "water_no", y: "carencia", text: d => d.name,
          dy: -14, fontSize: 11.5, fontWeight: 700, fill: NAVY
        }) : null
      ].filter(Boolean)
    }));
  }

  // ── V4: marginacion x entorno, neutral dots + quadrant labels ─────────────
  function drawQuadScatter() {
    const el = root.querySelector("#scatter-quad");
    if (!el) return;
    const rows = muni.filter(d => d.marg_score != null && d.food_env != null);
    const width = Math.min(880, el.clientWidth || 880);
    const inState = d => selState && d.state === selState;

    const corners = [
      { x: 2,  y: 0.97, t: "Mejor entorno, menos rezago", a: "start",  c: MUTED },
      { x: 98, y: 0.97, t: "Rezago con comercio fresco",  a: "end",    c: MUTED },
      { x: 2,  y: 0.03, t: "Poco rezago, entorno pobre",  a: "start",  c: MUTED },
      { x: 98, y: 0.03, t: "Zonas criticas",              a: "end",    c: DEEP_RED }
    ];

    el.replaceChildren(Plot.plot({
      width, height: 460,
      marginLeft: 52, marginRight: 20, marginTop: 24, marginBottom: 46,
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      x: { label: "Marginacion (indice CONAPO 2020, 0 a 100)", domain: [0, 100] },
      y: { label: "Entorno alimentario saludable (%)", domain: [0, 1],
           tickFormat: d => (d * 100) + "%", grid: true },
      marks: [
        Plot.ruleX([MED_MARG], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.ruleY([MED_ENV], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.text(corners, { x: "x", y: "y", text: "t", textAnchor: d => d.a,
          fill: d => d.c, fontSize: 10.5, fontWeight: 600 }),
        Plot.dot(rows, {
          x: "marg_score", y: "food_env", r: d => inState(d) ? 4.5 : 2.6,
          fill: "#5A6B7B",
          fillOpacity: d => selState ? (inState(d) ? 0.9 : 0.12) : 0.4,
          stroke: "white", strokeWidth: 0.4, tip: true,
          title: d => `${d.name} (${d.state})\nMarginacion: ${fmt(d.marg_score)}\n` +
                      `Entorno saludable: ${fmt(d.food_env * 100)}%\nPoblacion: ${fpop(d.pop)}`
        }),
        selMuni ? Plot.dot(rows.filter(d => d.code === selMuni), {
          x: "marg_score", y: "food_env", r: 8, fill: "none",
          stroke: NAVY, strokeWidth: 2.5
        }) : null,
        selMuni ? Plot.text(rows.filter(d => d.code === selMuni), {
          x: "marg_score", y: "food_env", text: d => d.name,
          dy: -14, fontSize: 11.5, fontWeight: 700, fill: NAVY
        }) : null
      ].filter(Boolean)
    }));
  }

  // ── V5: the 83 municipalities ──────────────────────────────────────────────
  function drawExclMap() {
    const el = root.querySelector("#map-excl");
    if (!el) return;
    const width = Math.min(880, el.clientWidth || 880);
    el.replaceChildren(Plot.plot({
      width, height: 480,
      projection: { type: "mercator", domain: muniFC },
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      marks: [
        Plot.geo(muniFC, {
          fill: f => f.properties.m?.excl === 3 ? DEEP_RED : FAINT,
          stroke: "white", strokeWidth: 0.12,
          tip: true,
          title: f => {
            const m = f.properties.m;
            if (!m) return f.properties.id;
            return m.excl === 3
              ? `${m.name} (${m.state})\nLe falta todo: agua, alimentacion y comercio fresco\n` +
                `Sin agua: ${fmt(m.water_no)}% · Carencia: ${fmt(m.carencia)}%\nPoblacion: ${fpop(m.pop)}`
              : `${m.name} (${m.state})\nCarencias criticas: ${m.excl} de 3`;
          }
        }),
        Plot.geo(estados, { stroke: "#B9C4BF", strokeWidth: 0.5, fill: "none" })
      ]
    }));
    const strip = root.querySelector("#excl-stats");
    if (strip && !strip.childElementCount) {
      const tres = muni.filter(d => d.excl === 3);
      const pop = tres.reduce((a, d) => a + (d.pop || 0), 0);
      strip.innerHTML =
        `<div class="excl-stat"><span class="excl-num" style="color:${DEEP_RED}">83</span>` +
        `<span class="excl-lbl">municipios donde falta todo</span></div>` +
        `<div class="excl-stat"><span class="excl-num" style="color:${NAVY}">${(pop / 1e6).toLocaleString("es-MX", { maximumFractionDigits: 1 })} M</span>` +
        `<span class="excl-lbl">personas viven en ellos</span></div>` +
        `<div class="excl-stat"><span class="excl-num" style="color:${NAVY}">45</span>` +
        `<span class="excl-lbl">estan en Oaxaca; los mas poblados, en la sierra de Chihuahua, Durango y Nayarit</span></div>`;
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function renderAll() {
    drawComparison();
    drawBivMap();
    drawProfile();
    drawWaterScatter();
    drawQuadScatter();
  }
  renderAll();
  drawBasins();
  drawExclMap();
}
