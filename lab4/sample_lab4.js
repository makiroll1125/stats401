d3.csv(
    "../data/lab4_clean_tweets.csv",
    d => ({
        ...d,
        likes: +d.likes,
        retweets: +d.retweets,
        sentiment_score:
            +d.sentiment_score
    })
)
.then(data => {

    console.log(data);

});