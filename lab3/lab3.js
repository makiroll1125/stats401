d3.csv("../data/lab3_data.csv").then(function(data) {
    const table = d3.select("#data-table");
    const columns = ["id", "name", "height", "weight", "types"];

    const headerRow = table.select("thead")
        .append("tr");

    headerRow.selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .text(d => d)
        .style("cursor", "pointer")
        .on("click", function(event, column) {
            const ascending = table.attr("data-sort-column") !== column ||
                              table.attr("data-sort-direction") === "descending";

            data.sort((a, b) => {
                let valueA = a[column];
                let valueB = b[column];

                if (column === "id" || column === "height" || column === "weight") {
                    valueA = +valueA;
                    valueB = +valueB;
                } else {
                    valueA = valueA.toLowerCase();
                    valueB = valueB.toLowerCase();
                }

                if (valueA < valueB) return ascending ? -1 : 1;
                if (valueA > valueB) return ascending ? 1 : -1;
                return 0;
            });

            table
                .attr("data-sort-column", column)
                .attr(
                    "data-sort-direction",
                    ascending ? "ascending" : "descending"
                );

            drawRows();
        });

    function drawRows() {
        const rows = table.select("tbody")
            .selectAll("tr")
            .data(data);

        rows.exit().remove();

        const newRows = rows.enter()
            .append("tr");

        newRows.merge(rows)
            .selectAll("td")
            .data(d => columns.map(column => d[column]))
            .join("td")
            .text(d => d);
    }

    drawRows();
});