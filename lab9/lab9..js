const location = [
    121.47,
    31.23
];

const projection =
    d3.geoNaturalEarth1();

const width = 1000;
const height = 600;

projection.fitSize(
    [width, height],
    geoData
);

const path =
    d3.geoPath()
    .projection(projection);

svg.selectAll(".country")
    .data(geoData.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path);

Promise.all([
    d3.json("../data/world.geojson"),

    d3.csv(
        "../data/country_data.csv",
        d => ({
            iso3: d.iso3,
            value: +d.value
        })
    )
])
.then(([geoData, stats]) => {

    const valueById =
        new Map(
            stats.map(
                d => [
                    d.iso3,
                    d.value
                ]
            )
        );

    geoData.features.forEach(
        feature => {

            feature.properties.value =
                valueById.get(
                    feature.properties.iso3
                );
        }
    );

});

const colorScale =
    d3.scaleSequential(
        d3.interpolateBlues
    )
    .domain([
        0,
        d3.max(
            geoData.features,
            d =>
                d.properties.value || 0
        )
    ]);

const countries =
    svg.selectAll(".country")
    .data(geoData.features)
    .join("path")
    .attr("d", path)
    .attr(
        "fill",
        d => {

            const value =
                d.properties.value;

            return value == null
                ? "#eee"
                : colorScale(value);
        }
    )
    .attr("stroke", "white");

const tooltip =
    d3.select("#tooltip");

countries
    .on(
        "mouseover",
        function(event, d) {

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>
                        ${d.properties.name}
                    </strong>
                    <br>
                    Value:
                    ${d.properties.value}
                `);
        }
    )
    .on(
        "mousemove",
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
        "mouseout",
        function() {

            tooltip.style(
                "opacity",
                0
            );
        }
    );

countries
    .on(
        "mouseover.highlight",
        function() {

            d3.select(this)
                .attr("stroke", "black")
                .attr("stroke-width", 2);
        }
    )
    .on(
        "mouseout.highlight",
        function() {

            d3.select(this)
                .attr("stroke", "white")
                .attr("stroke-width", 1);
        }
    );

const zoom =
    d3.zoom()
    .scaleExtent([1, 8])
    .on(
        "zoom",
        function(event) {

            mapGroup.attr(
                "transform",
                event.transform
            );
        }
    );

svg.call(zoom);

