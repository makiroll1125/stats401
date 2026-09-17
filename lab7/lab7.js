const sectorOrder = [
    "Manufacturing",
    "Logistics",
    "Retail",
    "Food",
    "Technology",
    "Wholesale",
    "Materials"
];

const transactionTypeOrder = [
    "goods",
    "shipping",
    "components",
    "materials",
    "services"
];

const regionOrder = [
    "Asia",
    "Europe",
    "North America"
];

const sectorColor = d3.scaleOrdinal()
    .domain(sectorOrder)
    .range(d3.schemeTableau10);

const transactionColor = d3.scaleOrdinal()
    .domain(transactionTypeOrder)
    .range([
        "#4e79a7",
        "#f28e2b",
        "#59a14f",
        "#b07aa1",
        "#e15759"
    ]);

const regionSymbol = {
    Asia: d3.symbolCircle,
    Europe: d3.symbolSquare,
    "North America": d3.symbolDiamond
};

const tooltip = d3.select("#tooltip");
const parseDate = d3.timeParse("%Y-%m-%d");
const formatDate = d3.timeFormat("%B %d, %Y");
const formatMoney = d3.format("$,.0f");

Promise.all([
    d3.csv(
        "../data/lab7_assignment_companies.csv"
    ),
    d3.csv(
        "../data/lab7_assignment_transactions_60days.csv",
        d => ({
            date: parseDate(d.date),
            day: +d.day,
            source: d.source,
            target: d.target,
            amount_usd: +d.amount_usd,
            transaction_type: d.transaction_type,
            transaction_count: +d.transaction_count
        })
    )
])
.then(([companies, transactions]) => {
    const width = 960;
    const height = 570;

    const regionX = {
        Asia: 175,
        Europe: 480,
        "North America": 785
    };

    const amountScale = d3.scaleSqrt()
        .domain(
            d3.extent(
                transactions,
                d => d.amount_usd
            )
        )
        .range([2.5, 12]);

    const countOpacity = d3.scaleLinear()
        .domain(
            d3.extent(
                transactions,
                d => d.transaction_count
            )
        )
        .range([0.35, 0.9]);

    const maximumDailyVolume = d3.max(
        d3.rollups(
            transactions.flatMap(
                d => [
                    {
                        day: d.day,
                        company: d.source,
                        value: d.amount_usd
                    },
                    {
                        day: d.day,
                        company: d.target,
                        value: d.amount_usd
                    }
                ]
            ),
            values => d3.sum(values, d => d.value),
            d => d.day,
            d => d.company
        ).flatMap(
            day => day[1].map(
                company => company[1]
            )
        )
    );

    const sizeScale = d3.scaleSqrt()
        .domain([0, maximumDailyVolume])
        .range([7, 25]);

    const dailyTransactions = d3.group(
        transactions,
        d => d.day
    );

    const companyById = new Map(
        companies.map(d => [d.id, d])
    );

    const regionCounts = new Map();

    companies.forEach(d => {
        const index = regionCounts.get(d.region) || 0;

        d.currentVolume = 0;
        d.x = regionX[d.region] +
            (index % 2 === 0 ? -45 : 45);
        d.y = 145 + Math.floor(index / 2) * 175;

        regionCounts.set(d.region, index + 1);
    });

    const svg = d3.select("#network")
        .append("svg")
        .attr("class", "network-svg")
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("width", width)
        .attr("height", height)
        .attr("role", "img")
        .attr(
            "aria-label",
            "Animated daily commercial transaction network"
        );

    svg.selectAll(".region-guide")
        .data(regionOrder)
        .join("text")
        .attr("class", "region-guide")
        .attr("x", d => regionX[d])
        .attr("y", 28)
        .text(d => d);

    svg.selectAll(".region-divider")
        .data([
            (regionX.Asia + regionX.Europe) / 2,
            (regionX.Europe + regionX["North America"]) / 2
        ])
        .join("line")
        .attr("class", "region-divider")
        .attr("x1", d => d)
        .attr("x2", d => d)
        .attr("y1", 42)
        .attr("y2", height - 20)
        .attr("stroke", "#9ca3af")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5 6")
        .attr("opacity", 1)
        .attr("pointer-events", "none");

    const linkGroup = svg.append("g");
    const nodeGroup = svg.append("g");

    let currentDay = 1;
    let currentLinks = [];
    let timer = null;
    let link = linkGroup.selectAll("line");
    let timeGuide;

    const timelineXScale = d3.scaleLinear()
        .domain([1, 60])
        .range([80, 930]);

    const simulation = d3.forceSimulation(companies)
        .force(
            "link",
            d3.forceLink([])
                .id(d => d.id)
                .distance(125)
                .strength(0.18)
        )
        .force("charge", d3.forceManyBody().strength(-320))
        .force(
            "x",
            d3.forceX(d => regionX[d.region])
                .strength(0.16)
        )
        .force(
            "y",
            d3.forceY(height / 2)
                .strength(0.035)
        )
        .force(
            "collision",
            d3.forceCollide()
                .radius(d => sizeScale(d.currentVolume) + 13)
        );

    const node = nodeGroup.selectAll(".network-node")
        .data(companies, d => d.id)
        .join("g")
        .attr("class", "network-node")
        .call(
            d3.drag()
                .on("start", dragStarted)
                .on("drag", dragged)
                .on("end", dragEnded)
        )
        .on("mouseenter", showNodeTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip);

    function nodePath(d) {
        const radius = sizeScale(d.currentVolume);

        return d3.symbol()
            .type(regionSymbol[d.region])
            .size(Math.PI * radius * radius)();
    }

    function labelOffset(d) {
        const radius = sizeScale(d.currentVolume);

        return d.region === "North America"
            ? radius * 1.65
            : d.region === "Europe"
            ? radius * 0.9
            : radius;
    }

    node.append("path")
        .attr("class", "node-shape")
        .attr("d", nodePath)
        .attr("fill", d => sectorColor(d.sector))
        .attr("stroke", "#374151")
        .attr("stroke-width", 2)
        .attr("opacity", 0.35);

    node.append("text")
        .attr("class", "company-label")
        .attr("text-anchor", "middle")
        .attr("y", d => labelOffset(d) + 14)
        .attr("opacity", 0.55)
        .each(function(d) {
            const words = d.company_name.split(" ");
            const label = d3.select(this);

            label.append("tspan")
                .attr("x", 0)
                .text(words[0]);

            label.append("tspan")
                .attr("x", 0)
                .attr("dy", 12)
                .text(words.slice(1).join(" "));
        });

    simulation.on("tick", () => {
        companies.forEach(d => {
            d.x = Math.max(35, Math.min(width - 35, d.x));
            d.y = Math.max(55, Math.min(height - 35, d.y));
        });

        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr(
            "transform",
            d => "translate(" + d.x + "," + d.y + ")"
        );
    });

    function getCompanyId(value) {
        return typeof value === "object"
            ? value.id
            : value;
    }

    function linkKey(d) {
        return [
            getCompanyId(d.source),
            getCompanyId(d.target)
        ]
            .sort()
            .join("-");
    }

    function calculateVolume(
        companyId,
        links
    ) {
        return d3.sum(
            links.filter(
                d =>
                    getCompanyId(d.source) === companyId ||
                    getCompanyId(d.target) === companyId
            ),
            d => d.amount_usd
        );
    }

    function moveTooltip(event) {
        tooltip
            .style("left", event.pageX + 14 + "px")
            .style("top", event.pageY + 14 + "px");
    }

    function hideTooltip() {
        tooltip.style("opacity", 0);
    }

    function showNodeTooltip(event, d) {
        const relationshipCount = currentLinks.filter(
            linkDatum =>
                getCompanyId(linkDatum.source) === d.id ||
                getCompanyId(linkDatum.target) === d.id
        ).length;

        tooltip
            .style("opacity", 1)
            .html(
                '<div class="tooltip-title">' +
                d.company_name +
                "</div>" +
                "Sector: " + d.sector +
                "<br>Region: " + d.region +
                "<br>Current volume: " +
                formatMoney(d.currentVolume) +
                "<br>Active relationships: " +
                relationshipCount
            );

        moveTooltip(event);
    }

    function showLinkTooltip(event, d) {
        const source = companyById.get(
            getCompanyId(d.source)
        );
        const target = companyById.get(
            getCompanyId(d.target)
        );

        tooltip
            .style("opacity", 1)
            .html(
                '<div class="tooltip-title">' +
                source.company_name +
                " – " +
                target.company_name +
                "</div>" +
                "Type: " + d.transaction_type +
                "<br>Amount: " +
                formatMoney(d.amount_usd) +
                "<br>Transactions: " +
                d.transaction_count
            );

        moveTooltip(event);
    }

    function dragStarted(event, d) {
        if (!event.active) {
            simulation.alphaTarget(0.15).restart();
        }

        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragEnded(event, d) {
        if (!event.active) {
            simulation.alphaTarget(0);
        }

        d.fx = null;
        d.fy = null;
    }

    function endpointNode(value) {
        return typeof value === "object"
            ? value
            : companyById.get(value);
    }

    function updateNetwork(links) {
        const activeIds = new Set(
            links.flatMap(
                d => [
                    getCompanyId(d.source),
                    getCompanyId(d.target)
                ]
            )
        );

        companies.forEach(d => {
            d.currentVolume = calculateVolume(
                d.id,
                links
            );
        });

        node.select(".node-shape")
            .interrupt()
            .transition()
            .duration(400)
            .attr(
                "d",
                nodePath
            )
            .attr(
                "opacity",
                d => activeIds.has(d.id) ? 1 : 0.3
            )
            .attr(
                "stroke-width",
                d => activeIds.has(d.id) ? 4 : 2
            );

        node.select("text")
            .interrupt()
            .transition()
            .duration(400)
            .attr(
                "y",
                d => labelOffset(d) + 14
            )
            .attr(
                "opacity",
                d => activeIds.has(d.id) ? 1 : 0.45
            );

        link = linkGroup
            .selectAll(".network-link")
            .data(links, linkKey)
            .join(
                enter => {
                    const entered = enter
                        .append("line")
                        .attr("class", "network-link")
                        .attr(
                            "x1",
                            d => endpointNode(d.source).x
                        )
                        .attr(
                            "y1",
                            d => endpointNode(d.source).y
                        )
                        .attr(
                            "x2",
                            d => endpointNode(d.target).x
                        )
                        .attr(
                            "y2",
                            d => endpointNode(d.target).y
                        )
                        .attr(
                            "stroke",
                            d => transactionColor(
                                d.transaction_type
                            )
                        )
                        .attr(
                            "stroke-width",
                            d => amountScale(d.amount_usd)
                        )
                        .attr("opacity", 0)
                        .on(
                            "mouseenter",
                            showLinkTooltip
                        )
                        .on("mousemove", moveTooltip)
                        .on("mouseleave", hideTooltip);

                    entered
                        .transition()
                        .duration(400)
                        .attr("opacity", 1)
                        .transition()
                        .duration(250)
                        .attr(
                            "opacity",
                            d => countOpacity(
                                d.transaction_count
                            )
                        );

                    return entered;
                },
                update => update
                    .interrupt()
                    .transition()
                    .duration(400)
                    .attr(
                        "stroke",
                        d => transactionColor(
                            d.transaction_type
                        )
                    )
                    .attr(
                        "stroke-width",
                        d => amountScale(d.amount_usd)
                    )
                    .attr(
                        "opacity",
                        d => countOpacity(
                            d.transaction_count
                        )
                    ),
                exit => exit
                    .interrupt()
                    .transition()
                    .duration(400)
                    .attr("opacity", 0)
                    .remove()
            );

        simulation
            .force("link")
            .links(links);

        simulation
            .force("collision")
            .radius(
                d => sizeScale(d.currentVolume) + 13
            );

        simulation
            .alpha(0.3)
            .restart();
    }

    function showDay(day) {
        currentDay = Math.max(
            1,
            Math.min(60, day)
        );

        currentLinks = dailyTransactions.get(currentDay) || [];

        updateNetwork(currentLinks);

        const activeCompanies = new Set(
            currentLinks.flatMap(
                d => [
                    getCompanyId(d.source),
                    getCompanyId(d.target)
                ]
            )
        ).size;

        const totalValue = d3.sum(
            currentLinks,
            d => d.amount_usd
        );

        const date = currentLinks.length
            ? formatDate(currentLinks[0].date)
            : "No transactions";

        d3.select("#current-time")
            .text(
                "Day " + currentDay + " - " + date
            );

        d3.select("#active-companies")
            .text(activeCompanies);

        d3.select("#active-links")
            .text(currentLinks.length);

        d3.select("#total-value")
            .text(formatMoney(totalValue));

        d3.select("#time-slider")
            .property("value", currentDay);

        if (timeGuide) {
            timeGuide
                .attr("x1", timelineXScale(currentDay))
                .attr("x2", timelineXScale(currentDay));
        }
    }

    function play() {
        if (timer) return;

        if (currentDay >= 60) {
            showDay(1);
        }

        timer = d3.interval(
            () => {
                if (currentDay >= 60) {
                    pause();
                    return;
                }

                showDay(currentDay + 1);
            },
            900
        );
    }

    function pause() {
        if (timer) {
            timer.stop();
            timer = null;
        }
    }

    function reset() {
        pause();
        showDay(1);
    }

    d3.select("#play")
        .on("click", play);

    d3.select("#pause")
        .on("click", pause);

    d3.select("#reset")
        .on("click", reset);

    d3.select("#time-slider")
        .on("input", function() {
            pause();
            showDay(+this.value);
        });

    function drawLegend() {
        const legendWidth = 960;
        const legendHeight = 170;

        const legendSvg = d3.select("#network-legend")
            .append("svg")
            .attr("class", "legend-svg")
            .attr(
                "viewBox",
                "0 0 " + legendWidth + " " + legendHeight
            )
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("role", "img")
            .attr(
                "aria-label",
                "Legend for company and transaction encodings"
            );

        legendSvg.append("text")
            .attr("class", "legend-title")
            .attr("x", 20)
            .attr("y", 22)
            .text("Node fill: sector");

        const sectorItem = legendSvg
            .selectAll(".sector-item")
            .data(sectorOrder)
            .join("g")
            .attr("class", "sector-item")
            .attr(
                "transform",
                (d, i) => (
                    "translate(" +
                    (20 + (i % 3) * 155) +
                    "," +
                    (42 + Math.floor(i / 3) * 30) +
                    ")"
                )
            );

        sectorItem.append("circle")
            .attr("r", 7)
            .attr("fill", d => sectorColor(d));

        sectorItem.append("text")
            .attr("class", "legend-label")
            .attr("x", 13)
            .attr("y", 4)
            .text(d => d);

        legendSvg.append("text")
            .attr("class", "legend-title")
            .attr("x", 500)
            .attr("y", 22)
            .text("Link color: transaction type");

        const typeItem = legendSvg
            .selectAll(".type-item")
            .data(transactionTypeOrder)
            .join("g")
            .attr("class", "type-item")
            .attr(
                "transform",
                (d, i) => (
                    "translate(" +
                    (500 + (i % 2) * 205) +
                    "," +
                    (42 + Math.floor(i / 2) * 30) +
                    ")"
                )
            );

        typeItem.append("line")
            .attr("x2", 25)
            .attr("stroke", d => transactionColor(d))
            .attr("stroke-width", 5)
            .attr("stroke-linecap", "round");

        typeItem.append("text")
            .attr("class", "legend-label")
            .attr("x", 34)
            .attr("y", 4)
            .text(d => d);

        legendSvg.append("text")
            .attr("class", "legend-title")
            .attr("x", 20)
            .attr("y", 145)
            .text("Node shape: region");

        const regionItem = legendSvg
            .selectAll(".region-item")
            .data(regionOrder)
            .join("g")
            .attr("class", "region-item")
            .attr(
                "transform",
                (d, i) => (
                    "translate(" +
                    (145 + i * 115) +
                    ",141)"
                )
            );

        regionItem.append("path")
            .attr(
                "d",
                d => d3.symbol()
                    .type(regionSymbol[d])
                    .size(155)()
            )
            .attr("fill", "#d1d5db")
            .attr("stroke", "#374151")
            .attr("stroke-width", 1.5);

        regionItem.append("text")
            .attr("class", "legend-label")
            .attr("x", 15)
            .attr("y", 4)
            .text(d => d);

        legendSvg.append("text")
            .attr("class", "legend-title")
            .attr("x", 500)
            .attr("y", 145)
            .text(
                "Node area: daily volume; link width: amount; " +
                "link opacity: count"
            );
    }

    function drawTimeline() {
        const chartWidth = 960;
        const chartHeight = 410;
        const left = 80;
        const right = 30;
        const valueTop = 45;
        const valueBottom = 180;
        const linkTop = 240;
        const linkBottom = 350;

        const dailyData = d3.range(1, 61)
            .map(day => {
                const rows = dailyTransactions.get(day) || [];

                return {
                    day: day,
                    date: rows[0].date,
                    totalValue: d3.sum(
                        rows,
                        d => d.amount_usd
                    ),
                    activeLinks: rows.length
                };
            });

        const valueScale = d3.scaleLinear()
            .domain([
                0,
                d3.max(dailyData, d => d.totalValue)
            ])
            .nice()
            .range([valueBottom, valueTop]);

        const linkScale = d3.scaleLinear()
            .domain([
                0,
                d3.max(dailyData, d => d.activeLinks)
            ])
            .nice()
            .range([linkBottom, linkTop]);

        const timelineSvg = d3.select("#timeline")
            .append("svg")
            .attr("class", "timeline-svg")
            .attr(
                "viewBox",
                "0 0 " + chartWidth + " " + chartHeight
            )
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("role", "img")
            .attr(
                "aria-label",
                "Static time series of daily transaction value and active relationships"
            );

        timelineSvg.append("g")
            .attr("class", "grid")
            .attr(
                "transform",
                "translate(" + left + ",0)"
            )
            .call(
                d3.axisLeft(valueScale)
                    .ticks(4)
                    .tickSize(-(chartWidth - left - right))
                    .tickFormat("")
            );

        timelineSvg.append("g")
            .attr("class", "grid")
            .attr(
                "transform",
                "translate(" + left + ",0)"
            )
            .call(
                d3.axisLeft(linkScale)
                    .ticks(4)
                    .tickSize(-(chartWidth - left - right))
                    .tickFormat("")
            );

        timelineSvg.append("g")
            .attr("class", "axis")
            .attr(
                "transform",
                "translate(" + left + ",0)"
            )
            .call(
                d3.axisLeft(valueScale)
                    .ticks(4)
                    .tickFormat(d3.format("$.2s"))
            );

        timelineSvg.append("g")
            .attr("class", "axis")
            .attr(
                "transform",
                "translate(" + left + ",0)"
            )
            .call(
                d3.axisLeft(linkScale)
                    .ticks(5)
                    .tickFormat(d3.format("d"))
            );

        timelineSvg.append("g")
            .attr("class", "axis")
            .attr(
                "transform",
                "translate(0," + linkBottom + ")"
            )
            .call(
                d3.axisBottom(timelineXScale)
                    .ticks(10)
                    .tickFormat(d3.format("d"))
            );

        timelineSvg.append("text")
            .attr("class", "timeline-title")
            .attr("x", left)
            .attr("y", 24)
            .text("Total transaction value");

        timelineSvg.append("text")
            .attr("class", "timeline-title")
            .attr("x", left)
            .attr("y", 222)
            .text("Active relationships");

        timelineSvg.append("text")
            .attr("class", "timeline-label")
            .attr("x", (left + chartWidth - right) / 2)
            .attr("y", 392)
            .attr("text-anchor", "middle")
            .text("Day");

        const valueLine = d3.line()
            .x(d => timelineXScale(d.day))
            .y(d => valueScale(d.totalValue));

        const activeLine = d3.line()
            .x(d => timelineXScale(d.day))
            .y(d => linkScale(d.activeLinks));

        timelineSvg.append("path")
            .datum(dailyData)
            .attr("fill", "none")
            .attr("stroke", "#2563eb")
            .attr("stroke-width", 2.5)
            .attr("d", valueLine);

        timelineSvg.append("path")
            .datum(dailyData)
            .attr("fill", "none")
            .attr("stroke", "#ea580c")
            .attr("stroke-width", 2.5)
            .attr("d", activeLine);

        timelineSvg.selectAll(".value-point")
            .data(dailyData)
            .join("circle")
            .attr("class", "value-point")
            .attr("cx", d => timelineXScale(d.day))
            .attr("cy", d => valueScale(d.totalValue))
            .attr("r", 2.5)
            .attr("fill", "#2563eb");

        timelineSvg.selectAll(".link-point")
            .data(dailyData)
            .join("circle")
            .attr("class", "link-point")
            .attr("cx", d => timelineXScale(d.day))
            .attr("cy", d => linkScale(d.activeLinks))
            .attr("r", 2.5)
            .attr("fill", "#ea580c");

        timeGuide = timelineSvg.append("line")
            .attr("class", "time-guide")
            .attr("x1", timelineXScale(currentDay))
            .attr("x2", timelineXScale(currentDay))
            .attr("y1", valueTop)
            .attr("y2", linkBottom);

        timelineSvg.append("rect")
            .attr("class", "timeline-overlay")
            .attr("x", left)
            .attr("y", 25)
            .attr("width", chartWidth - left - right)
            .attr("height", linkBottom - 25)
            .on("mousemove", function(event) {
                const [mouseX] = d3.pointer(event, this);
                const day = Math.max(
                    1,
                    Math.min(
                        60,
                        Math.round(
                            timelineXScale.invert(mouseX)
                        )
                    )
                );
                const d = dailyData[day - 1];

                tooltip
                    .style("opacity", 1)
                    .html(
                        '<div class="tooltip-title">Day ' +
                        d.day +
                        " - " +
                        formatDate(d.date) +
                        "</div>" +
                        "Total value: " +
                        formatMoney(d.totalValue) +
                        "<br>Active relationships: " +
                        d.activeLinks
                    );

                moveTooltip(event);
            })
            .on("mouseleave", hideTooltip)
            .on("click", function(event) {
                const [mouseX] = d3.pointer(event, this);
                const day = Math.max(
                    1,
                    Math.min(
                        60,
                        Math.round(
                            timelineXScale.invert(mouseX)
                        )
                    )
                );

                pause();
                showDay(day);
            });
    }

    drawLegend();
    drawTimeline();
    showDay(1);
})
.catch(error => {
    console.error(error);

    d3.selectAll("#network, #timeline")
        .append("p")
        .attr("class", "error")
        .text(
            "The commercial network data could not be loaded. " +
            "Please serve this folder through a local web server."
        );
});
