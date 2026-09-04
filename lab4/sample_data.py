import pandas as pd

df = pd.read_csv("../data/lab4_dirty_tweets.csv")

print(df.head())
print(df.shape)
print(df.info())
print(df.describe(include="all"))

df = df.dropna(subset=["tweet_text"])
df["retweets"] = df["retweets"].fillna(0)

print(df.duplicated().sum())
print(df[df.duplicated(keep=False)])

df = df.drop_duplicates()

print(
    df[df.duplicated(
        subset=["tweet_id"],
        keep=False
    )]
)

df = df.drop_duplicates(
    subset=["tweet_id"],
    keep="first"
)

df["likes"] = (
    df["likes"].astype(str)
    .str.replace(",", "", regex=False)
)

df["likes"] = pd.to_numeric(
    df["likes"], errors="coerce"
)

df["retweets"] = pd.to_numeric(
    df["retweets"], errors="coerce"
)

df.loc[df["retweets"] < 0, "retweets"] = pd.NA

df["likes"] = df["likes"].fillna(
    df["likes"].median()
)

df["retweets"] = df["retweets"].fillna(0)

df["created_at"] = pd.to_datetime(
    df["created_at"],
    errors="coerce",
    format="mixed"
)

print(df[df["created_at"].isna()])
df = df.dropna(subset=["created_at"])
df["date"] = df["created_at"].dt.date
df["hour"] = df["created_at"].dt.hour
df["weekday"] = df["created_at"].dt.day_name()
df["platform"] = (
    df["platform"].astype("string")
    .str.strip()
    .str.lower()
)

platform_map = {
    "web": "Web",
    "mobile": "Mobile",
    "ios": "iOS",
    "android": "Android"
}

df["platform"] = df["platform"].map(platform_map)

country_map = {
    "US": "United States",
    "USA": "United States",
    "United States": "United States",
    "us": "United States",
    "U.S.": "United States",
    "UK": "United Kingdom",
    "uk": "United Kingdom",
    "United Kingdom": "United Kingdom",
    "Canada": "Canada",
    "CA": "Canada"
}

df["country"] = df["country"].map(country_map)

df["username"] = (
    df["username"].astype("string")
    .str.strip()
    .str.replace(r"^@", "", regex=True)
    .str.lower()
)

