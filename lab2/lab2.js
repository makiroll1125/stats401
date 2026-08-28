async function bubbleChart() {
    const data = await d3.csv("../data/cities_multivariate.csv", d => ({
        city: d.city,
        population: +d.population,
        temp_c: +d.temp_c,
        development_level: d.development_level,
        region: d.region
    }));

    const width = 800;
    const height = 500;
    const margin = {
        top: 40,
        right: 40,
        bottom: 60,
        left: 100
    };

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population)])
        .nice()
        .range([margin.left, width - margin.right]);

    const y = d3.scalePoint()
        .domain(["Low", "Medium", "High"])
        .range([height - margin.bottom, margin.top])
        .padding(0.5);

    const radius = d3.scaleSqrt()
        .domain([0, d3.max(data, d => d.population)])
        .range([15, 15]);

    const color = d3.scaleSequential()
        .domain(d3.extent(data, d => d.temp_c).reverse())
        .interpolator(d3.interpolateRdBu);

    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x))
        .append("text")
        .attr("x", width / 2)
        .attr("y", 45)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .text("Population (millions)");

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -70)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .text("Development Level");

    const direction = {
        North: 0,
        East: 90,
        South: 180,
        West: 270
    };

    svg.selectAll(".bubble")
        .data(data)
        .join("path")
        .attr("class", "bubble")
        .attr("d", d => {
            const r = radius(d.population);

            return `
                M 0 ${-r}
                L ${r} ${r}
                L ${-r} ${r}
                Z
            `;
        })
        .attr("transform", d =>
            `translate(${x(d.population)},${y(d.development_level)}) rotate(${direction[d.region]})`
        )
        .attr("fill", d => color(d.temp_c))

    const tooltip = d3.select("body")
        .append("div")
        .style("position", "absolute")
        .style("opacity", 0)
        .style("background", "white")
        .style("padding", "8px")
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px")
        .style("pointer-events", "none");

    svg.selectAll(".bubble")
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("stroke-width", 3);

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.city}</strong><br>
                    Population: ${d.population} million<br>
                    Temperature: ${d.temp_c}°C<br>
                    Development: ${d.development_level}<br>
                    Region: ${d.region}
                `)
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 30}px`);
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("stroke-width", 1);

            tooltip.style("opacity", 0);
        });
}

bubbleChart();