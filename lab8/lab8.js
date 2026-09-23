const topicLabels = {
    0: "Arts, Media & Culture",
    1: "STEM, Data & Systems",
    2: "Academic Status & Procedures",
    3: "Credits & Degree Requirements",
    4: "China, Asia & Global Culture",
    5: "Society, Policy & Global Health",
    6: "University & Administration",
    7: "Learning, Community & Skills"
};

const topicOrder = d3.range(8).map(String);
const topicColor = d3.scaleOrdinal()
    .domain(topicOrder)
    .range([
        "#d85b57",
        "#3d72b8",
        "#b77b25",
        "#7654a5",
        "#2f8c73",
        "#bf4f87",
        "#65768a",
        "#66a638"
    ]);

const tooltip = d3.select("#tooltip");
const formatNumber = d3.format(",");
const formatPercent = d3.format(".1%");

Promise.all([
    d3.csv(
        "../data/lab8_embedding_map.csv",
        d => ({
            ...d,
            page: +d.page,
            word_count: +d.word_count,
            x: +d.x,
            y: +d.y,
            cluster: String(d.cluster),
            topic: topicLabels[+d.cluster],
            neighbors: d.neighbors.split("|")
        })
    ),
    d3.json("../data/lab8_summary.json")
])
.then(([data, summary]) => {
    drawMetrics(summary);
    drawTermChart(summary.top_terms);
    drawSectionChart(data);
    buildExplorer(data);
})
.catch(error => {
    console.error(error);
    d3.select("main")
        .append("p")
        .attr("class", "error")
        .text(
            "The bulletin data could not be loaded. " +
            "Serve this folder through a local web server rather than opening the HTML file directly."
        );
});

function drawMetrics(summary) {
    const metrics = [
        ["Raw passages", formatNumber(summary.raw_passages)],
        ["After cleaning", formatNumber(summary.clean_passages)],
        ["Average length", summary.average_words + " words"],
        ["Formal sections", formatNumber(summary.formal_sections)]
    ];

    d3.select("#metrics")
        .selectAll("div")
        .data(metrics)
        .join("div")
        .attr("class", "metric")
        .html(d => `<span>${d[0]}</span><strong>${d[1]}</strong>`);
}

function drawTermChart(terms) {
    const ignored = new Set([
        "student",
        "students",
        "course",
        "courses",
        "university",
        "duke",
        "kunshan"
    ]);
    const data = terms
        .filter(d => !ignored.has(d.term))
        .slice(0, 10)
        .reverse();
    const width = 520;
    const height = 290;
    const margin = {top: 8, right: 25, bottom: 35, left: 92};
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.score)])
        .nice()
        .range([margin.left, width - margin.right]);
    const yScale = d3.scaleBand()
        .domain(data.map(d => d.term))
        .range([height - margin.bottom, margin.top])
        .padding(0.25);
    const svg = d3.select("#terms-chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Bar chart of top corpus-wide TF-IDF terms");

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(4).tickFormat(d3.format(".3f")));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).tickSize(0))
        .call(g => g.select(".domain").remove());

    svg.selectAll(".term-bar")
        .data(data)
        .join("rect")
        .attr("class", "term-bar")
        .attr("x", margin.left)
        .attr("y", d => yScale(d.term))
        .attr("width", d => xScale(d.score) - margin.left)
        .attr("height", yScale.bandwidth())
        .attr("rx", 3)
        .attr("fill", "#2a7f87");
}

function drawSectionChart(data) {
    const counts = Array.from(
        d3.rollup(data, values => values.length, d => d.chapter),
        ([chapter, count]) => ({chapter, count})
    ).sort((a, b) => d3.descending(a.count, b.count));
    const width = 520;
    const height = 340;
    const margin = {top: 8, right: 38, bottom: 28, left: 205};
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(counts, d => d.count)])
        .nice()
        .range([margin.left, width - margin.right]);
    const yScale = d3.scaleBand()
        .domain(counts.map(d => d.chapter))
        .range([margin.top, height - margin.bottom])
        .padding(0.2);
    const svg = d3.select("#sections-chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Bar chart of passages by bulletin chapter");

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(4));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(yScale)
                .tickSize(0)
                .tickFormat(shortChapter)
        )
        .call(g => g.select(".domain").remove());

    svg.selectAll(".section-bar")
        .data(counts)
        .join("rect")
        .attr("class", "section-bar")
        .attr("x", margin.left)
        .attr("y", d => yScale(d.chapter))
        .attr("width", d => xScale(d.count) - margin.left)
        .attr("height", yScale.bandwidth())
        .attr("rx", 2)
        .attr("fill", "#536c99");

    svg.selectAll(".section-count")
        .data(counts)
        .join("text")
        .attr("x", d => xScale(d.count) + 4)
        .attr("y", d => yScale(d.chapter) + yScale.bandwidth() / 2 + 3)
        .attr("font-size", 10)
        .attr("fill", "#536175")
        .text(d => d.count);
}

