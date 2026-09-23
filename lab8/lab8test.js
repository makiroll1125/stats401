d3.csv(
    "../data/lab8_embedding_map.csv",
    d => ({
        ...d,
        x: +d.x,
        y: +d.y,
        word_count: +d.word_count,
        cluster: +d.cluster
    })
)
.then(data => {
    drawSemanticMap(data);
});

const xScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.x))
    .range([50, 850]);

const yScale = d3.scaleLinear()
    .domain(d3.extent(data, d => d.y))
    .range([600, 50]);

const points = svg
    .selectAll(".passage")
    .data(data)
    .join("circle")
    .attr("class", "passage")
    .attr("cx", d => xScale(d.x))
    .attr("cy", d => yScale(d.y))
    .attr("r", 5);

points.on("click", function(event, d) {

    d3.select("#detail-panel")
        .html(`
            <h3>${d.section}</h3>
            <p>Topic: ${d.cluster_name}</p>
            <p>Page: ${d.page}</p>
            <p>${d.text}</p>
        `);
});

d3.select("#search")
    .on("input", function() {

        const query =
            this.value.toLowerCase().trim();

        points.attr(
            "opacity",
            d =>
                query === ""
                ||
                d.text.toLowerCase()
                    .includes(query)
                ? 1
                : 0.08
        );
    });

matrix_df = (
    df
    .groupby(
        ["section", "cluster_name"]
    )
    .size()
    .reset_index(name="count")
)

matrix_df.to_csv(
    "../data/lab8_topic_section_matrix.csv",
    index=False
)

