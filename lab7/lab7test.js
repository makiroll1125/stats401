d3.csv(
    "../data/lab7_historical_weather.csv",
    d => ({
        date: d3.timeParse("%Y-%m-%d")(d.date),
        city: d.city,
        country: d.country,
        temperature_c: +d.temperature_c,
        humidity_pct: +d.humidity_pct,
        wind_speed_mps: +d.wind_speed_mps,
        pressure_hpa: +d.pressure_hpa,
        precipitation_mm: +d.precipitation_mm
    })
)
.then(data => {
    console.log(data);

    const cityData = data
        .filter(d => d.city === "Tokyo")
        .sort(
            (a, b) =>
                d3.ascending(a.date, b.date)
        );

    const width = 900;
    const height = 500;

    const margin = {
        top: 40,
        right: 40,
        bottom: 70,
        left: 70
    };

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const xScale = d3.scaleTime()
        .domain(
            d3.extent(cityData, d => d.date)
        )
        .range([
            margin.left,
            width - margin.right
        ]);

    const yScale = d3.scaleLinear()
        .domain(
            d3.extent(
                cityData,
                d => d.temperature_c
            )
        )
        .nice()
        .range([
            height - margin.bottom,
            margin.top
        ]);

        svg.append("g")
        .attr(
            "transform",
            `translate(0,${height-margin.bottom})`
        )
        .call(d3.axisBottom(xScale));

    svg.append("g")
        .attr(
            "transform",
            `translate(${margin.left},0)`
        )
        .call(d3.axisLeft(yScale));

    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d.temperature_c));

    svg.append("path")
        .datum(cityData)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

    const selectedCities = [
        "Tokyo",
        "London",
        "New York"
    ];

    const filteredData = data.filter(
        d => selectedCities.includes(d.city)
    );

    const grouped = d3.group(
        filteredData,
        d => d.city
    );

    const colorScale = d3.scaleOrdinal()
        .domain(selectedCities)
        .range(d3.schemeTableau10);

    svg.selectAll(".city-line")
        .data(grouped)
        .join("path")
        .attr("class", "city-line")
        .attr("fill", "none")
        .attr(
            "stroke",
            d => colorScale(d[0])
        )
        .attr("stroke-width", 2)
        .attr(
            "d",
            d => line(d[1])
        );

        d3.select("#metric")
        .on("change", function() {
            updateChart(this.value);
        });

    function updateChart(metric) {

        yScale
            .domain(
                d3.extent(
                    filteredData,
                    d => d[metric]
                )
            )
            .nice();

        line.y(
            d => yScale(d[metric])
        );

        svg.selectAll(".city-line")
            .transition()
            .duration(600)
            .attr(
                "d",
                d => line(d[1])
            );
    }

    const bisectDate =
        d3.bisector(d => d.date).center;

    function moved(event) {

        const [mouseX] = d3.pointer(event);

        const date =
            xScale.invert(mouseX);

        const index =
            bisectDate(cityData, date);

        const d = cityData[index];

        tooltip
            .style("opacity", 1)
            .html(`
                <strong>${d.city}</strong><br>
                ${d3.timeFormat("%Y-%m-%d")(d.date)}<br>
                Temperature: ${d.temperature_c} °C<br>
                Humidity: ${d.humidity_pct}%<br>
                Wind: ${d.wind_speed_mps} m/s<br>
                Pressure: ${d.pressure_hpa} hPa
            `);
    }

    const rangeData =
        cityData.filter(
            d =>
                d.date >= startDate &&
                d.date <= endDate
        );

    xScale.domain(
        d3.extent(rangeData, d => d.date)
    );

    yScale
        .domain(
            d3.extent(
                rangeData,
                d => d.temperature_c
            )
        )
        .nice();
        
});

let currentIndex = 0;
let timer = null;

const marker = svg.append("circle")
    .attr("r", 7)
    .attr("fill", "red");

const dateLabel = svg.append("text")
    .attr("x", width - 160)
    .attr("y", 40)
    .attr("font-size", 20);

function showFrame(index) {

    const d = cityData[index];

    marker
        .attr(
            "cx",
            xScale(d.date)
        )
        .attr(
            "cy",
            yScale(d.temperature_c)
        );

    dateLabel.text(
        d3.timeFormat("%Y-%m-%d")(
            d.date
        )
    );

    d3.select("#time-slider")
        .property("value", index);
}

function play() {

    if (timer) return;

    timer = d3.interval(
        () => {

            showFrame(currentIndex);

            currentIndex += 1;

            if (
                currentIndex >=
                cityData.length
            ) {
                pause();
            }

        },
        150
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

    currentIndex = 0;

    showFrame(0);
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

        currentIndex =
            +this.value;

        showFrame(currentIndex);
    });

