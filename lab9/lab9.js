const width = 1000;
const height = 520;
const tooltip = d3.select("#tooltip");
const formatGDP = d3.format(",.1f");
const noDataColor = "#cbd3db";
let selectedIso = null;
let hoveredIso = null;
let countries;
let circles;

Promise.all([
    d3.json("world.geojson"),
    d3.csv(
        "../data/lab9_gdp_2025_top50.csv",
        d => ({
            iso3: d.iso3.trim(),
            country: d.country,
            gdp: +d.gdp_2025_billion_usd,
            rank: +d.rank
        })
    )
])
.then(([geoData, stats]) => {
    const valueById = new Map(stats.map(d => [d.iso3, d]));
    const geographicIds = new Set(geoData.features.map(d => d.properties.iso3));
    const unmatched = stats.filter(d => !geographicIds.has(d.iso3));

    if (valueById.size !== stats.length || unmatched.length > 0) {
        throw new Error("GDP join failed for: " + unmatched.map(d => d.iso3).join(", "));
    }

    geoData.features.forEach(feature => {
        feature.properties.gdp = valueById.get(feature.properties.iso3) || null;
    });

    d3.select("#join-status").text(
        stats.length + " of " + stats.length +
        " GDP records matched to map features by ISO-3 code. " +
        (geoData.features.length - stats.length) +
        " other map areas are shown as no data."
    );

    const projection = d3.geoNaturalEarth1()
        .fitExtent([[15, 15], [width - 15, height - 15]], geoData);
    const path = d3.geoPath().projection(projection);
    const minGDP = d3.min(stats, d => d.gdp);
    const maxGDP = d3.max(stats, d => d.gdp);
    const colorScale = d3.scaleSequentialLog(d3.interpolateBlues)
        .domain([minGDP, maxGDP]);

    drawChoropleth(geoData, path, colorScale);
    drawColorLegend(colorScale, minGDP, maxGDP);
    drawCartogram(geoData, path, maxGDP, colorScale);
})
.catch(error => {
    console.error(error);
    d3.select("#join-status")
        .attr("class", "error")
        .text("The maps could not be loaded: " + error.message);
});

function drawChoropleth(geoData, path, colorScale) {
    const svg = d3.select("#choropleth")
        .append("svg")
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("role", "img")
        .attr("aria-label", "World choropleth of 2025 nominal GDP");

    const mapGroup = svg.append("g");

    countries = mapGroup.selectAll(".country")
        .data(geoData.features)
        .join("path")
        .attr("class", "country")
        .attr("d", path)
        .attr("fill", d => d.properties.gdp
            ? colorScale(d.properties.gdp.gdp)
            : noDataColor)
        .attr("tabindex", d => d.properties.gdp ? 0 : null)
        .attr("aria-label", d => countryLabel(d))
        .on("pointerover", function(event, d) {
            hoveredIso = d.properties.gdp ? d.properties.iso3 : null;
            updateHighlight();
            showTooltip(event, d);
        })
        .on("pointermove", moveTooltip)
        .on("pointerout", clearHover)
        .on("focus", function(event, d) {
            hoveredIso = d.properties.iso3;
            updateHighlight();
        })
        .on("blur", clearHover)
        .on("click", function(event, d) {
            event.stopPropagation();
            selectCountry(d);
        })
        .on("keydown", function(event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectCountry(d);
            }
        });

    svg.on("click", function() {
        selectedIso = null;
        updateHighlight();
    });

    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .translateExtent([[0, 0], [width, height]])
        .extent([[0, 0], [width, height]])
        .on("zoom", function(event) {
            mapGroup.attr("transform", event.transform);
        });

    svg.call(zoom);
}

function drawCartogram(geoData, path, maxGDP, colorScale) {
    const features = geoData.features.filter(d => d.properties.gdp);
    const radius = gdp => Math.sqrt(gdp / maxGDP) * 88;

    const nodes = features.map(feature => {
        const center = path.centroid(feature);
        const x = Number.isFinite(center[0]) ? center[0] : width / 2;
        const y = Number.isFinite(center[1]) ? center[1] : height / 2;

        return {
            feature: feature,
            iso3: feature.properties.iso3,
            gdp: feature.properties.gdp.gdp,
            radius: radius(feature.properties.gdp.gdp),
            homeX: x,
            homeY: y,
            x: x,
            y: y
        };
    });

    const simulation = d3.forceSimulation(nodes)
        .force("x", d3.forceX(d => d.homeX).strength(0.25))
        .force("y", d3.forceY(d => d.homeY).strength(0.25))
        .force("collide", d3.forceCollide(d => d.radius + 2).iterations(2))
        .stop();

    for (let i = 0; i < 450; i++) {
        simulation.tick();
    }

    nodes.forEach(d => {
        d.x = Math.max(d.radius + 4, Math.min(width - d.radius - 4, d.x));
        d.y = Math.max(d.radius + 4, Math.min(height - d.radius - 4, d.y));
    });

    const svg = d3.select("#cartogram")
        .append("svg")
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("role", "img")
        .attr("aria-label", "Dorling cartogram with circle area proportional to 2025 nominal GDP");

    svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "#edf3f7");

    circles = svg.selectAll(".economy")
        .data(nodes)
        .join("circle")
        .attr("class", "economy")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", d => d.radius)
        .attr("fill", d => colorScale(d.gdp))
        .attr("tabindex", 0)
        .attr("aria-label", d => countryLabel(d.feature))
        .on("pointerover", function(event, d) {
            hoveredIso = d.iso3;
            updateHighlight();
            showTooltip(event, d.feature);
        })
        .on("pointermove", moveTooltip)
        .on("pointerout", clearHover)
        .on("focus", function(event, d) {
            hoveredIso = d.iso3;
            updateHighlight();
        })
        .on("blur", clearHover)
        .on("click", function(event, d) {
            event.stopPropagation();
            selectCountry(d.feature);
        })
        .on("keydown", function(event, d) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectCountry(d.feature);
            }
        });

    svg.selectAll(".map-label")
        .data(nodes.filter(d => d.radius >= 28))
        .join("text")
        .attr("class", "map-label")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .text(d => d.iso3);

    svg.on("click", function() {
        selectedIso = null;
        updateHighlight();
    });

    drawAreaLegend(radius);
}

