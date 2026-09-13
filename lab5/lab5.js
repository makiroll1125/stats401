const districtOrder = [
    "Central",
    "North",
    "South",
    "East",
    "West"
];

const districtColors = {
    Central: "#4e79a7",
    North: "#59a14f",
    South: "#e15759",
    East: "#f28e2b",
    West: "#9c6ade"
};

const routeColors = {
    Metro: "#276fbf",
    Express: "#d1495b",
    Shuttle: "#6b8e23"
};

const typeSymbols = {
    Local: d3.symbolCircle,
    Transfer: d3.symbolDiamond,
    Terminal: d3.symbolSquare
};

const tooltip = d3.select("#tooltip");

Promise.all([
    d3.csv(
        "../data/lab5_assignment_stations.csv",
        d => ({
            id: d.id,
            station_name: d.station_name,
            district: d.district,
            daily_passengers: +d.daily_passengers,
            station_type: d.station_type
        })
    ),
    d3.csv(
        "../data/lab5_assignment_routes.csv",
        d => ({
            source: d.source,
            target: d.target,
            travel_time_min: +d.travel_time_min,
            route_type: d.route_type
        })
    )
])
.then(([nodes, links]) => {
    drawNetwork(nodes, links);
    drawMatrix(nodes, links);
})
.catch(error => {
    console.error(error);

    d3.select("#network")
        .append("p")
        .attr("class", "error")
        .text(
            "The transit data could not be loaded. " +
            "Please serve this folder through a local web server."
        );
});

