import pandas as pd

df = pd.read_csv("../data/bulletin_passages.csv")

df = df.dropna(subset=["text"])
df = df.drop_duplicates(subset=["text"])

df["text_clean"] = (
    df["text"]
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
)

df["word_count"] = (
    df["text_clean"]
    .str.split()
    .str.len()
)

print(df["word_count"].describe())

print(
    df["section"].value_counts()
)

from sentence_transformers import SentenceTransformer

model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)

embeddings = model.encode(
    df["text_clean"].tolist(),
    normalize_embeddings=True
)

print(embeddings.shape)

from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

similarity = cosine_similarity(embeddings)

scores = similarity[0].copy()
scores[0] = -1

index = np.argmax(scores)

print(df.iloc[0]["text"])
print(df.iloc[index]["text"])
print("Similarity:", scores[index])

import umap

reducer = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.15,
    metric="cosine",
    random_state=401
)

coords = reducer.fit_transform(
    embeddings
)

df["x"] = coords[:, 0]
df["y"] = coords[:, 1]

from sklearn.cluster import KMeans

kmeans = KMeans(
    n_clusters=8,
    random_state=401,
    n_init="auto"
)

df["cluster"] = (
    kmeans.fit_predict(embeddings)
)

for c in sorted(df["cluster"].unique()):

    print("\nCLUSTER", c)

    subset = df[
        df["cluster"] == c
    ]

    for text in subset[
        "text_clean"
    ].head(10):

        print("-", text)


df.to_csv(
    "../data/lab8_embedding_map.csv",
    index=False
)

