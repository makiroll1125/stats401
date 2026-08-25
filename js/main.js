console.log("Hello STATS 401!");
let course = "STATS 401";
let students = 40;

console.log(course);
console.log(students);
console.log("D3 version:", d3.version);
d3.select("#message")
    .text("This text was changed using D3!");

const svg = d3.select("#svg-demo")
    .append("svg")
    .attr("width", 600)
    .attr("height", 300);

svg.append("circle")
    .attr("cx", 100)
    .attr("cy", 100)
    .attr("r", 40)
    .attr("fill", "steelblue");

// svg.append("rect")
//     .attr("x", 200)
//     .attr("y", 60)
//     .attr("width", 120)
//     .attr("height", 80)
//     .attr("fill", "orange");

const values = [10, 20, 30, 40, 50];
svg.selectAll("circle")
    .data(values)
    .join("circle")
    .attr("cx", (d, i) => 60 + i * 100)
    .attr("cy", 100)
    .attr("r", d => d / 2)
    .attr("fill", "steelblue");

d3.csv("data/students.csv")
    .then(data => {

        console.log(data);

    });

d3.csv("data/students.csv")
    .then(data => {

        console.log(data[0]);
        console.log(typeof data[0].score);

    });

d3.csv("data/students.csv")
    .then(data => {

        data.forEach(d => {
            d.score = +d.score;
        });

        console.log(data);

    });

d3.csv("data/students.csv", d => {

    return {
        name: d.name,
        score: +d.score
    };

}).then(data => {

    console.log(data);

});

d3.json("data/students.json")
    .then(data => {

        console.log(data);

    });

async function loadData() {

    const data = await d3.csv(
        "data/students.csv",
        d => ({
            name: d.name,
            score: +d.score
        })
    );

    console.log(data);

}

loadData();