function showTooltip(event, html) {
    tooltip
        .style("opacity", 1)
        .html(html)
        .style(
            "left",
            event.pageX + 14 + "px"
        )
        .style(
            "top",
            event.pageY + 14 + "px"
        );
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

function drawNetwork(nodes, rawLinks) {
    const width = 1080;
    const height = 690;
    const graphWidth = 790;

    const graphBounds = {
        left: 30,
        right: graphWidth - 35,
        top: 30,
        bottom: height - 30
    };

    const districtPositions = {
        Central: {
            x: graphWidth / 2,
            y: height / 2
        },
        North: {
            x: graphWidth / 2,
            y: 105
        },
        South: {
            x: graphWidth / 2,
            y: height - 105
        },
        East: {
            x: graphWidth - 115,
            y: height / 2
        },
        West: {
            x: 115,
            y: height / 2
        }
    };

    const links = rawLinks.map(
        d => ({
            ...d
        })
    );

    const nodeSize = d3.scaleSqrt()
        .domain(
            d3.extent(
                nodes,
                d => d.daily_passengers
            )
        )
        .range([55, 420]);

    const linkWidth = d3.scaleLinear()
        .domain(
            d3.extent(
                links,
                d => d.travel_time_min
            )
        )
        .range([1.5, 6]);

    const linkOpacity = d3.scaleLinear()
        .domain(
            d3.extent(
                links,
                d => d.travel_time_min
            )
        )
        .range([0.4, 0.95]);

    const svg = d3.select("#network")
        .append("svg")
        .attr("class", "network-svg")
        .attr(
            "viewBox",
            "0 0 " + width + " " + height
        )
        .attr("width", width)
        .attr("height", height)
        .attr("role", "img")
        .attr(
            "aria-label",
            "Interactive force-directed urban transit network"
        );

    const graph = svg.append("g");

    const link = graph.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("class", "network-link")
        .attr(
            "stroke",
            d => routeColors[d.route_type]
        )
        .attr(
            "stroke-width",
            d => linkWidth(d.travel_time_min)
        )
        .attr(
            "stroke-opacity",
            d => linkOpacity(d.travel_time_min)
        );

    const node = graph.append("g")
        .selectAll("path")
        .data(nodes)
        .join("path")
        .attr("class", "network-node")
        .attr(
            "d",
            d => d3.symbol()
                .type(typeSymbols[d.station_type])
                .size(nodeSize(d.daily_passengers))()
        )
        .attr(
            "fill",
            d => districtColors[d.district]
        )
        .attr("stroke", "#172033")
        .attr("stroke-width", 1.2);

    const label = graph.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .attr("class", "station-label")
        .text(d => d.id)
        .attr("dx", 9)
        .attr("dy", -8);

    const neighbors = new Set(
        links.flatMap(
            d => [
                d.source + "|" + d.target,
                d.target + "|" + d.source
            ]
        )
    );

    const connected = (
        a,
        b
    ) => (
        a.id === b.id ||
        neighbors.has(a.id + "|" + b.id)
    );

    function reset() {
        node.attr("opacity", 1);
        label.attr("opacity", 1);

        link
            .attr(
                "stroke-opacity",
                d => linkOpacity(d.travel_time_min)
            )
            .attr(
                "stroke-width",
                d => linkWidth(d.travel_time_min)
            );
    }

    node
        .on(
            "mouseenter",
            (event, d) => {
                node.attr(
                    "opacity",
                    other => (
                        connected(d, other)
                        ? 1
                        : 0.12
                    )
                );

                label.attr(
                    "opacity",
                    other => (
                        connected(d, other)
                        ? 1
                        : 0.08
                    )
                );

                link.attr(
                    "stroke-opacity",
                    route => (
                        route.source.id === d.id ||
                        route.target.id === d.id
                        ? 1
                        : 0.07
                    )
                );

                showTooltip(
                    event,
                    '<div class="tooltip-title">' +
                    d.station_name +
                    " (" +
                    d.id +
                    ")</div>" +
                    "District: " +
                    d.district +
                    "<br>Station type: " +
                    d.station_type +
                    "<br>Daily passengers: " +
                    d3.format(",")(d.daily_passengers)
                );
            }
        )
        .on("mousemove", moveTooltip)
        .on(
            "mouseleave",
            () => {
                reset();
                hideTooltip();
            }
        );

    link
        .on(
            "mouseenter",
            (event, d) => {
                node.attr(
                    "opacity",
                    station => (
                        station.id === d.source.id ||
                        station.id === d.target.id
                        ? 1
                        : 0.12
                    )
                );

                label.attr(
                    "opacity",
                    station => (
                        station.id === d.source.id ||
                        station.id === d.target.id
                        ? 1
                        : 0.08
                    )
                );

                link
                    .attr(
                        "stroke-opacity",
                        route => (
                            route === d
                            ? 1
                            : 0.07
                        )
                    )
                    .attr(
                        "stroke-width",
                        route => (
                            route === d
                            ? (
                                linkWidth(
                                    route.travel_time_min
                                ) + 2
                            )
                            : linkWidth(
                                route.travel_time_min
                            )
                        )
                    );

                showTooltip(
                    event,
                    '<div class="tooltip-title">' +
                    d.source.station_name +
                    " ↔ " +
                    d.target.station_name +
                    "</div>" +
                    "Route type: " +
                    d.route_type +
                    "<br>Travel time: " +
                    d.travel_time_min +
                    " minutes"
                );
            }
        )
        .on("mousemove", moveTooltip)
        .on(
            "mouseleave",
            () => {
                reset();
                hideTooltip();
            }
        );

    const simulation = d3.forceSimulation(nodes)
        .force(
            "link",
            d3.forceLink(links)
                .id(d => d.id)
                .distance(
                    d => (
                        65 +
                        d.travel_time_min * 4
                    )
                )
                .strength(0.75)
        )
        .force(
            "charge",
            d3.forceManyBody()
                .strength(-240)
        )
        .force(
            "center",
            d3.forceCenter(
                graphWidth / 2,
                height / 2
            )
        )
        .force(
            "districtX",
            d3.forceX(
                d => districtPositions[d.district].x
            )
            .strength(0.12)
        )
        .force(
            "districtY",
            d3.forceY(
                d => districtPositions[d.district].y
            )
            .strength(0.12)
        )
        .force(
            "collision",
            d3.forceCollide()
                .radius(
                    d => (
                        Math.sqrt(
                            nodeSize(
                                d.daily_passengers
                            ) / Math.PI
                        ) + 10
                    )
                )
        );

    function nodeRadius(d) {
        return Math.sqrt(
            nodeSize(d.daily_passengers) /
            Math.PI
        );
    }

    function clampX(d, xPosition) {
        const radius = nodeRadius(d);

        return Math.max(
            graphBounds.left + radius,
            Math.min(
                graphBounds.right - radius,
                xPosition
            )
        );
    }

    function clampY(d, yPosition) {
        const radius = nodeRadius(d);

        return Math.max(
            graphBounds.top + radius,
            Math.min(
                graphBounds.bottom - radius,
                yPosition
            )
        );
    }

    function dragStarted(event, d) {
        if (!event.active) {
            simulation
                .alphaTarget(0.3)
                .restart();
        }

        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = clampX(d, event.x);
        d.fy = clampY(d, event.y);
    }

    function dragEnded(event, d) {
        if (!event.active) {
            simulation.alphaTarget(0);
        }

        d.fx = null;
        d.fy = null;
    }

    node.call(
        d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded)
    );

    simulation.on(
        "tick",
        () => {
            nodes.forEach(d => {
                d.x = clampX(d, d.x);
                d.y = clampY(d, d.y);
            });

            link
                .attr(
                    "x1",
                    d => d.source.x
                )
                .attr(
                    "y1",
                    d => d.source.y
                )
                .attr(
                    "x2",
                    d => d.target.x
                )
                .attr(
                    "y2",
                    d => d.target.y
                );

            node.attr(
                "transform",
                d => (
                    "translate(" +
                    d.x +
                    "," +
                    d.y +
                    ")"
                )
            );

            label
                .attr(
                    "x",
                    d => d.x
                )
                .attr(
                    "y",
                    d => d.y
                );
        }
    );

    drawLegend(
        svg,
        815,
        42,
        nodeSize,
        linkWidth
    );
}

