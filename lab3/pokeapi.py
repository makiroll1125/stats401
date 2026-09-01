import requests
import time
import pandas as pd

all_records = []

for page in range(1, 1001):
    try:
        response = requests.get(
            f"https://pokeapi.co/api/v2/pokemon/{page}",
            timeout=10
        )

        response.raise_for_status()

        pokemon = response.json()

        record = {
            "id": pokemon["id"],
            "name": pokemon["name"],
            "height": pokemon["height"],
            "weight": pokemon["weight"],
            "types": [t["type"]["name"] for t in pokemon["types"]]
        }

        all_records.append(record)

        time.sleep(1)
    except requests.RequestException as error:
        print("Request failed:")
        print(error)

df = pd.DataFrame(all_records)
df.to_csv(
    "../data/lab3_data.csv",
    index=False
)