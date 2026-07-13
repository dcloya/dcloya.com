// municipal_v3.js · Círculo Vivo chart engine (harmonized palette) for the municipal page.
// Adapted from municipal.js (same data, same views) with:
//  - hero stat counters, scrollspy section nav, sticky municipio chip
//  - interactive bivariate legend (hover isolates a combination)
//  - named list of the triple-deficit municipios (click to select)
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

// Paleta Círculo Vivo (tokens Figma "Colores"):
// Equilibrio #708B8D · Transformación #395284 · Origen #BCB884
// Ciclo #D1C6CF · Proceso #DED4B0 · Regeneración #C3D2D9 · Impacto #561427
const PIZARRA = "#708B8D", COBALT = "#395284", OLIVE = "#BCB884";
const GRIS_BG = "#E9E6DD", GRIS_DOT = "#D1C6CF";
const BIV = [
  "#E9E6DD", "#919CB0", "#395284",
  "#D2CFB0", "#828B8A", "#314664",
  "#BCB884", "#737964", "#2A3B44"
];
const PRESS_RAMP = ["#708B8D", "#5E788A", "#4B6587", "#395284"];
const NODATA = "#FAF8F5", FADE = "#EFECE4", INK = "#1C1C18", MUTED = "#6B7280";
const PRESS_LABELS = ["Sin estrés (menos de 10%)", "Bajo a medio (10 a 40%)",
                      "Alto (40 a 100%)", "Muy alto (más de 100%)"];

const fmt  = (v, d = 1) => v == null ? "s/d" :
  v.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: d });
const fpop = v => v == null ? "s/d" : v.toLocaleString("es-MX");

function terciles(vals) {
  const s = vals.filter(v => v != null).sort((a, b) => a - b);
  const q = p => s[Math.floor((s.length - 1) * p)];
  return [q(1 / 3), q(2 / 3)];
}
const tclass = (v, t) => v == null ? null : v <= t[0] ? 0 : v <= t[1] ? 1 : 2;
const pressColor = p => p == null ? NODATA :
  p < 10 ? PRESS_RAMP[0] : p < 40 ? PRESS_RAMP[1] : p <= 100 ? PRESS_RAMP[2] : PRESS_RAMP[3];

