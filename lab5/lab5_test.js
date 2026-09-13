Promise.all([
    d3.csv(
        "../data/lab5_small_nodes.csv",
        d => ({
            id: d.id,
            name: d.name,
            group: d.group,
            activity_count: +d.activity_count,
            level: +d.level
        })
    ),
    d3.csv(
        "../data/lab5_small_links.csv",
        d => ({
            source: d.source,
            target: d.target,
            weight: +d.weight,
            type: d.type
        })
    )
])
.then(([nodes, links]) => {

    console.log(nodes);
    console.log(links);

});

const width = 900;
const height = 600;

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

const simulation = d3.forceSimulation(nodes)
    .force(
        "link",
        d3.forceLink(links)
            .id(d => d.id)
            .distance(100)
    )
    .force(
        "charge",
        d3.forceManyBody()
            .strength(-250)
    )
    .force(
        "center",
        d3.forceCenter(
            width / 2,
            height / 2
        )
    )
    .force(
        "collision",
        d3.forceCollide()
            .radius(25)
    );

const link = svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6);

const node = svg.append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 10)
    .attr("fill", "steelblue");

simulation.on(
    "tick",
    () => {

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    }
);

const sizeScale = d3.scaleSqrt()
    .domain(
        d3.extent(
            nodes,
            d => d.activity_count
        )
    )
    .range([6, 18]);

node.attr(
    "r",
    d => sizeScale(
        d.activity_count
    )
);

const groups = Array.from(
    new Set(
        nodes.map(d => d.group)
    )
);

const colorScale = d3.scaleOrdinal()
    .domain(groups)
    .range(d3.schemeTableau10);

node.attr(
    "fill",
    d => colorScale(d.group)
);

const linkWidthScale = d3.scaleLinear()
    .domain(
        d3.extent(
            links,
            d => d.weight
        )
    )
    .range([1, 6]);

link.attr(
    "stroke-width",
    d => linkWidthScale(d.weight)
);

const linkTypes = Array.from(
    new Set(
        links.map(d => d.type)
    )
);

const linkColorScale = d3.scaleOrdinal()
    .domain(linkTypes)
    .range(d3.schemeSet2);

link.attr(
    "stroke",
    d => linkColorScale(d.type)
);

const label = svg.append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .text(d => d.name)
    .attr("font-size", 12)
    .attr("dx", 12)
    .attr("dy", 4);

simulation.on(
    "tick",
    () => {

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        label
            .attr("x", d => d.x)
            .attr("y", d => d.y);
    }
);

function dragStarted(
    event,
    d
) {

    if (!event.active) {
        simulation
            .alphaTarget(0.3)
            .restart();
    }

    d.fx = d.x;
    d.fy = d.y;
}

function dragged(
    event,
    d
) {

    d.fx = event.x;
    d.fy = event.y;
}

function dragEnded(
    event,
    d
) {

    if (!event.active) {
        simulation
            .alphaTarget(0);
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

node.on(
    "mouseover",
    function(event, d) {

        node.attr(
            "opacity",
            other =>
                (
                    other.id === d.id ||
                    isConnected(d, other)
                )
                ? 1
                : 0.15
        );

        link.attr(
            "opacity",
            l =>
                (
                    l.source.id === d.id ||
                    l.target.id === d.id
                )
                ? 1
                : 0.1
        );

        label.attr(
            "opacity",
            other =>
                (
                    other.id === d.id ||
                    isConnected(d, other)
                )
                ? 1
                : 0.15
        );
    }
);

node.on(
    "mouseout",
    function() {

        node.attr("opacity", 1);
        link.attr("opacity", 0.6);
        label.attr("opacity", 1);
    }
);

node
    .on(
        "mouseover.tooltip",
        function(event, d) {

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.name}</strong>
                    <br>
                    Group: ${d.group}
                    <br>
                    Activity: ${d.activity_count}
                    <br>
                    Level: ${d.level}
                `);
        }
    )
    .on(
        "mousemove.tooltip",
        function(event) {

            tooltip
                .style(
                    "left",
                    `${event.pageX + 10}px`
                )
                .style(
                    "top",
                    `${event.pageY + 10}px`
                );
        }
    )
    .on(
        "mouseout.tooltip",
        function() {

            tooltip.style("opacity", 0);
        }
    );

const matrixData = [];

nodes.forEach(
    rowNode => {

        nodes.forEach(
            colNode => {

                const foundLink =
                    links.find(
                        link =>
                            (
                                link.source.id === rowNode.id &&
                                link.target.id === colNode.id
                            )
                            ||
                            (
                                link.source.id === colNode.id &&
                                link.target.id === rowNode.id
                            )
                    );

                matrixData.push({
                    row: rowNode.id,
                    col: colNode.id,
                    weight:
                        foundLink
                        ? foundLink.weight
                        : 0,
                    type:
                        foundLink
                        ? foundLink.type
                        : null
                });
            }
        );
    }
);

const matrixSize = 500;

const matrixX = d3.scaleBand()
    .domain(nodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.02);

const matrixY = d3.scaleBand()
    .domain(nodes.map(d => d.id))
    .range([0, matrixSize])
    .padding(0.02);

const matrixSvg = d3.select("#matrix")
    .append("svg")
    .attr("width", 650)
    .attr("height", 650);

const matrixGroup =
    matrixSvg.append("g")
    .attr(
        "transform",
        "translate(100,50)"
    );

matrixGroup
    .selectAll("rect")
    .data(matrixData)
    .join("rect")
    .attr(
        "x",
        d => matrixX(d.col)
    )
    .attr(
        "y",
        d => matrixY(d.row)
    )
    .attr(
        "width",
        matrixX.bandwidth()
    )
    .attr(
        "height",
        matrixY.bandwidth()
    )
    .attr(
        "fill",
        d =>
            d.weight > 0
            ? "steelblue"
            : "#f3f3f3"
    );

const opacityScale =
    d3.scaleLinear()
    .domain(
        d3.extent(
            links,
            d => d.weight
        )
    )
    .range([0.25, 1]);

// // Sample implementation:
// Promise.all([
//     d3.csv("../data/lab5_small_nodes.csv"),
//     d3.csv("../data/lab5_small_links.csv")
// ])
// .then(([nodes, links]) => {

//     // 1. convert data types
//     // 2. create SVG
//     // 3. create scales
//     // 4. draw links
//     // 5. draw nodes
//     // 6. draw labels
//     // 7. create force simulation
//     // 8. update positions on tick
//     // 9. add dragging
//     // 10. add highlighting
//     // 11. add tooltips

// });