function drawLegend(
    svg,
    x,
    y,
    nodeSize,
    linkWidth
) {
    const legend = svg.append("g")
        .attr(
            "transform",
            "translate(" + x + "," + y + ")"
        );

    const heading = (
        text,
        offset
    ) => legend.append("text")
        .attr("class", "legend-title")
        .attr("y", offset)
        .text(text);

    heading("Stations", 0);

    districtOrder.forEach(
        (district, i) => {
            legend.append("circle")
                .attr("cx", 7)
                .attr(
                    "cy",
                    18 + i * 21
                )
                .attr("r", 6)
                .attr(
                    "fill",
                    districtColors[district]
                );

            legend.append("text")
                .attr("class", "legend-label")
                .attr("x", 20)
                .attr(
                    "y",
                    22 + i * 21
                )
                .text(district);
        }
    );

    heading("Station type", 138);

    [
        "Local",
        "Transfer",
        "Terminal"
    ].forEach(
        (type, i) => {
            legend.append("path")
                .attr(
                    "transform",
                    (
                        "translate(7," +
                        (156 + i * 23) +
                        ")"
                    )
                )
                .attr(
                    "d",
                    d3.symbol()
                        .type(typeSymbols[type])
                        .size(100)()
                )
                .attr("fill", "#b8c2cc")
                .attr("stroke", "#172033");

            legend.append("text")
                .attr("class", "legend-label")
                .attr("x", 20)
                .attr(
                    "y",
                    160 + i * 23
                )
                .text(type);
        }
    );

    heading("Daily passengers", 240);

    [
        1373,
        5700,
        9850
    ].forEach(
        (value, i) => {
            legend.append("path")
                .attr(
                    "transform",
                    (
                        "translate(" +
                        (8 + i * 43) +
                        ",267)"
                    )
                )
                .attr(
                    "d",
                    d3.symbol()
                        .type(d3.symbolCircle)
                        .size(nodeSize(value))()
                )
                .attr("fill", "#9aa5b1");

            legend.append("text")
                .attr("class", "legend-label")
                .attr("text-anchor", "middle")
                .attr(
                    "x",
                    8 + i * 43
                )
                .attr("y", 289)
                .text(
                    d3.format("~s")(value)
                );
        }
    );

    heading("Routes", 325);

    Object.entries(routeColors)
        .forEach(
            ([type, color], i) => {
                legend.append("line")
                    .attr("x1", 0)
                    .attr("x2", 17)
                    .attr(
                        "y1",
                        343 + i * 21
                    )
                    .attr(
                        "y2",
                        343 + i * 21
                    )
                    .attr("stroke", color)
                    .attr("stroke-width", 4);

                legend.append("text")
                    .attr("class", "legend-label")
                    .attr("x", 24)
                    .attr(
                        "y",
                        347 + i * 21
                    )
                    .text(type);
            }
        );

    heading("Travel time", 425);

    [
        2,
        9,
        16
    ].forEach(
        (value, i) => {
            legend.append("line")
                .attr("x1", 0)
                .attr("x2", 32)
                .attr(
                    "y1",
                    445 + i * 23
                )
                .attr(
                    "y2",
                    445 + i * 23
                )
                .attr("stroke", "#4b5563")
                .attr(
                    "stroke-width",
                    linkWidth(value)
                )
                .attr("stroke-linecap", "round");

            legend.append("text")
                .attr("class", "legend-label")
                .attr("x", 42)
                .attr(
                    "y",
                    449 + i * 23
                )
                .text(value + " min");
        }
    );
}

