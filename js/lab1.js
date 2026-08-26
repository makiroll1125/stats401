async function barChart() {
    const data = await d3.csv("../data/students.csv", d => ({
        name: d.name,
        score: +d.score
    }));

    const width = 600;
    const height = 600;
    const margin = 20;

    const x = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin, width - margin])
        .padding(0.2);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.score)])
        .range([height - margin, margin]);

    const svg = d3.select("#dataviz")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("font-size", "25px")
        .attr("font-weight", "bold")
        .text("Student Scores");

    svg.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", d => x(d.name))
        .attr("y", d => y(d.score))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.score));

    svg.append("g")
        .attr("transform", `translate(0,${y(0)})`)
        .call(
            d3.axisBottom(x)
                .tickFormat(name => {
                    const d = data.find(d => d.name === name);
                    return `${name}, ${d.score}`;
                })
        );

    svg.append("g")
        .attr("transform", `translate(${margin},0)`)
        .call(d3.axisLeft(y));
}

barChart();