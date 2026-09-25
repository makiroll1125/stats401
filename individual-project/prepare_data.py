"""Rebuild a local teaching dataset from a pinned copy of the original plot.
Run: python individual-project/prepare_data.py (Python standard library only).
"""
import collections
import datetime
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent
COMMIT = "5912f3355382df1b92e3b3bf1152792d8e16c116"
BASE = f"https://raw.githubusercontent.com/ageller/LIGO-Virgo-Mass-Plot_v2.0/{COMMIT}/"
CATALOGS = ["GWTC-1-confident", "GWTC-2.1-confident", "GWTC-3-confident"]


def get(path):
    return urllib.request.urlopen(BASE + path, timeout=60).read()


TYPE_CONVENTION = ("Original color convention: GW central mass < 3 solar masses uses NS, otherwise BH. "
                   "GW masses strictly between 2.5 and 5 are flagged ambiguous, matching the "
                   "original category-toggle convention. Colors are display categories, not "
                   "confirmed identities. EM types are retained from the source compilation.")


def add_object_types(objects):
    for obj in objects:
        obj["display_type"] = ("NS" if obj["mass"] < 3 else "BH") if obj["method"] == "GW" else obj["role"]
        obj["type_ambiguous"] = obj["method"] == "GW" and 2.5 < obj["mass"] < 5


def main(use_local=False):
    data = ROOT / "data"
    data.mkdir(exist_ok=True)
    raw = {}
    for name in ["GWOSCdata", "EMdata"]:
        content = (data / f"{name}.json").read_bytes() if use_local else get(f"src/data/{name}.json")
        (data / f"{name}.json").write_bytes(content)
        raw[name] = json.loads(content)
    if not use_local:
        (data / "UPSTREAM-LICENSE.txt").write_bytes(get("LICENSE"))
    objects, events, skipped = [], {}, collections.Counter()
    candidates = [e for e in raw["GWOSCdata"]["events"].values()
                  if e["catalog.shortName"] in CATALOGS]
    candidates.sort(key=lambda e: (CATALOGS.index(e["catalog.shortName"]), e["version"]))
    for event in candidates:
        events[event["commonName"]] = event
    for name, e in sorted(events.items()):
        for field, role in [("mass_1_source", "primary"),
                            ("mass_2_source", "secondary"),
                            ("final_mass_source", "remnant")]:
            source_field = field
            mass = e.get(field)
            mass_status = "reported"
            mass_note = ""
            # Match the original plot's total-mass fallback, but label it explicitly.
            if role == "remnant" and mass is None and e.get("total_mass_source") is not None:
                mass = e["total_mass_source"]
                source_field = "total_mass_source"
                mass_status = "total_mass_proxy"
                mass_note = ("Total binary mass used as a remnant-position proxy, as in the original plot; "
                             "final remnant mass and its interval are not reported.")
                skipped["remnant_total_mass_proxy"] += 1
            if mass is None or mass <= 0:
                skipped["missing_gw_mass"] += 1
                continue
            # Whiskers must refer to the plotted quantity. A total-mass interval is
            # not a remnant-mass interval, so never copy it onto the proxy.
            low, high = e.get(field + "_lower"), e.get(field + "_upper")
            if mass_status == "total_mass_proxy":
                low, high = None, None
            elif role == "remnant" and (low is None or high is None):
                mass_status = "no_interval"
                mass_note = "Source-listed remnant value; no reported uncertainty interval. Physical type uncertain."
                skipped["remnant_without_interval_retained"] += 1
            objects.append(dict(id=f"{name}:{role}", name=name, method="GW", role=role,
                                group=role, mass=mass, source_field=source_field,
                                mass_status=mass_status, mass_note=mass_note,
                                low=round(mass + low, 8) if low is not None else None,
                                high=round(mass + high, 8) if high is not None else None,
                                catalog=e["catalog.shortName"], version=e["version"],
                                source=f"https://gwosc.org/eventapi/html/{e['catalog.shortName']}/{name}/v{e['version']}/"))
    for name, e in sorted(raw["EMdata"].items()):
        if e.get("special", 0) != 0:
            skipped["flagged_em"] += 1
            continue
        if not isinstance(e.get("mass"), (int, float)) or e["mass"] <= 0:
            skipped["missing_em_mass"] += 1
            continue
        low, high = e.get("error_low"), e.get("error_high")
        if low is not None and high is not None and low > high:
            low, high = high, low
            skipped["reordered_em_bounds"] += 1
        objects.append(dict(id=f"EM:{name}", name=name, method="EM", role=e["type"],
                            group="em_bh" if e["type"] == "BH" else "em_ns",
                            mass=e["mass"], low=low, high=high, category=e["category"],
                            source=e.get("reference") or
                            f"https://github.com/ageller/LIGO-Virgo-Mass-Plot_v2.0/blob/{COMMIT}/src/data/EMdata.json"))
    add_object_types(objects)
    meta = dict(object_type_convention=TYPE_CONVENTION, title="Masses in the Stellar Graveyard — teaching snapshot",
                generated_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                upstream_commit=COMMIT, catalogs=CATALOGS, gw_events=len(events),
                counts=dict(collections.Counter(o["group"] for o in objects)),
                processing=dict(skipped), units="solar masses; source-frame for GW",
                gw_interval="Reported 90% credible intervals; posterior summaries, not exact values.",
                em_interval="Published bounds from the original compilation; confidence conventions vary.")
    (data / "masses.json").write_text(json.dumps(dict(meta=meta, objects=objects), indent=2,
                                                ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Rebuild using the preserved local upstream files.")
    main(use_local=parser.parse_args().local)
