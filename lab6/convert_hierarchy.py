import pandas as pd
import json

df = pd.read_csv(
    "../data/lab6_assignment_gdp.csv"
)

def build_hierarchy(
    dataframe,
    levels,
    value_column,
    status_column
):

    if len(levels) == 1:

        return [
            {
                "name": row[levels[0]],
                "gdp": int(row[value_column]),
                "status": row[status_column]
            }
            for _, row
            in dataframe.iterrows()
        ]

    current_level = levels[0]

    children = []

    for value, group in dataframe.groupby(
        current_level
    ):

        children.append({
            "name": value,
            "children": build_hierarchy(
                group,
                levels[1:],
                value_column,
                status_column
            )
        })

    return children

hierarchy = {
    "name": "World",
    "children": build_hierarchy(
        df,
        [
            "continent",
            "area",
            "country"
        ],
        "gdp_billion_usd",
        "gdp_status"
    )
}

with open(
    "../data/lab6_assignment_gdp.json",
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        hierarchy,
        f,
        indent=2,
        ensure_ascii=False
    )
