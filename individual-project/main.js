"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const captions = [
    "The standard view preserves a mass axis, but the many merger arrows compete with individual measurements.",
    "Circle pack: spatial packing emphasizes the collection, but nearby marks do not share a calibrated mass axis.",
    "Circle links: the circular arrangement invites exploration but makes exact mass comparisons difficult.",
    "Nodes: many crossing relationships compete with the objects they connect."
  ];
  const descriptions = [
    "Original standard view: colored compact-object masses on a logarithmic vertical axis, with many arrows joining merger components to remnants.",
    "Original circle-pack view: densely packed colored objects with several extended links, without a common mass axis.",
    "Original circle-links view: objects arranged in a dense circular cloud, dominated by blue marks.",
    "Original Nodes view: a dense network of crossing colored links between compact objects and GW and EM categories."
  ];
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      const i = Number(button.dataset.view) - 1;
      $("original-image").src = "original-viz-view" + (i + 1) + ".png";
      $("original-image-link").href = $("original-image").src;
      $("original-image").alt = descriptions[i];
      $("original-caption").textContent = captions[i];
      document.querySelectorAll("[data-view]").forEach(b => {
        b.classList.toggle("active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
    });
  });

  const groups = [
    {key: "remnant", label: "GW · remnant", sub: "Estimates & flagged values", shape: "diamond"},
    {key: "primary", label: "GW · primary", sub: "Heavier component", shape: "circle"},
    {key: "secondary", label: "GW · secondary", sub: "Lighter component", shape: "open"},
    {key: "em_bh", label: "EM · black hole", sub: "Original classification", shape: "circle"},
    {key: "em_ns", label: "EM · neutron star", sub: "Original classification", shape: "circle"}
  ];
  const groupMap = new Map(groups.map(g => [g.key, g]));
  const state = {data: [], visible: [], selected: "GW150914", page: 0, pageSize: 10};
  const layoutCache = new Map();
  const fmt = (n) => n == null ? "Not reported" : Number(n.toFixed(4)).toLocaleString("en-US", {maximumFractionDigits: 4});
  const flaggedRemnant = d => d.role === "remnant" && ["no_interval", "total_mass_proxy"].includes(d.mass_status);
  const interval = d => d.low != null && d.high != null ? fmt(d.low) + "–" + fmt(d.high) : "Not reported";
  // Exact palette from the original plot's params.js.
  const palette = {GWBH: "#00BFFF", GWNS: "#d78122", EMBH: "#D81B60", EMNS: "#dbed9f"};
  const color = d => palette[d.method + d.display_type];
  const typeLabel = d => (d.display_type === "BH" ? "Black hole" : "Neutron star") +
    (d.type_ambiguous ? " color category; physical type uncertain" : d.method === "GW" ? " color category" : "");
  // The pale original EM neutron-star color needs an outline on a light canvas.
  const outline = d => d.method === "EM" && d.display_type === "NS" ? "#65734c" : color(d);
  const label = d => groupMap.get(d.group).label + (d.mass_status === "total_mass_proxy" ? " (total-mass proxy)" : d.mass_status === "no_interval" ? " (no interval)" : "");
  const normalize = s => s.toLowerCase().replace(/[−–—]/g, "-").trim();
  const tooltip = $("tooltip");

  function showError(error) {
    $("load-error").hidden = false;
    $("load-error").textContent = "The atlas could not load. Serve this folder over HTTP (for example, run python -m http.server 8000 from the project root), then open /individual-project/. The analysis and data download remain available.";
    $("result-count").textContent = "Data unavailable";
    console.error(error);
  }

  function symbol(d, size = 40) {
    const diamond = groupMap.get(d.group).shape === "diamond";
    return d3.symbol().type(diamond ? d3.symbolDiamond : d3.symbolCircle).size(diamond ? size * 0.6 : size)();
  }

  function setMark(selection, size = 40) {
    selection.attr("d", d => symbol(d, size))
      .attr("fill", d => (groupMap.get(d.group).shape === "open" || flaggedRemnant(d)) ? "#fff" : color(d))
      .attr("stroke", outline).attr("stroke-width", 1.4);
    return selection;
  }

  function currentDomain() {
    return [$("scale").value === "log" ? 0.8 : 0, $("range").value === "low" ? 5 : 200];
  }

  // Greedy circle separation preserves each exact x value. Ties break by ID.
  // Pack the complete range before filtering/search, so surviving marks stay put.
  function getLayout(width) {
    const cacheKey = [width, $("scale").value, $("range").value].join(":");
    if (layoutCache.has(cacheKey)) return layoutCache.get(cacheKey);
    const domain = currentDomain();
    const x = ($("scale").value === "log" ? d3.scaleLog() : d3.scaleLinear())
      .domain(domain).range([177, width - 34]);
    const positions = new Map();
    const lanes = [];
    let top = 51;
    for (const group of groups) {
      const points = state.data.filter(d => d.group === group.key && d.mass >= domain[0] && d.mass <= domain[1])
        .sort((a, b) => a.mass - b.mass || a.id.localeCompare(b.id));
      const placed = [];
      let extent = 0;
      for (const d of points) {
        const px = x(d.mass);
        const neighbors = placed.filter(p => Math.abs(p.x - px) < 10);
        let dy = 0;
        for (let step = 0; ; step++) {
          dy = step === 0 ? 0 : Math.ceil(step / 2) * 10 * (step % 2 ? 1 : -1);
          if (neighbors.every(p => Math.hypot(p.x - px, p.dy - dy) >= 10)) break;
        }
        placed.push({id: d.id, x: px, dy});
        extent = Math.max(extent, Math.abs(dy));
      }
      const height = Math.max(78, extent * 2 + 28);
      const center = top + height / 2;
      placed.forEach(p => positions.set(p.id, {x: p.x, y: center + p.dy}));
      lanes.push({...group, top, height, center});
      top += height;
    }
    const result = {x, positions, lanes, bottom: top, height: top + 65, width};
    layoutCache.set(cacheKey, result);
    return result;
  }

  function showTooltip(event, d) {
    tooltip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = d.name;
    const value = document.createElement("div");
    value.textContent = label(d) + " · " + fmt(d.mass) + " M☉";
    const objectType = document.createElement("span");
    objectType.textContent = typeLabel(d);
    const bounds = document.createElement("span");
    bounds.textContent = "Reported interval: " + interval(d) + (d.low != null && d.high != null ? " M☉" : "");
    const massNote = document.createElement("span");
    massNote.textContent = d.mass_note || "";
    const hint = document.createElement("span");
    hint.textContent = "Select to inspect " + (d.method === "GW" ? "the full event" : "this object");
    tooltip.append(title, value, objectType, bounds, massNote, hint);
    tooltip.hidden = false;
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(event.clientX + 14, innerWidth - rect.width - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(event.clientY + 14, innerHeight - rect.height - 8)) + "px";
  }

  function selectObject(name) {
    state.selected = name;
    renderSelection();
    renderDetails();
    renderTable();
  }

  function renderOverview() {
    const container = $("overview").parentElement;
    const width = Math.max(920, container.clientWidth - 24);
    const layout = getLayout(width);
    const {x, lanes, positions, bottom, height} = layout;
    const svg = d3.select("#overview").attr("viewBox", [0, 0, width, height]);
    svg.selectAll("g").remove();
    const root = svg.append("g");
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      root.append("rect").attr("x", 10).attr("y", lane.top).attr("width", width - 22)
        .attr("height", lane.height).attr("fill", i % 2 ? "#f6f8f6" : "#fff");
      root.append("text").attr("class", "lane-label").attr("x", 17).attr("y", lane.center - 9).text(lane.label);
      root.append("text").attr("class", "lane-subtitle").attr("x", 17).attr("y", lane.center + 7).text(lane.sub);
      const count = state.visible.filter(d => d.group === lane.key).length;
      root.append("text").attr("class", "lane-subtitle").attr("x", 17).attr("y", lane.center + 24).text(count + " entries");
      root.append("line").attr("x1", 164).attr("x2", 164).attr("y1", lane.top + 12)
        .attr("y2", lane.top + lane.height - 12).attr("stroke", "#a9b9b5").attr("stroke-width", 2);
    }
    if ($("gap").checked) {
      root.append("rect").attr("x", x(2.5)).attr("y", 49).attr("width", x(5) - x(2.5))
        .attr("height", bottom - 49).attr("fill", "#d8ae70").attr("opacity", 0.16);
      [2.5, 5].forEach(v => root.append("line").attr("x1", x(v)).attr("x2", x(v))
        .attr("y1", 49).attr("y2", bottom).attr("stroke", "#b78b4b").attr("stroke-dasharray", "3,4").attr("opacity", .6));
      root.append("text").attr("class", "band-label").attr("x", x(2.5)).attr("y", 35).text("Mass gap (~2.5–5 M☉)");
    }
    const ticks = $("scale").value === "log"
      ? ($("range").value === "low" ? [1, 1.5, 2, 2.5, 3, 4, 5] : [1, 2, 5, 10, 20, 50, 100, 200])
      : x.ticks(8);
    root.append("g").attr("class", "grid").attr("transform", "translate(0," + bottom + ")")
      .call(d3.axisBottom(x).tickValues(ticks).tickSize(-(bottom - 51)).tickFormat(""));
    root.append("g").attr("class", "axis").attr("transform", "translate(0," + bottom + ")")
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("~g")).tickSizeOuter(0));
    root.append("text").attr("class", "axis-label").attr("x", (177 + width - 34) / 2)
      .attr("y", height - 14).attr("text-anchor", "middle")
      .text("Mass (M☉) · " + ($("scale").value === "log" ? "logarithmic" : "linear") + " scale");
    const points = root.append("g").attr("class", "marks").selectAll("path").data(state.visible, d => d.id)
      .join("path").attr("class", "point")
      .attr("transform", d => "translate(" + positions.get(d.id).x + "," + positions.get(d.id).y + ")")
      .attr("aria-label", d => d.name + ", " + label(d) + ", " + typeLabel(d) + ", " + fmt(d.mass) + " solar masses")
      .on("pointerenter", showTooltip).on("pointermove", showTooltip)
      .on("pointerleave", () => { tooltip.hidden = true; })
      .on("click", (event, d) => { tooltip.hidden = true; selectObject(d.name); });
    setMark(points);
    root.append("g").attr("class", "halos");
    renderSelection();
    $("scale-explanation").textContent = $("scale").value === "log"
      ? "Equal distances on the log axis represent equal ratios."
      : "Equal distances on the linear axis represent equal mass differences; low masses cluster near zero.";
  }

  function renderSelection() {
    const width = Math.max(920, $("overview").parentElement.clientWidth - 24);
    const {positions} = getLayout(width);
    const matching = state.visible.filter(d => d.name === state.selected);
    d3.select("#overview .halos").selectAll("circle").data(matching, d => d.id).join("circle")
      .attr("class", "selected-halo").attr("r", 7)
      .attr("cx", d => positions.get(d.id).x).attr("cy", d => positions.get(d.id).y);
    d3.select("#overview").selectAll(".point")
      .attr("opacity", 1);
  }

  function renderDetails() {
    const items = state.data.filter(d => d.name === state.selected);
    const svg = d3.select("#detail-chart");
    svg.selectAll("*").remove();
    $("detail-values").replaceChildren();
    if (!items.length) {
      $("detail-name").textContent = "No object selected";
      $("detail-context").textContent = "No measurements match the current filters.";
      $("detail-note").textContent = "Reset the atlas or change your search to inspect an object.";
      $("detail-source").hidden = true;
      $("interval-note").textContent = "";
      svg.attr("viewBox", "0 0 600 100");
      return;
    }
    const first = items[0];
    $("detail-name").textContent = first.name;
    $("detail-context").textContent = first.method === "GW"
      ? first.catalog + " · version " + first.version + ". Full event shown here, including measurements outside the overview filters."
      : "Electromagnetic observation · " + first.category + ". Classification retained from the source.";
    const stories = {
      GW150914: "Compare the two components with the final mass. The remnant is lighter than their combined mass; energy is carried away by gravitational waves.",
      GW190814: "The lighter component falls in the mass gap. Its mass alone does not establish whether it is a neutron star or a black hole.",
      GW190521: "A high-mass event in this snapshot. The broad reported intervals matter when comparing it with other heavy objects.",
      GW170817: "The hollow remnant diamond restores the original plot’s source-listed 2.8 M☉ value. No uncertainty bounds are reported, so no remnant whisker is drawn; its physical type remains uncertain.",
      GW190425: "The hollow remnant diamond uses the original plot’s 3.4 M☉ total-binary-mass fallback. This is a position proxy, not a measured final remnant mass. The remnant mass, its uncertainty, and its physical type remain uncertain."
    };
    $("detail-note").textContent = stories[first.name] || (first.method === "GW"
      ? "Component and remnant values are related posterior summaries. Their reported central values need not obey exact arithmetic identities."
      : "These are the original compilation’s mass estimate and bounds.");
    $("detail-source").hidden = false;
    $("detail-source").href = first.source;
    $("interval-note").textContent = first.method === "GW"
      ? "Whiskers: reported 90% credible intervals. The local linear axis starts at zero. Hollow remnant diamonds have no reported remnant interval; no whisker is drawn for them."
      : "Whiskers: published EM bounds; confidence conventions vary. The local linear axis starts at zero.";
    const width = Math.max(280, $("detail-chart").parentElement.clientWidth);
    const height = Math.max(136, items.length * 43 + 54);
    svg.attr("viewBox", [0, 0, width, height])
      .attr("aria-label", first.name + ": " + items.map(d => label(d) + " " + fmt(d.mass) + ", interval " + interval(d) + " solar masses").join("; "));
    const x = d3.scaleLinear().domain([0, d3.max(items, d => Math.max(d.mass, d.high || 0)) * 1.12]).nice().range([100, width - 24]);
    const y = i => 24 + i * 43;
    items.forEach((d, i) => {
      const row = svg.append("g").attr("data-entry-id", d.id);
      row.append("text").attr("x", 0).attr("y", y(i) + 4).attr("class", "lane-subtitle")
        .text(d.method === "GW" ? d.role.charAt(0).toUpperCase() + d.role.slice(1) : d.role === "BH" ? "Black hole" : "Neutron star");
      if (d.low != null && d.high != null) {
        row.append("line").attr("x1", x(d.low)).attr("x2", x(d.high)).attr("y1", y(i)).attr("y2", y(i))
          .attr("stroke", color(d)).attr("stroke-width", 2);
        [d.low, d.high].forEach(v => row.append("line").attr("x1", x(v)).attr("x2", x(v))
          .attr("y1", y(i) - 5).attr("y2", y(i) + 5).attr("stroke", color(d)));
      }
      setMark(row.append("path").datum(d).attr("transform", "translate(" + x(d.mass) + "," + y(i) + ")"), 55);
    });
    svg.append("g").attr("class", "axis").attr("transform", "translate(0," + (height - 32) + ")")
      .call(d3.axisBottom(x).ticks(width < 400 ? 3 : 5).tickSizeOuter(0));
    svg.append("text").attr("class", "axis-label").attr("x", width - 24).attr("y", height - 2)
      .attr("text-anchor", "end").text("Mass (M☉) · local linear scale");
    const cards = d3.select("#detail-values").selectAll("div").data(items).join("div").style("border-color", color);
    cards.append("span").text(d => label(d));
    cards.append("span").text(typeLabel);
    cards.append("strong").text(d => fmt(d.mass) + " M☉");
    cards.append("span").text(d => "Bounds: " + interval(d));
    cards.filter(d => d.mass_note).append("span").attr("class", "mass-note").text(d => d.mass_note);
  }

  function renderTable() {
    const sorted = state.visible.slice().sort((a, b) => {
      if ($("sort").value === "name") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      return ($("sort").value === "mass-asc" ? a.mass - b.mass : b.mass - a.mass) || a.id.localeCompare(b.id);
    });
    const pages = Math.ceil(sorted.length / state.pageSize);
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    const start = state.page * state.pageSize;
    const rows = d3.select("#data-body").selectAll("tr").data(sorted.slice(start, start + state.pageSize), d => d.id)
      .join("tr").attr("class", d => d.name === state.selected ? "selected" : "");
    rows.selectAll("*").remove();
    rows.append("td").append("button").attr("type", "button")
      .attr("aria-label", d => "Inspect " + d.name + ", " + label(d))
      .attr("aria-pressed", d => String(d.name === state.selected))
      .text(d => d.name).on("click", (event, d) => {
        const id = d.id;
        selectObject(d.name);
        d3.select("#data-body").selectAll("tr").filter(row => row.id === id).select("button").node()?.focus({preventScroll: true});
      });
    rows.append("td").each(function(d) {
      d3.select(this).append("span").attr("class", "method-dot").style("background", color(d)).attr("aria-hidden", "true");
      d3.select(this).append("span").text(label(d) + " - " + typeLabel(d));
    });
    rows.append("td").text(d => fmt(d.mass));
    rows.append("td").text(interval);
    $("page-status").textContent = sorted.length ? (start + 1) + "–" + Math.min(start + state.pageSize, sorted.length) + " of " + sorted.length + " entries" : "0 entries";
    $("previous").disabled = state.page === 0;
    $("next").disabled = state.page >= pages - 1;
  }

  function render() {
    tooltip.hidden = true;
    const query = normalize($("search").value);
    state.visible = state.data.filter(d =>
      ($("method").value === "all" || d.method === $("method").value) &&
      ($("range").value === "all" || d.mass <= 5) &&
      normalize(d.name).includes(query));
    if (!state.visible.some(d => d.name === state.selected)) state.selected = state.visible[0]?.name || null;
    const countGW = new Set(state.visible.filter(d => d.method === "GW").map(d => d.name)).size;
    const countEM = state.visible.filter(d => d.method === "EM").length;
    $("result-count").textContent = state.visible.length + " of " + state.data.length + " entries · " + countGW + " GW events · " + countEM + " EM objects";
    $("empty-state").hidden = state.visible.length !== 0;
    renderOverview();
    renderDetails();
    renderTable();
  }

  function reset() {
    HTMLFormElement.prototype.reset.call($("controls"));
    $("gap").checked = true;
    $("sort").value = "mass-desc";
    state.selected = "GW150914";
    state.page = 0;
  }

  async function boot() {
    if (typeof d3 === "undefined") throw new Error("Local D3 library is missing.");
    const data = await d3.json("data/masses.json");
    if (!Array.isArray(data.objects) || !data.objects.length) throw new Error("Empty or malformed dataset.");
    state.data = data.objects;
    const legend = [
      {key: "GWBH", label: "LIGO–Virgo–KAGRA black holes"},
      {key: "GWNS", label: "LIGO–Virgo–KAGRA neutron stars"},
      {key: "EMBH", label: "EM black holes"},
      {key: "EMNS", label: "EM neutron stars"}
    ];
    const entries = d3.select("#object-legend").selectAll("li").data(legend).join("li");
    entries.append("span").attr("class", "legend-swatch").attr("aria-hidden", "true")
      .style("background-color", d => palette[d.key]);
    entries.append("span").text(d => d.label);
    if (new Set(state.data.map(d => d.id)).size !== state.data.length ||
      state.data.some(d => !Number.isFinite(d.mass) || d.mass <= 0 || !groupMap.has(d.group) || !palette[d.method + d.display_type])) {
      throw new Error("Invalid or duplicate mass records.");
    }
    $("controls").addEventListener("submit", event => event.preventDefault());
    $("search").addEventListener("input", () => { state.page = 0; render(); });
    ["method", "range", "scale", "gap"].forEach(id =>
      $(id).addEventListener("change", () => { state.page = 0; render(); }));
    $("sort").addEventListener("change", () => { state.page = 0; renderTable(); });
    $("reset").addEventListener("click", () => { reset(); render(); });
    $("previous").addEventListener("click", () => { state.page--; renderTable(); });
    $("next").addEventListener("click", () => { state.page++; renderTable(); });
    document.querySelectorAll("[data-example]").forEach(button => {
      button.addEventListener("click", () => {
        reset();
        $("search").value = button.dataset.example;
        state.selected = button.dataset.example;
        render();
      });
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") tooltip.hidden = true; });
    window.addEventListener("scroll", () => { tooltip.hidden = true; }, {passive: true});
    let previousWidth = 0;
    new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (width === previousWidth) return;
      previousWidth = width;
      renderOverview();
      renderDetails();
    }).observe($("overview").parentElement);
    render();
  }

  boot().catch(showError);
})();
