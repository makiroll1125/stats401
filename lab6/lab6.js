const statusOrder = [
    "Increase",
    "Unchanged",
    "Decrease"
];

const statusColors = {
    Increase: "#6baed6",
    Unchanged: "#bdbdbd",
    Decrease: "#f4a261"
};

const tooltip = d3.select("#tooltip");
const formatGDP = d3.format(",");

d3.json(
    "../data/lab6_assignment_gdp.json"
)
.then(data => {
    drawTreemap(
        "#squarify-treemap",
        data,
        d3.treemapSquarify,
        "squarify"
    );

    drawTreemap(
        "#slice-dice-treemap",
        data,
        d3.treemapSliceDice,
        "slice-dice"
    );
})
.catch(error => {
    console.error(error);

    d3.selectAll(
        "#squarify-treemap, #slice-dice-treemap"
    )
        .append("p")
        .attr("class", "error")
        .text(
            "The GDP hierarchy could not be loaded. " +
            "Please serve this folder through a local web server."
        );
});

function showTooltip(event, d) {
    const ancestors = d.ancestors()
        .reverse();

    tooltip
        .style("opacity", 1)
        .html(
            '<div class="tooltip-title">' +
            d.data.name +
            "</div>" +
            "Continent: " +
            ancestors[1].data.name +
            "<br>Area: " +
            ancestors[2].data.name +
            "<br>GDP: $" +
            formatGDP(d.data.gdp) +
            " billion" +
            "<br>GDP status: " +
            d.data.status
        );

    moveTooltip(event);
}

function moveTooltip(event) {
    tooltip
        .style(
            "left",
            event.pageX + 14 + "px"
        )
        .style(
            "top",
            event.pageY + 14 + "px"
        );
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function drawTreemap(
    selector,
    data,
    tileMethod,
    idPrefix
) {
    const width = 960;
    const chartHeight = 560;
    const legendHeight = 55;
    const height = chartHeight + legendHeight;

    const root = d3.hierarchy(data)
        .sum(d => d.gdp || 0)
        .sort(
            (a, b) => b.value - a.value
        );

    const layout = d3.treemap()
        .tile(tileMethod)
        .size([
            width,
            chartHeight
        ])
        .paddingOuter(4)
        .paddingInner(2)
        .paddingTop(
            d => (
                d.depth === 1
                ? 24
                : d.depth === 2
                ? 18
                : 0
            )
        )
        .round(true);

    layout(root);

    const svg = d3.select(selector)
        .append("svg")
        .attr("class", "treemap-svg")
        .attr(
            "viewBox",
            "0 0 " + width + " " + height
        )
        .attr("width", width)
        .attr("height", height)
        .attr("role", "img")
        .attr(
            "aria-label",
            idPrefix === "squarify"
            ? "Squarified treemap of GDP by continent, area, and country"
            : "Slice-and-dice treemap of GDP by continent, area, and country"
        );

    const definitions = svg.append("defs");

    definitions.selectAll("clipPath")
        .data(root.leaves())
        .join("clipPath")
        .attr(
            "id",
            (d, i) => idPrefix + "-clip-" + i
        )
        .append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr(
            "width",
            d => Math.max(0, d.x1 - d.x0)
        )
        .attr(
            "height",
            d => Math.max(0, d.y1 - d.y0)
        );

    const cells = svg.append("g")
        .selectAll("g")
        .data(root.leaves())
        .join("g")
        .attr("class", "country-cell")
        .on(
            "mouseenter",
            (event, d) => showTooltip(event, d)
        )
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip);

    cells.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr(
            "width",
            d => Math.max(0, d.x1 - d.x0)
        )
        .attr(
            "height",
            d => Math.max(0, d.y1 - d.y0)
        )
        .attr(
            "fill",
            d => statusColors[d.data.status]
        )
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

    cells.append("title")
        .text(
            d => (
                d.data.name +
                ": $" +
                formatGDP(d.data.gdp) +
                " billion, " +
                d.data.status
            )
        );

    cells.append("text")
        .attr("class", "country-label")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 15)
        .attr(
            "clip-path",
            (d, i) => (
                "url(#" +
                idPrefix +
                "-clip-" +
                i +
                ")"
            )
        )
        .style(
            "display",
            d => (
                d.x1 - d.x0 > 54 &&
                d.y1 - d.y0 > 24
                ? null
                : "none"
            )
        )
        .text(d => d.data.name);

    cells.append("text")
        .attr("class", "country-label country-value")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 29)
        .attr(
            "clip-path",
            (d, i) => (
                "url(#" +
                idPrefix +
                "-clip-" +
                i +
                ")"
            )
        )
        .style(
            "display",
            d => (
                d.x1 - d.x0 > 72 &&
                d.y1 - d.y0 > 40
                ? null
                : "none"
            )
        )
        .text(
            d => "$" + formatGDP(d.data.gdp) + "B"
        );

    drawGroupBoundaries(svg, root);
    drawLegend(svg, chartHeight, width);
}

function drawGroupBoundaries(svg, root) {
    const groups = root.descendants()
        .filter(
            d => d.depth === 1 || d.depth === 2
        );

    svg.append("g")
        .selectAll("rect")
        .data(groups)
        .join("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr(
            "width",
            d => Math.max(0, d.x1 - d.x0)
        )
        .attr(
            "height",
            d => Math.max(0, d.y1 - d.y0)
        )
        .attr("fill", "none")
        .attr(
            "stroke",
            d => d.depth === 1 ? "#27303b" : "#fff"
        )
        .attr(
            "stroke-width",
            d => d.depth === 1 ? 2 : 1
        )
        .attr("pointer-events", "none");

    svg.append("g")
        .selectAll("text")
        .data(groups)
        .join("text")
        .attr(
            "class",
            d => (
                d.depth === 1
                ? "group-label continent-label"
                : "group-label area-label"
            )
        )
        .attr("x", d => d.x0 + 5)
        .attr(
            "y",
            d => d.y0 + (d.depth === 1 ? 16 : 13)
        )
        .style(
            "display",
            d => (
                d.x1 - d.x0 > 45
                ? null
                : "none"
            )
        )
        .text(d => d.data.name);
}

function drawLegend(svg, chartHeight, width) {
    const itemWidth = 120;
    const legendWidth = itemWidth * statusOrder.length;

    const legend = svg.append("g")
        .attr(
            "transform",
            "translate(" +
            (width - legendWidth) / 2 +
            "," +
            (chartHeight + 23) +
            ")"
        );

    const item = legend.selectAll("g")
        .data(statusOrder)
        .join("g")
        .attr(
            "transform",
            (d, i) => (
                "translate(" +
                i * itemWidth +
                ",0)"
            )
        );

    item.append("rect")
        .attr("width", 16)
        .attr("height", 16)
        .attr("rx", 2)
        .attr("fill", d => statusColors[d])
        .attr("stroke", "#6b7280");

    item.append("text")
        .attr("class", "legend-label")
        .attr("x", 23)
        .attr("y", 13)
        .text(d => d);
}