function drawMatrix(nodes, links) {
    const typeOrder = {
        Transfer: 0,
        Terminal: 1,
        Local: 2
    };

    const ordered = [...nodes]
        .sort(
            (a, b) => (
                d3.ascending(
                    districtOrder.indexOf(a.district),
                    districtOrder.indexOf(b.district)
                ) ||
                d3.ascending(
                    typeOrder[a.station_type],
                    typeOrder[b.station_type]
                ) ||
                d3.ascending(
                    +a.id.slice(1),
                    +b.id.slice(1)
                )
            )
        );

    const byPair = new Map();

    links.forEach(d => {
        byPair.set(
            d.source + "|" + d.target,
            d
        );

        byPair.set(
            d.target + "|" + d.source,
            d
        );
    });

    const cells = ordered.flatMap(
        row => ordered.map(
            col => ({
                row,
                col,
                link: byPair.get(
                    row.id + "|" + col.id
                )
            })
        )
    );

    const margin = {
        top: 125,
        right: 25,
        bottom: 25,
        left: 125
    };

    const size = 600;
    const width = (
        margin.left +
        size +
        margin.right
    );
    const height = (
        margin.top +
        size +
        margin.bottom
    );

    const x = d3.scaleBand()
        .domain(
            ordered.map(d => d.id)
        )
        .range([0, size])
        .padding(0.04);

    const y = d3.scaleBand()
        .domain(
            ordered.map(d => d.id)
        )
        .range([0, size])
        .padding(0.04);

    const opacity = d3.scaleLinear()
        .domain(
            d3.extent(
                links,
                d => d.travel_time_min
            )
        )
        .range([0.35, 1]);

    const svg = d3.select("#matrix")
        .append("svg")
        .attr("class", "matrix-svg")
        .attr("width", width)
        .attr("height", height)
        .attr(
            "viewBox",
            "0 0 " + width + " " + height
        )
        .attr("role", "img")
        .attr(
            "aria-label",
            "Adjacency matrix of the urban transit network"
        );

    const matrix = svg.append("g")
        .attr(
            "transform",
            (
                "translate(" +
                margin.left +
                "," +
                margin.top +
                ")"
            )
        );

    const cell = matrix.selectAll("rect")
        .data(cells)
        .join("rect")
        .attr("class", "matrix-cell")
        .attr(
            "x",
            d => x(d.col.id)
        )
        .attr(
            "y",
            d => y(d.row.id)
        )
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr(
            "fill",
            d => (
                d.row.id === d.col.id
                ? districtColors[d.row.district]
                : (
                    d.link
                    ? routeColors[d.link.route_type]
                    : "#f3f4f6"
                )
            )
        )
        .attr(
            "fill-opacity",
            d => (
                d.row.id === d.col.id
                ? 0.3
                : (
                    d.link
                    ? opacity(d.link.travel_time_min)
                    : 1
                )
            )
        );

    const rowLabels = matrix.append("g")
        .selectAll("text")
        .data(ordered)
        .join("text")
        .attr("class", "matrix-label")
        .attr("x", -7)
        .attr(
            "y",
            d => (
                y(d.id) +
                y.bandwidth() / 2 +
                3
            )
        )
        .attr("text-anchor", "end")
        .attr(
            "fill",
            d => districtColors[d.district]
        )
        .text(d => d.id);

    const columnLabels = matrix.append("g")
        .selectAll("text")
        .data(ordered)
        .join("text")
        .attr("class", "matrix-label")
        .attr(
            "transform",
            d => (
                "translate(" +
                (
                    x(d.id) +
                    x.bandwidth() / 2
                ) +
                ",-7) rotate(-90)"
            )
        )
        .attr("text-anchor", "start")
        .attr(
            "fill",
            d => districtColors[d.district]
        )
        .text(d => d.id);

    districtOrder.forEach(district => {
        const members = ordered.filter(
            d => d.district === district
        );

        const start = x(members[0].id);

        const end = (
            x(
                members[
                    members.length - 1
                ].id
            ) +
            x.bandwidth()
        );

        matrix.append("line")
            .attr("x1", start)
            .attr("x2", end)
            .attr("y1", -31)
            .attr("y2", -31)
            .attr(
                "stroke",
                districtColors[district]
            )
            .attr("stroke-width", 4);

        matrix.append("text")
            .attr(
                "class",
                "matrix-block-label"
            )
            .attr(
                "x",
                (start + end) / 2
            )
            .attr("y", -39)
            .attr("text-anchor", "middle")
            .text(district);
    });

    cell
        .on(
            "mouseenter",
            (event, d) => {
                cell
                    .attr(
                        "stroke",
                        other => (
                            other.row.id === d.row.id ||
                            other.col.id === d.col.id
                            ? "#9ca3af"
                            : "none"
                        )
                    )
                    .attr(
                        "stroke-width",
                        other => (
                            other.row.id === d.row.id ||
                            other.col.id === d.col.id
                            ? 0.45
                            : 0
                        )
                    );

                rowLabels.attr(
                    "font-weight",
                    station => (
                        station.id === d.row.id
                        ? 700
                        : null
                    )
                );

                columnLabels.attr(
                    "font-weight",
                    station => (
                        station.id === d.col.id
                        ? 700
                        : null
                    )
                );

                let text;

                if (d.link) {
                    text = (
                        '<div class="tooltip-title">' +
                        d.row.station_name +
                        " ↔ " +
                        d.col.station_name +
                        "</div>" +
                        "Route type: " +
                        d.link.route_type +
                        "<br>Travel time: " +
                        d.link.travel_time_min +
                        " minutes"
                    );
                } else if (
                    d.row.id === d.col.id
                ) {
                    text = (
                        '<div class="tooltip-title">' +
                        d.row.station_name +
                        "</div>" +
                        "District: " +
                        d.row.district +
                        "<br>Station type: " +
                        d.row.station_type +
                        "<br>Daily passengers: " +
                        d3.format(",")(
                            d.row.daily_passengers
                        )
                    );
                } else {
                    text = (
                        '<div class="tooltip-title">' +
                        d.row.station_name +
                        " ↔ " +
                        d.col.station_name +
                        "</div>" +
                        "No direct transit connection"
                    );
                }

                showTooltip(event, text);
            }
        )
        .on("mousemove", moveTooltip)
        .on(
            "mouseleave",
            () => {
                cell
                    .attr("stroke", "none")
                    .attr("stroke-width", 0);

                rowLabels.attr(
                    "font-weight",
                    null
                );

                columnLabels.attr(
                    "font-weight",
                    null
                );

                hideTooltip();
            }
        );
}