function buildExplorer(data) {
    const byId = new Map(data.map(d => [d.id, d]));
    const chapters = Array.from(new Set(data.map(d => d.chapter)));
    const state = {
        search: "",
        topic: "all",
        chapter: "all",
        matrix: null,
        selected: null
    };

    d3.select("#topic-filter")
        .selectAll("option.topic-option")
        .data(topicOrder)
        .join("option")
        .attr("class", "topic-option")
        .attr("value", d => d)
        .text(d => topicLabels[d]);

    d3.select("#section-filter")
        .selectAll("option.chapter-option")
        .data(chapters)
        .join("option")
        .attr("class", "chapter-option")
        .attr("value", d => d)
        .text(shortChapter);

    d3.select("#topic-legend")
        .selectAll("button")
        .data(topicOrder)
        .join("button")
        .attr("type", "button")
        .html(
            d => `<span class="swatch" style="background:${topicColor(d)}"></span>${topicLabels[d]}`
        )
        .on("click", (event, cluster) => {
            state.topic = state.topic === cluster ? "all" : cluster;
            d3.select("#topic-filter").property("value", state.topic);
            updateMap();
        });

    const mapWidth = 720;
    const mapHeight = 520;
    const mapMargin = 24;
    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.x))
        .nice()
        .range([mapMargin, mapWidth - mapMargin]);
    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.y))
        .nice()
        .range([mapHeight - mapMargin, mapMargin]);
    const sizeScale = d3.scaleSqrt()
        .domain(d3.extent(data, d => d.word_count))
        .range([2.2, 7]);
    const mapSvg = d3.select("#map")
        .append("svg")
        .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
        .attr("role", "img")
        .attr("aria-label", "UMAP semantic map of bulletin passages");
    const zoomLayer = mapSvg.append("g");
    const neighborLayer = zoomLayer.append("g");
    const pointLayer = zoomLayer.append("g");

    const points = pointLayer.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "point")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", d => sizeScale(d.word_count))
        .attr("fill", d => topicColor(d.cluster))
        .attr("fill-opacity", 0.73)
        .attr("stroke", "white")
        .attr("stroke-width", 0.55)
        .on("mouseenter", (event, d) => {
            tooltip
                .style("opacity", 1)
                .html(
                    `<strong>${d.topic}</strong><br>` +
                    `${shortChapter(d.chapter)} · p. ${d.page}<br>` +
                    `${d.word_count} words · ${d.text_clean.slice(0, 150)}…`
                );
            moveTooltip(event);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("click", (event, d) => {
            event.stopPropagation();
            selectPassage(d);
        });

    const zoom = d3.zoom()
        .scaleExtent([0.8, 10])
        .on("zoom", event => zoomLayer.attr("transform", event.transform));

    mapSvg.call(zoom)
        .on("dblclick.zoom", null)
        .on("click", () => {
            state.selected = null;
            neighborLayer.selectAll("*").remove();
            updateMap();
            showEmptyDetails();
        });

    const matrix = drawMatrix(data, cell => {
        const sameCell = state.matrix &&
            state.matrix.chapter === cell.chapter &&
            state.matrix.cluster === cell.cluster;
        state.matrix = sameCell ? null : cell;
        updateMap();
        updateMatrix();
    });

    d3.select("#search").on("input", function() {
        state.search = this.value.trim().toLowerCase();
        state.matrix = null;
        updateMap();
        updateMatrix();
    });

    d3.select("#topic-filter").on("change", function() {
        state.topic = this.value;
        state.matrix = null;
        updateMap();
        updateMatrix();
    });

    d3.select("#section-filter").on("change", function() {
        state.chapter = this.value;
        state.matrix = null;
        updateMap();
        updateMatrix();
    });

    d3.select("#reset").on("click", () => {
        state.search = "";
        state.topic = "all";
        state.chapter = "all";
        state.matrix = null;
        state.selected = null;
        d3.select("#search").property("value", "");
        d3.select("#topic-filter").property("value", "all");
        d3.select("#section-filter").property("value", "all");
        mapSvg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
        neighborLayer.selectAll("*").remove();
        showEmptyDetails();
        updateMap();
        updateMatrix();
    });

    function isVisible(d) {
        return (state.topic === "all" || d.cluster === state.topic) &&
            (state.chapter === "all" || d.chapter === state.chapter);
    }

    function isHighlighted(d) {
        const matchesSearch = !state.search ||
            d.text_clean.toLowerCase().includes(state.search) ||
            d.section.toLowerCase().includes(state.search) ||
            String(d.subsection).toLowerCase().includes(state.search);
        const matchesMatrix = !state.matrix ||
            (d.chapter === state.matrix.chapter && d.cluster === state.matrix.cluster);

        return matchesSearch && matchesMatrix;
    }

    function updateMap() {
        const visible = data.filter(isVisible);
        const highlighted = visible.filter(isHighlighted);
        const neighborIds = new Set(
            state.selected ? state.selected.neighbors : []
        );

        points
            .style("display", d => isVisible(d) ? null : "none")
            .attr("fill-opacity", d => {
                if (state.selected && d.id === state.selected.id) return 1;
                if (neighborIds.has(d.id)) return 0.95;
                return isHighlighted(d) ? 0.78 : 0.055;
            })
            .attr("stroke", d => {
                if (state.selected && d.id === state.selected.id) return "#111827";
                if (neighborIds.has(d.id)) return "#111827";
                return "white";
            })
            .attr("stroke-width", d => {
                if (state.selected && d.id === state.selected.id) return 2.6;
                if (neighborIds.has(d.id)) return 1.5;
                return 0.55;
            });

        d3.select("#status").text(
            `${formatNumber(highlighted.length)} highlighted of ` +
            `${formatNumber(visible.length)} visible passages` +
            (state.matrix ? ` · matrix: ${shortChapter(state.matrix.chapter)} × ${topicLabels[state.matrix.cluster]}` : "")
        );
    }

    function selectPassage(d) {
        state.selected = d;
        state.matrix = null;
        const neighbors = d.neighbors
            .map(id => byId.get(id))
            .filter(Boolean);

        neighborLayer.selectAll("line")
            .data(neighbors)
            .join("line")
            .attr("x1", xScale(d.x))
            .attr("y1", yScale(d.y))
            .attr("x2", neighbor => xScale(neighbor.x))
            .attr("y2", neighbor => yScale(neighbor.y))
            .attr("stroke", "#273244")
            .attr("stroke-width", 1.1)
            .attr("stroke-dasharray", "3 3")
            .attr("opacity", 0.62)
            .attr("pointer-events", "none");

        const details = d3.select("#details");
        details.html("");
        details.append("h3").text(d.topic);
        details.append("p")
            .attr("class", "meta")
            .text(
                `${d.chapter} › ${d.section}` +
                `${d.subsection ? ` › ${d.subsection}` : ""} · page ${d.page} · ${d.word_count} words`
            );
        details.append("p")
            .attr("class", "passage")
            .text(d.text_clean);
        details.append("h4").text("Five nearest semantic neighbors");
        const list = details.append("div").attr("class", "neighbor-list");
        list.selectAll("button")
            .data(neighbors)
            .join("button")
            .attr("type", "button")
            .text(neighbor => `p. ${neighbor.page} · ${neighbor.section} — ${neighbor.text_clean}`)
            .on("click", (event, neighbor) => selectPassage(neighbor));

        updateMap();
        updateMatrix();
    }

    function updateMatrix() {
        matrix.cells
            .attr("stroke", d => {
                if (state.matrix &&
                    d.chapter === state.matrix.chapter &&
                    d.cluster === state.matrix.cluster) return "#111827";
                if (state.selected &&
                    d.chapter === state.selected.chapter &&
                    d.cluster === state.selected.cluster) return "#111827";
                return "white";
            })
            .attr("stroke-width", d => {
                const activeMatrix = state.matrix &&
                    d.chapter === state.matrix.chapter &&
                    d.cluster === state.matrix.cluster;
                const activePoint = state.selected &&
                    d.chapter === state.selected.chapter &&
                    d.cluster === state.selected.cluster;
                return activeMatrix || activePoint ? 3 : 1;
            });
    }

    function showEmptyDetails() {
        d3.select("#details").html(
            "<h3>Select a passage</h3>" +
            "<p>Click any point to read its text, locate it in the formal hierarchy, and inspect nearest neighbors.</p>"
        );
    }

    updateMap();
    updateMatrix();
}

function drawMatrix(data, clicked) {
    const chapters = Array.from(new Set(data.map(d => d.chapter)));
    const grouped = d3.rollup(
        data,
        values => values.length,
        d => d.chapter,
        d => d.cluster
    );
    const chapterTotals = d3.rollup(
        data,
        values => values.length,
        d => d.chapter
    );
    const cells = chapters.flatMap(chapter =>
        topicOrder.map(cluster => {
            const count = grouped.get(chapter)?.get(cluster) || 0;
            return {
                chapter,
                cluster,
                count,
                proportion: count / chapterTotals.get(chapter)
            };
        })
    );
    const width = 1180;
    const height = 535;
    const margin = {top: 145, right: 20, bottom: 42, left: 285};
    const xScale = d3.scaleBand()
        .domain(topicOrder)
        .range([margin.left, width - margin.right])
        .padding(0.045);
    const yScale = d3.scaleBand()
        .domain(chapters)
        .range([margin.top, height - margin.bottom])
        .padding(0.055);
    const fillScale = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(cells, d => d.proportion)]);
    const svg = d3.select("#matrix")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Matrix of topic proportions by formal bulletin chapter");

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${margin.top})`)
        .call(
            d3.axisTop(xScale)
                .tickSize(0)
                .tickFormat(d => topicLabels[d])
        )
        .call(g => g.select(".domain").remove())
        .selectAll("text")
        .attr("transform", "rotate(-38)")
        .attr("text-anchor", "start")
        .attr("dx", 5)
        .attr("dy", -2)
        .attr("font-size", 11);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(
            d3.axisLeft(yScale)
                .tickSize(0)
                .tickFormat(shortChapter)
        )
        .call(g => g.select(".domain").remove());

    const rects = svg.append("g")
        .selectAll("rect")
        .data(cells)
        .join("rect")
        .attr("class", "matrix-cell")
        .attr("x", d => xScale(d.cluster))
        .attr("y", d => yScale(d.chapter))
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("rx", 3)
        .attr("fill", d => d.count ? fillScale(d.proportion) : "#edf1f5")
        .attr("stroke", "white")
        .on("mouseenter", (event, d) => {
            tooltip
                .style("opacity", 1)
                .html(
                    `<strong>${shortChapter(d.chapter)}</strong><br>` +
                    `${topicLabels[d.cluster]}<br>` +
                    `${formatNumber(d.count)} passages · ${formatPercent(d.proportion)} of chapter`
                );
            moveTooltip(event);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", () => tooltip.style("opacity", 0))
        .on("click", (event, d) => clicked(d));

    svg.append("g")
        .selectAll("text")
        .data(cells.filter(d => d.count))
        .join("text")
        .attr("x", d => xScale(d.cluster) + xScale.bandwidth() / 2)
        .attr("y", d => yScale(d.chapter) + yScale.bandwidth() / 2 + 4)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("font-weight", 700)
        .attr("fill", d => d.proportion > 0.45 ? "white" : "#233044")
        .attr("pointer-events", "none")
        .text(d => d.count);

    const legendScale = d3.scaleLinear()
        .domain(fillScale.domain())
        .range([0, 150]);
    const legend = svg.append("g")
        .attr("transform", `translate(${width - 190},${height - 22})`);
    const stops = d3.range(30).map(i => i / 29 * fillScale.domain()[1]);

    legend.selectAll("rect")
        .data(stops)
        .join("rect")
        .attr("x", d => legendScale(d))
        .attr("y", -9)
        .attr("width", 6)
        .attr("height", 9)
        .attr("fill", fillScale);
    legend.append("text")
        .attr("x", 0)
        .attr("y", 12)
        .attr("font-size", 10)
        .text("0%");
    legend.append("text")
        .attr("x", 150)
        .attr("y", 12)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .text(formatPercent(fillScale.domain()[1]));

    return {cells: rects};
}

function shortChapter(chapter) {
    return chapter
        .replace(/^Part \d+:\s*/, "")
        .replace("A Liberal Arts Education at Duke Kunshan University", "Liberal Arts Education")
        .replace("Admission, Scholarships and Financial Aid", "Admission & Financial Aid")
        .replace("Academic Procedures and Information", "Academic Procedures")
        .replace("Academic Advising and Support", "Advising & Support")
        .replace("Career Services, Study Away, and Research Opportunities", "Career, Study Away & Research")
        .replace("Student Affairs and Campus Life", "Student & Campus Life")
        .replace("Academic Calendar 2021-22", "Academic Calendar");
}

function moveTooltip(event) {
    tooltip
        .style("left", Math.min(event.clientX + 14, window.innerWidth - 330) + "px")
        .style("top", Math.min(event.clientY + 14, window.innerHeight - 150) + "px");
}