function drawColorLegend(colorScale, minGDP, maxGDP) {
    const legendWidth = 390;
    const barWidth = 330;
    const svg = d3.select("#color-legend")
        .append("svg")
        .attr("viewBox", "0 0 " + legendWidth + " 65")
        .attr("width", legendWidth)
        .attr("height", 65);

    const legendScale = d3.scaleLog()
        .domain([minGDP, maxGDP])
        .range([18, 18 + barWidth]);

    svg.selectAll("rect")
        .data(d3.range(barWidth))
        .join("rect")
        .attr("x", d => 18 + d)
        .attr("y", 7)
        .attr("width", 1)
        .attr("height", 17)
        .attr("fill", d => colorScale(legendScale.invert(18 + d)));

    svg.append("g")
        .attr("transform", "translate(0,24)")
        .call(
            d3.axisBottom(legendScale)
                .tickValues([300, 1000, 3000, 10000, 30000])
                .tickFormat(d => "$" + d3.format(",")(d) + "B")
        )
        .selectAll("text")
        .attr("font-size", 11);

    d3.select("#color-legend")
        .append("div")
        .attr("class", "no-data-key")
        .html("<span aria-hidden='true'></span>No data in the top-50 CSV");
}

function drawAreaLegend(radius) {
    const values = [1000, 5000, 20000];
    const positions = [38, 158, 370];
    const svg = d3.select("#area-legend")
        .append("svg")
        .attr("viewBox", "0 0 470 182")
        .attr("width", 470)
        .attr("height", 182);

    svg.selectAll("circle")
        .data(values)
        .join("circle")
        .attr("cx", (d, i) => positions[i])
        .attr("cy", d => 150 - radius(d))
        .attr("r", radius)
        .attr("fill", "#4c91c4")
        .attr("fill-opacity", 0.75)
        .attr("stroke", "#fff");

    svg.selectAll("text")
        .data(values)
        .join("text")
        .attr("x", (d, i) => positions[i])
        .attr("y", 175)
        .attr("text-anchor", "middle")
        .attr("font-size", 12)
        .text(d => "$" + d3.format(",")(d) + "B");
}

function countryLabel(feature) {
    const value = feature.properties.gdp;
    return value
        ? value.country + ": $" + formatGDP(value.gdp) + " billion, rank " + value.rank
        : feature.properties.name + ": no data in the top-50 CSV";
}

function showTooltip(event, feature) {
    const value = feature.properties.gdp;
    tooltip.html("");
    tooltip.append("strong")
        .text(value ? value.country : feature.properties.name);
    tooltip.append("div")
        .text(value
            ? "2025 GDP: $" + formatGDP(value.gdp) + " billion"
            : "No data in the top-50 CSV");
    if (value) {
        tooltip.append("div").text("GDP rank: " + value.rank);
    }
    tooltip.style("opacity", 1);
    moveTooltip(event);
}

function moveTooltip(event) {
    tooltip
        .style("left", Math.max(8, Math.min(window.innerWidth - 210, event.clientX + 14)) + "px")
        .style("top", Math.max(8, Math.min(window.innerHeight - 90, event.clientY + 14)) + "px");
}

function clearHover() {
    hoveredIso = null;
    tooltip.style("opacity", 0);
    updateHighlight();
}

function selectCountry(feature) {
    if (!feature.properties.gdp) return;
    const iso3 = feature.properties.iso3;
    selectedIso = selectedIso === iso3 ? null : iso3;
    updateHighlight();
}

function updateHighlight() {
    const activeIso = hoveredIso || selectedIso;
    if (countries) {
        countries.classed("is-active", d => d.properties.iso3 === activeIso);
    }
    if (circles) {
        circles.classed("is-active", d => d.iso3 === activeIso);
    }
}

d3.select(window).on("keydown.lab9", function(event) {
    if (event.key === "Escape") {
        selectedIso = null;
        hoveredIso = null;
        tooltip.style("opacity", 0);
        updateHighlight();
    }
});