export async function initMunicipalV3({ root = document, named = 12, animate = true } = {}) {
  if (window.__muniV3Started) { console.log("[muniV3] already initialized, skipping"); return; }
  window.__muniV3Started = true;
  console.log("[muniV3] fetching data\u2026");
  const base = new URL("../data/", import.meta.url);
  const j = f => fetch(new URL(f, base)).then(r => r.json());
  const [muni, municipios, estados, rha, comparison] = await Promise.all([
    j("muni_master.json"), j("municipios.topojson"), j("estados.geojson"),
    j("rha.geojson"), j("comparison.json")
  ]);

  console.log("[muniV3] data loaded:", muni.length, "municipios");
  root.querySelectorAll("[data-loading]").forEach(e => e.remove());

  // ── joins & national cuts ──────────────────────────────────────────────────
  const byCode = new Map(muni.map(d => [d.code, d]));
  const muniFC = topojson.feature(municipios, municipios.objects.municipios);
  muniFC.features.forEach(f => { f.properties.m = byCode.get(f.properties.id) ?? null; });

  const states = [...new Set(muni.map(d => d.state))].sort((a, b) => a.localeCompare(b, "es"));
  const munisOf = st => muni.filter(d => d.state === st)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

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

  const tres = muni.filter(d => d.excl === 3);
  const tresPop = tres.reduce((a, d) => a + (d.pop || 0), 0);

  let bivFilter = null; // [cx, cy] or null — set by legend hover
  const bivColor = m => {
    if (!m) return NODATA;
    const cx = tclass(m.carencia, T_CAR), cy = tclass(m.water_no, T_WATER);
    if (cx == null || cy == null) return NODATA;
    if (bivFilter && (bivFilter[0] !== cx || bivFilter[1] !== cy)) return FADE;
    return BIV[cy * 3 + cx];
  };

  // ── hero counters ──────────────────────────────────────────────────────────
  function countUp(el, target, format, dur = 1400) {
    if (!el) return;
    if (!animate) { el.textContent = format(target); return; }
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(target * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  countUp(root.querySelector("#stat-n1"), muni.length, v => Math.round(v).toLocaleString("es-MX"));
  countUp(root.querySelector("#stat-n2"), tres.length, v => Math.round(v).toString());
  countUp(root.querySelector("#stat-n3"), tresPop / 1e6,
    v => v.toLocaleString("es-MX", { maximumFractionDigits: 1 }) + " M");

  // ── section nav (scrollspy) ────────────────────────────────────────────────
  const SECTIONS = [
    ["v0", "Estados"], ["v1", "El mapa"], ["v2", "Cuencas"],
    ["v3", "Focalización"], ["v4", "Entorno"], ["v5", "Los 83"]
  ];
  const nav = root.querySelector("#secnav");
  const navLinks = new Map();
  if (nav) {
    SECTIONS.forEach(([id, label]) => {
      const a = document.createElement("a");
      a.href = "#" + id;
      a.textContent = label;
      a.style.cssText = "font:600 11.5px/1 Inter,sans-serif;letter-spacing:.02em;" +
        "color:#718096;text-decoration:none;padding:6px 10px;border-radius:14px;white-space:nowrap;transition:all .15s";
      a.addEventListener("click", e => {
        e.preventDefault();
        const t = root.querySelector("#" + id);
        if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 62, behavior: "smooth" });
      });
      nav.appendChild(a);
      navLinks.set(id, a);
    });
    const setActive = id => navLinks.forEach((a, k) => {
      const on = k === id;
      a.style.background = on ? COBALT : "transparent";
      a.style.color = on ? "#fff" : MUTED;
    });
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    SECTIONS.forEach(([id]) => { const s = root.querySelector("#" + id); if (s) io.observe(s); });
  }

  // ── shared control state ───────────────────────────────────────────────────
  let selState = "", selMuni = "";
  const stateSel = root.querySelector("#sel-state");
  const muniSel  = root.querySelector("#sel-muni");

  stateSel.innerHTML = `<option value="">Todo el país</option>` +
    states.map(s => `<option value="${s}">${s}</option>`).join("");
  muniSel.innerHTML = `<option value="">Elige un estado primero</option>`;
  muniSel.disabled = true;

  function setStateVal(st) {
    selState = st; selMuni = "";
    stateSel.value = st;
    if (st) {
      muniSel.disabled = false;
      muniSel.innerHTML = `<option value="">Todos los municipios</option>` +
        munisOf(st).map(d => `<option value="${d.code}">${d.name}</option>`).join("");
    } else {
      muniSel.disabled = true;
      muniSel.innerHTML = `<option value="">Elige un estado primero</option>`;
    }
  }
  stateSel.addEventListener("change", () => { setStateVal(stateSel.value); renderAll(); });
  muniSel.addEventListener("change", () => { selMuni = muniSel.value; renderAll(); });

  // sticky chip: compact profile that follows you down the page
  const chip = root.querySelector("#mp-chip");
  function drawChip() {
    if (!chip) return;
    if (!selMuni) { chip.style.display = "none"; chip.innerHTML = ""; return; }
    const m = byCode.get(selMuni);
    if (!m) return;
    chip.style.display = "inline-flex";
    chip.innerHTML =
      `<b style="color:${COBALT};font-weight:700">${m.name}</b>` +
      `<span style="color:${MUTED}">· ${fpop(m.pop)} hab.</span>` +
      `<span style="color:${MUTED}">· carencia ${fmt(m.carencia)}%</span>` +
      `<span style="color:${MUTED}">· sin agua ${fmt(m.water_no)}%</span>` +
      `<span style="background:${m.excl >= 2 ? COBALT : PIZARRA};color:#fff;border-radius:10px;` +
      `padding:1px 8px;font-weight:700">${m.excl} de 3 carencias</span>`;
  }

  // ── V0: state comparison ───────────────────────────────────────────────────
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
      ? `${selState}, resaltado en cada fila con su valor encima del punto; ` +
        `en azul cuando está entre los ocho lugares más altos del país.`
      : "Elige un estado arriba para ver su posición en cada indicador.";

    PILLARS.forEach(pillar => {
      const group = document.createElement("div");
      group.style.marginBottom = "16px";
      const head = document.createElement("button");
      head.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;background:none;" +
        "border:none;border-bottom:2px solid #D6D9D8;padding:8px 2px;cursor:pointer;text-align:left;" +
        "font:700 13px/1.2 Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#54706A";
      head.innerHTML = `<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border:1.5px solid #54706A;border-radius:50%;font-size:13px;font-weight:600">${cmpOpen[pillar] ? "−" : "+"}</span>${pillar}`;
      const body = document.createElement("div");
      body.style.cssText = "display:flex;flex-direction:column;gap:8px;padding-top:8px";
      body.style.display = cmpOpen[pillar] ? "flex" : "none";
      head.addEventListener("click", () => {
        cmpOpen[pillar] = !cmpOpen[pillar];
        body.style.display = cmpOpen[pillar] ? "flex" : "none";
        head.querySelector("span").textContent = cmpOpen[pillar] ? "−" : "+";
      });
      group.appendChild(head); group.appendChild(body);
      cmpGroupsEl.appendChild(group);

      indicators.filter(i => i.pillar === pillar).forEach(ind => {
        const rows = states
          .map(s => ({ state: cmpName(s.state), raw: s[ind.key]?.raw, rank: s[ind.key]?.rank }))
          .filter(d => d.raw != null);
        const meanV = rows.reduce((a, d) => a + d.raw, 0) / rows.length;
        const maxV  = Math.max(...rows.map(d => d.raw));
        const hl    = selState ? rows.find(d => d.state === selState) : null;
        const hlColor = hl && hl.rank != null && hl.rank <= 8 ? COBALT : PIZARRA;

        const block = document.createElement("div");
        block.style.cssText = "background:#fff;border:1px solid #D6D9D8;border-radius:8px;" +
          "box-shadow:0 1px 3px rgba(0,0,0,.07);padding:12px 16px 6px";
        block.innerHTML =
          `<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:2px">
             <span style="font-size:14px;font-weight:700;color:${COBALT}">${ind.label}</span>
             <span style="font-size:11px;color:${MUTED};line-height:1.4">${ind.def} <b style="color:${INK}">Fuente:</b> ${ind.source}</span>
           </div>`;
        const holder = document.createElement("div");
        block.appendChild(holder);
        body.appendChild(block);

        const width = Math.min(880, cmpGroupsEl.clientWidth || 880);
        holder.replaceChildren(Plot.plot({
          width, height: 96,
          marginLeft: 14, marginRight: 14, marginTop: 20, marginBottom: 24,
          style: { fontFamily: "Inter, sans-serif", fontSize: "10px" },
          x: { domain: [0, maxV * 1.08], label: null, ticks: 5, tickFormat: d => d + "%" },
          y: { axis: null },
          marks: [
            Plot.ruleX([meanV], { stroke: MUTED, strokeDasharray: "3,3" }),
            Plot.dot(rows, Plot.dodgeY("middle", {
              x: "raw", r: 5.5,
              fill: d => hl && d.state === selState ? hlColor : GRIS_DOT,
              fillOpacity: d => !selState ? 0.9 : d.state === selState ? 1 : 0.55,
              stroke: d => hl && d.state === selState ? INK : "white",
              strokeWidth: d => hl && d.state === selState ? 1.5 : 0.8,
              tip: true,
              title: d => `${d.state}\n${ind.label}: ${fmt(d.raw)}%\nLugar ${d.rank} de 32`
            })),
            hl ? Plot.text([hl], {
              x: "raw", text: d => `${fmt(d.raw)}%`,
              frameAnchor: "top", dy: -2, fontWeight: 700, fontSize: 11,
              fill: INK, textAnchor: "middle"
            }) : null
          ].filter(Boolean)
        }));
      });
    });
  }

  // ── V1: bivariate choropleth + interactive legend ──────────────────────────
  function bivLegend(el) {
    if (!el || el.childElementCount) return;
    const cell = 26, pad = 66;
    el.innerHTML = `
    <svg width="${3 * cell + pad + 10}" height="${3 * cell + 48}" style="overflow:visible">
      <g transform="translate(${pad},6)">
        ${[0, 1, 2].map(y => [0, 1, 2].map(x =>
          `<rect data-cx="${x}" data-cy="${y}" x="${x * cell}" y="${(2 - y) * cell}"
             width="${cell - 1.5}" height="${cell - 1.5}" fill="${BIV[y * 3 + x]}" rx="2"
             style="cursor:pointer"></rect>`).join("")).join("")}
        <text x="${1.5 * cell}" y="${3 * cell + 16}" text-anchor="middle"
          font-size="10" fill="#4B5A55">Más carencia alimentaria →</text>
        <text x="-10" y="${1.5 * cell}" text-anchor="middle" font-size="10" fill="#4B5A55"
          transform="rotate(-90 -10 ${1.5 * cell})">Más sin agua ↑</text>
      </g>
    </svg>`;
    el.querySelectorAll("rect").forEach(r => {
      r.addEventListener("mouseenter", () => {
        bivFilter = [+r.dataset.cx, +r.dataset.cy];
        r.setAttribute("stroke", INK); r.setAttribute("stroke-width", "2");
        drawBivMap(true);
        const n = root.querySelector("#biv-count");
        if (n) {
          const cnt = muni.filter(m =>
            tclass(m.carencia, T_CAR) === bivFilter[0] &&
            tclass(m.water_no, T_WATER) === bivFilter[1]).length;
          n.textContent = `${cnt} municipios en esta combinación`;
        }
      });
      r.addEventListener("mouseleave", () => {
        bivFilter = null;
        r.removeAttribute("stroke");
        drawBivMap(true);
        const n = root.querySelector("#biv-count");
        if (n) n.textContent = "Pasa el cursor por la leyenda para aislar cada combinación.";
      });
    });
  }

  function domainFC() {
    if (!selState) return muniFC;
    const feats = muniFC.features.filter(f => f.properties.m?.state === selState);
    return feats.length ? { type: "FeatureCollection", features: feats } : muniFC;
  }

  function drawBivMap(keepLegend) {
    const el = root.querySelector("#map-biv");
    if (!el) return;
    const dom = domainFC();
    const zoomed = !!selState;
    const width = Math.min(920, el.clientWidth || 920);
    el.replaceChildren(Plot.plot({
      width, height: zoomed ? 520 : 500,
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
                   `Sin agua entubada: ${fmt(m.water_no)}%\nPoblación: ${fpop(m.pop)}`;
          }
        }),
        zoomed ? null : Plot.geo(estados, { stroke: "#6B7B76", strokeWidth: 0.5, fill: "none" }),
        selMuni ? Plot.geo(
          { type: "FeatureCollection",
            features: dom.features.filter(f => f.properties.id === selMuni) },
          { stroke: INK, strokeWidth: 2.2, fill: "none" }) : null
      ].filter(Boolean)
    }));
    if (!keepLegend) bivLegend(root.querySelector("#legend-biv"));
  }

  // profile card near the map
  const profileEl = root.querySelector("#muni-profile");
  function drawProfile() {
    if (!profileEl) return;
    if (!selMuni) { profileEl.style.display = "none"; profileEl.innerHTML = ""; return; }
    const m = byCode.get(selMuni);
    if (!m) return;
    profileEl.style.display = "block";
    const cell = (k, v) => `<div style="display:flex;flex-direction:column">
      <span style="font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:${MUTED}">${k}</span>
      <span style="font-size:15px;font-weight:600;color:${INK}">${v}</span></div>`;
    profileEl.innerHTML = `
      <div style="font-weight:700;font-size:16px;color:${COBALT};margin-bottom:10px">
        ${m.name} <span style="font-weight:400;color:${MUTED};font-size:13px;margin-left:6px">${m.state}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 20px">
        ${cell("Población", fpop(m.pop))}
        ${cell("Marginación", m.marg_grade ?? "s/d")}
        ${cell("Carencia alimentaria", fmt(m.carencia) + "%")}
        ${cell("Sin agua entubada", fmt(m.water_no) + "%")}
        ${cell("Entorno saludable", m.food_env == null ? "s/d" : fmt(m.food_env * 100) + "%")}
        ${cell("Carencias acumuladas", m.excl + " de 3")}
      </div>`;
  }

  // ── V2: basins ─────────────────────────────────────────────────────────────
  function drawBasins() {
    const el = root.querySelector("#map-basins");
    if (!el) return;
    const width = Math.min(920, el.clientWidth || 920);
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
          fill: f => pressColor(f.properties.pressure), fillOpacity: 0.8,
          stroke: "white", strokeWidth: 1.8, tip: true,
          title: f => `Cuenca ${f.properties.clv}: ${f.properties.name}\n` +
                      `Presión hídrica: ${fmt(f.properties.pressure)}% (${f.properties.grade})`
        }),
        Plot.geo(dryMunis, {
          fill: COBALT, fillOpacity: 0.9, stroke: "white", strokeWidth: 0.15, tip: true,
          title: f => {
            const m = f.properties.m;
            return `${m.name} (${m.state})\nSin agua entubada: ${fmt(m.water_no)}%`;
          }
        })
      ]
    }));
    const lg = root.querySelector("#legend-basins");
    if (lg && !lg.childElementCount) {
      const item = (color, t, op) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${INK}">
          <i style="width:13px;height:13px;border-radius:3px;display:inline-block;background:${color};opacity:${op}"></i>${t}</span>`;
      lg.innerHTML = PRESS_LABELS.map((t, i) => item(PRESS_RAMP[i], t, ".8")).join("") +
        item(COBALT, "Municipios donde falta agua en las casas", "1");
    }
  }

  // ── V3: water × carencia scatter ───────────────────────────────────────────
  function drawWaterScatter() {
    const el = root.querySelector("#scatter-water");
    if (!el) return;
    const rows = muni.filter(d => d.water_no != null && d.carencia != null);
    const width = Math.min(920, el.clientWidth || 920);
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
          { x: "x", y: "y", text: "t", fill: COBALT, fontSize: 10.5, fontWeight: 600 }),
        Plot.dot(rows.filter(d => !inState(d)), {
          x: "water_no", y: "carencia", r: 2.6,
          fill: selState ? GRIS_DOT : PIZARRA,
          fillOpacity: selState ? 0.35 : 0.4,
          stroke: "white", strokeWidth: 0.3, tip: !selState,
          title: d => `${d.name} (${d.state})\nSin agua: ${fmt(d.water_no)}%\nCarencia: ${fmt(d.carencia)}%`
        }),
        selState ? Plot.dot(rows.filter(inState), {
          x: "water_no", y: "carencia", r: 4.5,
          fill: COBALT, stroke: "white", strokeWidth: 0.8, tip: true,
          title: d => `${d.name}\nSin agua: ${fmt(d.water_no)}%\nCarencia: ${fmt(d.carencia)}%\nPoblación: ${fpop(d.pop)}`
        }) : null,
        selState ? Plot.linearRegressionY(rows.filter(inState), {
          x: "water_no", y: "carencia", stroke: COBALT, strokeWidth: 1.5, ci: 0
        }) : null,
        selMuni ? Plot.dot(rows.filter(d => d.code === selMuni), {
          x: "water_no", y: "carencia", r: 8, fill: "none", stroke: INK, strokeWidth: 2.5
        }) : null,
        selMuni ? Plot.text(rows.filter(d => d.code === selMuni), {
          x: "water_no", y: "carencia", text: d => d.name,
          dy: -14, fontSize: 11.5, fontWeight: 700, fill: INK
        }) : null
      ].filter(Boolean)
    }));
  }

  // ── V4: marginación × entorno ──────────────────────────────────────────────
  function drawQuadScatter() {
    const el = root.querySelector("#scatter-quad");
    if (!el) return;
    const rows = muni.filter(d => d.marg_score != null && d.food_env != null);
    const width = Math.min(920, el.clientWidth || 920);
    const inState = d => selState && d.state === selState;
    const corners = [
      { x: 2,  y: 0.97, t: "Mejor entorno, menos rezago", a: "start", c: MUTED },
      { x: 98, y: 0.97, t: "Rezago con comercio fresco",  a: "end",   c: MUTED },
      { x: 2,  y: 0.03, t: "Poco rezago, entorno pobre",  a: "start", c: MUTED },
      { x: 98, y: 0.03, t: "Zonas críticas",              a: "end",   c: COBALT }
    ];
    el.replaceChildren(Plot.plot({
      width, height: 460,
      marginLeft: 52, marginRight: 20, marginTop: 24, marginBottom: 46,
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      x: { label: "Marginación (índice CONAPO 2020, 0 a 100)", domain: [0, 100] },
      y: { label: "Entorno alimentario saludable (%)", domain: [0, 1],
           tickFormat: d => (d * 100) + "%", grid: true },
      marks: [
        Plot.ruleX([MED_MARG], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.ruleY([MED_ENV], { stroke: MUTED, strokeDasharray: "4,3" }),
        Plot.text(corners, { x: "x", y: "y", text: "t", textAnchor: d => d.a,
          fill: d => d.c, fontSize: 10.5, fontWeight: 600 }),
        Plot.dot(rows, {
          x: "marg_score", y: "food_env", r: d => inState(d) ? 4.5 : 2.6,
          fill: d => inState(d) ? COBALT : PIZARRA,
          fillOpacity: d => selState ? (inState(d) ? 0.9 : 0.12) : 0.4,
          stroke: "white", strokeWidth: 0.4, tip: true,
          title: d => `${d.name} (${d.state})\nMarginación: ${fmt(d.marg_score)}\n` +
                      `Entorno saludable: ${fmt(d.food_env * 100)}%\nPoblación: ${fpop(d.pop)}`
        }),
        selMuni ? Plot.dot(rows.filter(d => d.code === selMuni), {
          x: "marg_score", y: "food_env", r: 8, fill: "none", stroke: INK, strokeWidth: 2.5
        }) : null,
        selMuni ? Plot.text(rows.filter(d => d.code === selMuni), {
          x: "marg_score", y: "food_env", text: d => d.name,
          dy: -14, fontSize: 11.5, fontWeight: 700, fill: INK
        }) : null
      ].filter(Boolean)
    }));
  }

  // ── V5: the 83 — map, stats and named list ─────────────────────────────────
  function drawExclMap() {
    const el = root.querySelector("#map-excl");
    if (!el) return;
    const width = Math.min(920, el.clientWidth || 920);
    el.replaceChildren(Plot.plot({
      width, height: 480,
      projection: { type: "mercator", domain: muniFC },
      style: { fontFamily: "Inter, sans-serif", fontSize: "11px" },
      marks: [
        Plot.geo(muniFC, {
          fill: f => f.properties.m?.excl === 3 ? COBALT : GRIS_BG,
          stroke: "white", strokeWidth: 0.12, tip: true,
          title: f => {
            const m = f.properties.m;
            if (!m) return f.properties.id;
            return m.excl === 3
              ? `${m.name} (${m.state})\nLe falta todo: agua, alimentación y comercio fresco\n` +
                `Sin agua: ${fmt(m.water_no)}% · Carencia: ${fmt(m.carencia)}%\nPoblación: ${fpop(m.pop)}`
              : `${m.name} (${m.state})\nCarencias críticas: ${m.excl} de 3`;
          }
        }),
        Plot.geo(estados, { stroke: "#C2C5C4", strokeWidth: 0.5, fill: "none" })
      ]
    }));

    const strip = root.querySelector("#excl-stats");
    if (strip && !strip.childElementCount) {
      const oax = tres.filter(d => d.state === "Oaxaca").length;
      const stat = (num, lbl, color) =>
        `<div style="display:flex;flex-direction:column;max-width:300px">
          <span style="font-family:'Playfair Display',serif;font-size:46px;font-weight:700;line-height:1;color:${color}">${num}</span>
          <span style="font-size:12.5px;color:rgba(255,255,255,.75);line-height:1.4;margin-top:6px">${lbl}</span></div>`;
      strip.innerHTML =
        stat(tres.length, "municipios donde falta todo", OLIVE) +
        stat((tresPop / 1e6).toLocaleString("es-MX", { maximumFractionDigits: 1 }) + " M",
          "personas viven en ellos", "#fff") +
        stat(oax, "están en Oaxaca; los más poblados, en la sierra de Chihuahua, Durango y Nayarit", "#fff");
    }

    // named list — the municipios get names, not just dots
    const list = root.querySelector("#excl-names");
    if (list && !list.childElementCount) {
      const top = [...tres].sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, named);
      const maxPop = top[0]?.pop || 1;
      top.forEach(m => {
        const row = document.createElement("button");
        row.style.cssText = "display:grid;grid-template-columns:220px 1fr 90px;align-items:center;gap:14px;" +
          "width:100%;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.12);" +
          "padding:9px 6px;cursor:pointer;text-align:left;font-family:Inter,sans-serif;transition:background .15s";
        row.innerHTML =
          `<span style="font-size:13.5px;color:#fff;font-weight:600;line-height:1.25">${m.name}
             <span style="display:block;font-size:10.5px;font-weight:400;color:rgba(255,255,255,.55)">${m.state}</span></span>
           <span style="display:block;height:10px;border-radius:5px;background:rgba(255,255,255,.10);overflow:hidden">
             <span style="display:block;height:100%;width:${Math.max(2, (m.pop || 0) / maxPop * 100)}%;background:${OLIVE};border-radius:5px"></span></span>
           <span style="font-size:12.5px;color:rgba(255,255,255,.85);text-align:right;font-variant-numeric:tabular-nums">${fpop(m.pop)}</span>`;
        row.addEventListener("mouseenter", () => row.style.background = "rgba(255,255,255,.06)");
        row.addEventListener("mouseleave", () => row.style.background = "transparent");
        row.addEventListener("click", () => {
          setStateVal(m.state); selMuni = m.code; muniSel.value = m.code;
          renderAll();
          const t = root.querySelector("#v1");
          if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 62, behavior: "smooth" });
        });
        list.appendChild(row);
      });
      const rest = document.createElement("div");
      rest.style.cssText = "font-size:12px;color:rgba(255,255,255,.6);padding:12px 6px 0;font-style:italic";
      rest.textContent = `…y ${tres.length - top.length} municipios más, la mayoría pequeños, en la sierra de Oaxaca. ` +
        "Toca un nombre para verlo en el mapa.";
      list.appendChild(rest);
    }
  }

  // ── render: lazy per-section drawing ───────────────────────────────────────
  // Heavy views (full-country geo + 2,469-point scatters) draw only when their
  // section approaches the viewport, so the initial load stays responsive.
  const drawn = { v0: false, v1: false, v2: false, v3: false, v4: false, v5: false };
  const drawFns = {
    v0: drawComparison,
    v1: () => { drawBivMap(); drawProfile(); },
    v2: drawBasins,
    v3: drawWaterScatter,
    v4: drawQuadScatter,
    v5: drawExclMap
  };
  function drawSection(id) {
    console.log("[muniV3] drawing", id, "\u2026");
    try { drawFns[id](); } catch (err) { console.error("[muniV3] draw failed:", id, err); }
    console.log("[muniV3] drew", id);
  }
  // serialized draw queue: one heavy draw per macrotask, always yielding to the
  // event loop between draws so the page never blocks even if all six sections
  // intersect at once in a fresh viewport.
  const queue = [];
  let pumping = false;
  function pump() {
    if (pumping) return;
    pumping = true;
    const next = () => {
      const id = queue.shift();
      if (id == null) { pumping = false; return; }
      drawSection(id);
      setTimeout(next, 40);
    };
    setTimeout(next, 16);
  }
  const lazyIO = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting && !drawn[e.target.id]) {
        drawn[e.target.id] = true;
        lazyIO.unobserve(e.target);
        queue.push(e.target.id);
        pump();
      }
    });
  }, { rootMargin: "200px 0px" });
  Object.keys(drawFns).forEach(id => {
    const s = root.querySelector("#" + id);
    if (s) lazyIO.observe(s);
  });

  function renderAll() {
    drawChip();
    if (drawn.v0) drawComparison();
    if (drawn.v1) { drawBivMap(); drawProfile(); }
    if (drawn.v3) drawWaterScatter();
    if (drawn.v4) drawQuadScatter();
  }
  console.log("[muniV3] init complete \u2014 sections will draw on approach");
}
