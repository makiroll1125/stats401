"""Prepare the DKU bulletin corpus used by the Lab 8 visualization.

This follows the embedding/UMAP/K-means pattern in lab8test.py, while also
extracting the PDF and preserving the document hierarchy from its bookmarks.
"""

from pathlib import Path
import json
import re

import fitz
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import umap


ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "V2021-22_DKU_UG_Bulletin.pdf"
DATA_PATH = ROOT.parent / "data" / "bulletin_passages.csv"
MAP_PATH = ROOT.parent / "data" / "lab8_embedding_map.csv"
SUMMARY_PATH = ROOT.parent / "data" / "lab8_summary.json"


def clean_text(text):
    replacements = {
        "\u00ad": "",
        "\uf0b7": " ",
        "�fs": "'s",
        "�ft": "'t",
        "�fre": "'re",
        "�g": '"',
        "�h": '"',
        "�": "'",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    text = re.sub(r"(?<=\w)-\s+(?=[a-z])", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \n\t-–")


def split_passage(text, maximum_words=135):
    words = text.split()

    if len(words) <= maximum_words:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text)
    chunks = []
    current = []

    for sentence in sentences:
        sentence_words = sentence.split()

        if current and len(current) + len(sentence_words) > maximum_words:
            chunks.append(" ".join(current))
            current = []

        if len(sentence_words) > maximum_words:
            for start in range(0, len(sentence_words), maximum_words):
                if current:
                    chunks.append(" ".join(current))
                    current = []
                chunks.append(
                    " ".join(sentence_words[start:start + maximum_words])
                )
        else:
            current.extend(sentence_words)

    if current:
        chunks.append(" ".join(current))

    return chunks


def extract_passages(document):
    toc = [
        {
            "level": level,
            "title": clean_text(title),
            "page": page,
        }
        for level, title, page in document.get_toc()
        if page >= 10
    ]
    toc_by_page = {}

    for item in toc:
        toc_by_page.setdefault(item["page"], []).append(item)

    hierarchy = {
        1: "Front Matter",
        2: "Overview",
        3: "",
    }
    raw_passages = []

    for page_number in range(10, len(document) + 1):
        page = document[page_number - 1]
        expected = list(toc_by_page.get(page_number, []))
        blocks = sorted(
            page.get_text("blocks"),
            key=lambda block: (round(block[1]), block[0]),
        )

        for block in blocks:
            text = clean_text(block[4])

            if not text or text == str(page_number):
                continue

            matched = True

            while expected and matched:
                matched = False

                for index, heading in enumerate(expected):
                    title = heading["title"]

                    if text.casefold().startswith(title.casefold()):
                        level = min(heading["level"], 3)
                        hierarchy[level] = title

                        for deeper in range(level + 1, 4):
                            hierarchy[deeper] = ""

                        text = clean_text(text[len(title):])
                        expected = expected[index + 1:]
                        matched = True
                        break

            if not text:
                continue

            for paragraph in re.split(r"\n\s*\n", block[4]):
                paragraph = clean_text(paragraph)

                if paragraph == str(page_number):
                    continue

                if paragraph and paragraph in {
                    item["title"] for item in toc_by_page.get(page_number, [])
                }:
                    continue

                for chunk in split_passage(paragraph):
                    raw_passages.append({
                        "chapter": hierarchy[1],
                        "section": hierarchy[2] or hierarchy[1],
                        "subsection": hierarchy[3],
                        "page": page_number,
                        "text": chunk,
                    })

    return raw_passages, toc


def main():
    document = fitz.open(PDF_PATH)
    raw_passages, toc = extract_passages(document)
    frame = pd.DataFrame(raw_passages)
    raw_count = len(frame)

    frame["text_clean"] = frame["text"].map(clean_text)
    frame = frame.dropna(subset=["text_clean"])
    frame = frame.drop_duplicates(subset=["text_clean"])
    frame["word_count"] = frame["text_clean"].str.split().str.len()
    frame = frame[
        (frame["word_count"] >= 12)
        & ~frame["text_clean"].str.match(
            r"^(Table of Contents|Duke Kunshan University Undergraduate)",
            case=False,
        )
    ].copy()
    frame = frame.reset_index(drop=True)
    frame.insert(0, "id", [f"p{i:04d}" for i in range(len(frame))])
    frame.to_csv(DATA_PATH, index=False)

    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(
        frame["text_clean"].tolist(),
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=401,
    )
    coordinates = reducer.fit_transform(embeddings)
    frame["x"] = coordinates[:, 0]
    frame["y"] = coordinates[:, 1]

    kmeans = KMeans(
        n_clusters=8,
        random_state=401,
        n_init="auto",
    )
    frame["cluster"] = kmeans.fit_predict(embeddings)

    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_df=0.75,
        min_df=3,
        ngram_range=(1, 2),
    )
    tfidf = vectorizer.fit_transform(frame["text_clean"])
    terms = np.array(vectorizer.get_feature_names_out())
    cluster_terms = {}

    for cluster in sorted(frame["cluster"].unique()):
        mask = frame["cluster"].to_numpy() == cluster
        scores = np.asarray(tfidf[mask].mean(axis=0)).ravel()
        cluster_terms[str(cluster)] = terms[scores.argsort()[-12:][::-1]].tolist()

    similarities = cosine_similarity(embeddings)
    np.fill_diagonal(similarities, -1)
    neighbor_indices = np.argsort(similarities, axis=1)[:, -5:][:, ::-1]
    frame["neighbors"] = [
        "|".join(frame.iloc[indexes]["id"].tolist())
        for indexes in neighbor_indices
    ]

    section_counts = frame["section"].value_counts()
    top_sections = section_counts.head(14).index.tolist()
    frame["display_section"] = frame["section"].where(
        frame["section"].isin(top_sections),
        "Other sections",
    )

    top_term_scores = np.asarray(tfidf.mean(axis=0)).ravel()
    top_terms = [
        {"term": term, "score": round(float(top_term_scores[index]), 5)}
        for index, term in zip(
            top_term_scores.argsort()[-15:][::-1],
            terms[top_term_scores.argsort()[-15:][::-1]],
        )
    ]

    summary = {
        "title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
        "academic_year": "2021-2022",
        "source": "Official Duke Kunshan University admissions website",
        "source_url": (
            "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/"
            "dkumain/files/V2021-22_DKU_UG_Bulletin.pdf"
        ),
        "accessed": "2026-09-23",
        "raw_passages": raw_count,
        "clean_passages": len(frame),
        "average_words": round(float(frame["word_count"].mean()), 1),
        "formal_sections": len(toc),
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "umap": {
            "n_neighbors": 15,
            "min_dist": 0.15,
            "metric": "cosine",
            "random_state": 401,
        },
        "clustering": "K-means on normalized 384-dimensional embeddings",
        "clusters": 8,
        "cluster_terms": cluster_terms,
        "top_terms": top_terms,
        "top_sections": [
            {"section": section, "count": int(count)}
            for section, count in section_counts.head(12).items()
        ],
    }

    frame.to_csv(MAP_PATH, index=False)
    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(summary, indent=2))
    print("\nRepresentative passages")

    distances = kmeans.transform(embeddings)

    for cluster in range(8):
        candidates = np.where(frame["cluster"].to_numpy() == cluster)[0]
        representatives = candidates[
            np.argsort(distances[candidates, cluster])[:3]
        ]
        print(f"\nCLUSTER {cluster}: {', '.join(cluster_terms[str(cluster)][:8])}")

        for index in representatives:
            row = frame.iloc[index]
            print(f"- [{row['section']}, p. {row['page']}] {row['text_clean'][:260]}")


if __name__ == "__main__":
    main()
