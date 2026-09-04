d3.csv(
    "../data/lab4_sentiment_by_keyword.csv",
    d => ({
        keyword: d.keyword,
        tweet_count: +d.tweet_count,
        mean_sentiment: +d.mean_sentiment
    })
)
.then(data => {
    const width = 900;
    const height = 540;

    const margin = {
        top: 45,
        right: 35,
        bottom: 65,
        left: 70
    };

    const svg = d3.select("#chart")
        .append("svg")
        .attr(
            "viewBox",
            `0 0 ${width} ${height}`
        )
        .attr("role", "img")
        .attr(
            "aria-label",
            "Average model-estimated sentiment by tweet keyword"
        );

    const x = d3.scaleLinear()
        .domain(
            d3.extent(
                data,
                d => d.mean_sentiment
            )
        )
        .nice()
        .range([
            margin.left,
            width - margin.right
        ]);

    const y = d3.scaleLinear()
        .domain([
            0,
            d3.max(
                data,
                d => d.tweet_count
            )
        ])
        .nice()
        .range([
            height - margin.bottom,
            margin.top
        ]);

    const r = d3.scaleSqrt()
        .domain(
            d3.extent(
                data,
                d => d.tweet_count
            )
        )
        .range([5, 13]);

    const color = d3.scaleLinear()
        .domain([-1, 0, 1])
        .range([
            "#c0392b",
            "#888",
            "#238b45"
        ]);

    svg.append("g")
        .attr(
            "transform",
            `translate(0,${height - margin.bottom})`
        )
        .call(d3.axisBottom(x));

    svg.append("g")
        .attr(
            "transform",
            `translate(${margin.left},0)`
        )
        .call(d3.axisLeft(y));

    if (
        x.domain()[0] <= 0 &&
        x.domain()[1] >= 0
    ) {
        svg.append("line")
            .attr("x1", x(0))
            .attr("x2", x(0))
            .attr("y1", margin.top)
            .attr(
                "y2",
                height - margin.bottom
            )
            .attr("stroke", "#aaa")
            .attr("stroke-dasharray", "4 4");
    }

    const tip = d3.select("#tooltip");

    svg.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr(
            "cx",
            d => x(d.mean_sentiment)
        )
        .attr(
            "cy",
            d => y(d.tweet_count)
        )
        .attr(
            "r",
            d => r(d.tweet_count)
        )
        .attr(
            "fill",
            d => color(d.mean_sentiment)
        )
        .attr("opacity", 0.8)
        .on(
            "mousemove",
            (event, d) => tip
                .style("display", "block")
                .style(
                    "left",
                    `${event.pageX + 12}px`
                )
                .style(
                    "top",
                    `${event.pageY - 25}px`
                )
                .html(
                    `<strong>${d.keyword}</strong><br>${d.tweet_count} tweets<br>Mean sentiment: ${d.mean_sentiment.toFixed(3)}`
                )
        )
        .on(
            "mouseleave",
            () => tip.style("display", "none")
        );

    svg.append("g")
        .selectAll("text")
        .data(data)
        .join("text")
        .attr(
            "x",
            d => (
                x(d.mean_sentiment) +
                r(d.tweet_count) +
                3
            )
        )
        .attr(
            "y",
            d => y(d.tweet_count) + 4
        )
        .attr("font-size", 10)
        .text(d => d.keyword);

    svg.append("text")
        .attr(
            "x",
            (
                margin.left +
                width -
                margin.right
            ) / 2
        )
        .attr("y", height - 15)
        .attr("text-anchor", "middle")
        .text(
            "Mean sentiment score (positive probability minus negative probability)"
        );

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr(
            "x",
            -(
                margin.top +
                height -
                margin.bottom
            ) / 2
        )
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .text("Number of tweets");
})
.catch(error => {
    d3.select("#chart")
        .text(
            `Could not load data: ${error.message}`
        );
});
