from pathlib import Path
import re
import pandas as pd
from transformers import pipeline

def prepare(text):
    text = re.sub(r"@\w+", "@user", str(text))
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)

    return re.sub(r"\s+", " ", text).strip()


df = pd.read_csv("../data/tweets.csv")

print("Raw shape:", df.shape)
print("Missing values:\n", df.isna().sum())
print(
    "Duplicate rows:",
    df.duplicated().sum(),
    "Duplicate IDs:",
    df["id"].duplicated().sum()
)

df["id"] = pd.to_numeric(
    df["id"],
    errors="coerce"
)

df["text"] = (
    df["text"]
    .astype("string")
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

df = df.dropna(subset=["id", "text"])

df = (
    df[df["text"].str.len() > 0]
    .drop_duplicates()
    .drop_duplicates("id")
)

df["keyword"] = (
    df["keyword"]
    .astype("string")
    .str.replace("%20", " ", regex=False)
    .str.strip()
    .str.lower()
    .fillna("unknown")
)

df["location"] = (
    df["location"]
    .astype("string")
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
    .fillna("Unknown")
)

df["target"] = (
    pd.to_numeric(
        df["target"],
        errors="coerce"
    )
    .astype("Int64")
)

df = df.rename(
    columns={
        "id": "tweet_id",
        "text": "tweet_text"
    }
)

df["tweet_id"] = df["tweet_id"].astype("int64")

texts = df["tweet_text"].apply(prepare).tolist()

model = pipeline(
    "sentiment-analysis",
    model=(
        "cardiffnlp/"
        "twitter-roberta-base-sentiment-latest"
    ),
    top_k=None
)

scores = [
    {
        x["label"].lower(): float(x["score"])
        for x in result
    }
    for result in model(
        texts,
        truncation=True,
        batch_size=32
    )
]

for label in ("negative", "neutral", "positive"):
    df[f"sentiment_{label}"] = [
        score.get(label, 0.0)
        for score in scores
    ]

df["sentiment"] = [
    max(score, key=score.get).capitalize()
    for score in scores
]

df["sentiment_score"] = (
    df["sentiment_positive"]
    - df["sentiment_negative"]
)

cols = [
    "tweet_id",
    "keyword",
    "location",
    "tweet_text",
    "target",
    "sentiment",
    "sentiment_score",
    "sentiment_negative",
    "sentiment_neutral",
    "sentiment_positive"
]

df[cols].to_csv(
    "../data/lab4_clean_tweets.csv",
    index=False
)

summary = (
    df.groupby(
        "keyword",
        as_index=False
    )
    .agg(
        tweet_count=("tweet_id", "size"),
        mean_sentiment=("sentiment_score", "mean")
    )
    .query("tweet_count >= 25")
    .sort_values(
        "tweet_count",
        ascending=False
    )
    .head(30)
)

summary.to_csv(
    "../data/lab4_sentiment_by_keyword.csv",
    index=False
)