df["tweet_text"] = (
    df["tweet_text"].astype("string")
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

df["tweet_text_raw"] = df["tweet_text"]

df["sentiment_raw"] = (
    df["sentiment_raw"].astype("string")
    .str.strip()
    .str.lower()
)

sentiment_map = {
    "positive": "Positive",
    "pos": "Positive",
    "negative": "Negative",
    "neg": "Negative",
    "neutral": "Neutral"
}

df["sentiment_clean"] = (
    df["sentiment_raw"].map(sentiment_map)
)

import nltk

nltk.download("punkt")
nltk.download("punkt_tab")
nltk.download("stopwords")
nltk.download("wordnet")
nltk.download("omw-1.4")

import re

def normalize_tweet(text):
    text = text.lower()
    text = re.sub(
        r"https?://\S+|www\.\S+",
        " URL ", text
    )
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(
        r"\b\d+(?:\.\d+)?\b",
        " NUMBER ", text
    )
    text = re.sub(r"\s+", " ", text)
    return text.strip()

df["text_normalized"] = (
    df["tweet_text"].apply(normalize_tweet)
)

from nltk.tokenize import word_tokenize

df["tokens"] = (
    df["text_normalized"].apply(word_tokenize)
)

from nltk.corpus import stopwords

stop_words = set(stopwords.words("english"))

def remove_stopwords(tokens):
    return [
        token for token in tokens
        if token not in stop_words
    ]

df["tokens_no_stop"] = (
    df["tokens"].apply(remove_stopwords)
)

from nltk.stem import WordNetLemmatizer

lemmatizer = WordNetLemmatizer()

def lemmatize_tokens(tokens):
    return [
        lemmatizer.lemmatize(token)
        for token in tokens
        if token.isalpha()
    ]

df["tokens_clean"] = (
    df["tokens_no_stop"].apply(lemmatize_tokens)
)

df["text_clean"] = (
    df["tokens_clean"].apply(" ".join)
)

print(
    df[["tweet_text_raw", "text_clean"]]
    .head()
)

from sklearn.feature_extraction.text import CountVectorizer

vectorizer = CountVectorizer(
    min_df=2,
    max_df=0.90,
    lowercase=True
)

dtm = vectorizer.fit_transform(
    df["text_clean"]
)

terms = vectorizer.get_feature_names_out()

print(terms)
print("Vocabulary size:", len(terms))

print(dtm.shape)

dtm_df = pd.DataFrame(
    dtm.toarray(),
    columns=vectorizer.get_feature_names_out()
)

print(dtm_df.head())

from sklearn.feature_extraction.text import TfidfVectorizer

tfidf_vectorizer = TfidfVectorizer(
    min_df=2,
    max_df=0.90
)

tfidf = tfidf_vectorizer.fit_transform(
    df["text_clean"]
)

print(tfidf.shape)
print(
    tfidf_vectorizer.get_feature_names_out()
)

tfidf_df = pd.DataFrame(
    tfidf.toarray(),
    columns=(
        tfidf_vectorizer
        .get_feature_names_out()
    )
)

print(tfidf_df.head())

from transformers import pipeline

sentiment_model = pipeline(
    "sentiment-analysis",
    model=(
        "cardiffnlp/"
        "twitter-roberta-base-sentiment-latest"
    ),
    top_k=None
)

test_tweet = "I absolutely love this new update!"

result = sentiment_model(test_tweet)
print(result)

import re

def prepare_for_roberta(text):
    text = str(text)
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(
        r"https?://\S+|www\.\S+",
        "http",
        text
    )
    return text.strip()


df["sentiment_text"] = (
    df["tweet_text_raw"]
    .fillna("")
    .apply(prepare_for_roberta)
)

results = sentiment_model(
    df["sentiment_text"].tolist(),
    truncation=True,
    batch_size=16
)

def scores_to_dict(scores):
    return {
        item["label"].lower(): item["score"]
        for item in scores
    }

score_dicts = [
    scores_to_dict(scores)
    for scores in results
]


df["sentiment_negative"] = [
    scores.get("negative", 0)
    for scores in score_dicts
]

df["sentiment_neutral"] = [
    scores.get("neutral", 0)
    for scores in score_dicts
]

df["sentiment_positive"] = [
    scores.get("positive", 0)
    for scores in score_dicts
]

def predicted_label(scores):
    return max(
        scores,
        key=scores.get
    ).capitalize()


df["sentiment"] = [
    predicted_label(scores)
    for scores in score_dicts
]

print(
    df[[
        "tweet_text_raw",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment"
    ]].head()
)

df["sentiment_score"] = (
    df["sentiment_positive"]
    - df["sentiment_negative"]
)

print(
    df[[
        "tweet_text_raw",
        "sentiment",
        "sentiment_score"
    ]].head()
)

vis_df = df[[
    "tweet_id",
    "created_at",
    "date",
    "hour",
    "weekday",
    "username",
    "platform",
    "country",
    "tweet_text_raw",
    "text_clean",
    "likes",
    "retweets",
    "sentiment_score",
    "sentiment"
]].copy()

print(vis_df.head())
print(vis_df.info())
print(vis_df.isna().sum())
print(vis_df["sentiment"].value_counts())

vis_df.to_csv(
    "../data/lab4_clean_tweets.csv",
    index=False
)

sentiment_counts = (
    vis_df["sentiment"]
    .value_counts()
    .rename_axis("sentiment")
    .reset_index(name="count")
)

sentiment_counts.to_csv(
    "../data/sentiment_counts.csv",
    index=False
)

sentiment_platform = (
    vis_df
    .groupby(
        ["platform", "sentiment"]
    )
    .size()
    .reset_index(name="count")
)

sentiment_platform.to_csv(
    "../data/sentiment_by_platform.csv",
    index=False
)

sentiment_time = (
    vis_df
    .groupby("weekday")[
        "sentiment_score"
    ]
    .mean()
    .reset_index()
)

sentiment_time.to_csv(
    "../data/sentiment_by_weekday.csv",
    index=False
)