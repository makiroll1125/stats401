const width = 1000;
const height = 520;
const tooltip = d3.select("#tooltip");
const formatGDP = d3.format(",.1f");
const noDataColor = "#cbd3db";
let selectedIso = null;
let hoveredIso = null;
let countries;
let cartCountries;

Promise.all([
    d3.json("world.geojson"),
    d3.json("world.topojson"),
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
.then(([geoData, topoData, stats]) => {
    const valueById = new Map(stats.map(d => [d.iso3, d]));
    const geographicIds = new Set(geoData.features.map(d => d.properties.iso3));
    const unmatched = stats.filter(d => !geographicIds.has(d.iso3));

    if (valueById.size !== stats.length || unmatched.length > 0) {
        throw new Error("GDP join failed for: " + unmatched.map(d => d.iso3).join(", "));
    }

    geoData.features.forEach(feature => {
        feature.properties.gdp = valueById.get(feature.properties.iso3) || null;
    });

    const projection = d3.geoNaturalEarth1()
        .fitExtent([[15, 15], [width - 15, height - 15]], geoData);
    const path = d3.geoPath().projection(projection);
    const minGDP = d3.min(stats, d => d.gdp);
    const maxGDP = d3.max(stats, d => d.gdp);
    const colorScale = d3.scaleSequentialLog(d3.interpolateBlues)
        .domain([minGDP, maxGDP]);

    drawChoropleth(geoData, path, colorScale);
    drawColorLegend(colorScale, minGDP, maxGDP);
    drawCartogram(geoData, topoData, path, maxGDP, colorScale, valueById);
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

function drawCartogram(geoData, topoData, path, maxGDP, colorScale, valueById) {
    const areaById = new Map(geoData.features.map(d => [
        d.properties.iso3,
        path.area(d)
    ]));
    const usArea = areaById.get("USA");
    const neutralWeight = maxGDP / (5 * usArea);
    const shapes = topoData.objects.countries.geometries;

    shapes.forEach(shape => {
        const iso3 = shape.properties.iso3;
        shape.properties.gdp = valueById.get(iso3) || null;
        shape.properties.displayWeight = shape.properties.gdp
            ? shape.properties.gdp.gdp
            : Math.max(1, areaById.get(iso3) * neutralWeight);
    });

    const holder = document.getElementById("cartogram");
    const observer = new MutationObserver(() => {
        const paths = d3.select(holder).selectAll("path.feature");
        if (paths.size() !== shapes.length) return;
        observer.disconnect();

        cartCountries = paths
            .attr("tabindex", d => d.properties.gdp ? 0 : null)
            .attr("aria-label", countryLabel)
            .on("pointerover.lab9", function(event, d) {
                hoveredIso = d.properties.gdp ? d.properties.iso3 : null;
                updateHighlight();
                showTooltip(event, d);
            })
            .on("pointermove.lab9", moveTooltip)
            .on("pointerout.lab9", clearHover)
            .on("focus.lab9", function(event, d) {
                hoveredIso = d.properties.iso3;
                updateHighlight();
            })
            .on("blur.lab9", clearHover)
            .on("keydown.lab9", function(event, d) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectCountry(d);
                }
            });

        updateHighlight();
    });

    observer.observe(holder, {childList: true, subtree: true});

    new Cartogram(holder)
        .width(width)
        .height(height)
        .projection(path.projection())
        .topoObjectName("countries")
        .iterations(60)
        .value(d => d.properties.displayWeight)
        .color(d => d.properties.gdp
            ? colorScale(d.properties.gdp.gdp)
            : noDataColor)
        .label(() => null)
        .tooltipContent(() => null)
        .onClick(selectCountry)
        .topoJson(topoData);

    d3.select(holder).select("svg")
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("role", "img")
        .attr("aria-label", "World cartogram with country polygon area distorted by 2025 nominal GDP");
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
    if (cartCountries) {
        cartCountries.classed("is-active", d => d.properties.iso3 === activeIso);
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
