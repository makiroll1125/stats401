"""Validate the data and exercise the project in Chromium.
Requires playwright + a Chromium install. Run from any working directory.
"""
import functools
import http.server
import json
import math
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "data/masses.json").read_text(encoding="utf-8"))
objects = DATA["objects"]
assert len(objects) == 382
assert all(o["display_type"] == (("NS" if o["mass"] < 3 else "BH") if o["method"] == "GW" else o["role"]) for o in objects)
assert all(o["type_ambiguous"] == (o["method"] == "GW" and 2.5 < o["mass"] < 5) for o in objects)
assert len({o["id"] for o in objects}) == len(objects)
assert all(math.isfinite(o["mass"]) and o["mass"] > 0 for o in objects)
assert all(o["low"] <= o["mass"] <= o["high"] for o in objects if o["low"] is not None and o["high"] is not None)
assert len({o["name"] for o in objects if o["method"] == "GW"}) == 90
raw = json.loads((ROOT / "data/GWOSCdata.json").read_text())
for o in (o for o in objects if o["method"] == "GW"):
    event = next(e for e in raw["events"].values() if e["commonName"] == o["name"]
                 and e["version"] == o["version"] and e["catalog.shortName"] == o["catalog"])
    field = {"primary": "mass_1_source", "secondary": "mass_2_source", "remnant": "final_mass_source"}[o["role"]]
    if o["name"] == "GW190425" and o["role"] == "remnant":
        assert event[field] is None
        assert o["mass"] == event["total_mass_source"] == 3.4
        assert o["source_field"] == "total_mass_source"
        assert o["mass_status"] == "total_mass_proxy"
        assert o["low"] is None and o["high"] is None
    else:
        assert o["mass"] == event[field]
        for bound in ["low", "high"]:
            suffix = "_lower" if bound == "low" else "_upper"
            if event[field + suffix] is None:
                assert o[bound] is None
            else:
                assert math.isclose(o[bound], event[field] + event[field + suffix])
remnants = {o["name"]: o for o in objects if o["role"] == "remnant"}
assert len(remnants) == 90
assert set(remnants) == {o["name"] for o in objects if o["role"] == "primary"}
assert remnants["GW170817"]["mass"] == 2.8
assert remnants["GW170817"]["mass_status"] == "no_interval"
assert remnants["GW170817"]["low"] is None and remnants["GW170817"]["high"] is None
assert all(remnants[name]["type_ambiguous"] for name in ["GW170817", "GW190425"])

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT.parent)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/individual-project/"
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.goto(url)
        page.wait_for_selector(".point")
        assert page.locator(".point").count() == 382
        assert page.locator("#detail-name").inner_text() == "GW150914"
        assert page.locator("#object-legend li").count() == 4
        assert page.locator("#overview title, #overview [title]").count() == 0
        assert page.get_by_role("img", name="Compact-object mass estimates by observing method, object type, and measurement role", exact=True).count() == 1
        assert page.locator("#overview").get_attribute("aria-describedby") == "chart-description"
        assert "linear local scale for easier interval comparison" in page.locator(".detail-scale-note").inner_text()
        styles = page.locator(".point").evaluate_all("(nodes) => nodes.map(n => ({id:n.__data__.id, method:n.__data__.method, type:n.__data__.display_type, role:n.__data__.role, status:n.__data__.mass_status, fill:n.getAttribute('fill'), stroke:n.getAttribute('stroke')}))")
        palette = {"GWBH":"#00BFFF", "GWNS":"#d78122", "EMBH":"#D81B60", "EMNS":"#dbed9f"}
        for mark in styles:
            expected = palette[mark["method"] + mark["type"]]
            assert mark["fill"] == ("#fff" if (mark["role"] == "secondary" or mark["status"] in ["no_interval", "total_mass_proxy"]) else expected)
            assert mark["stroke"] == ("#65734c" if mark["method"] + mark["type"] == "EMNS" else expected)
        assert {m["type"] for m in styles if m["id"].startswith("GW170817:")} == {"NS"}
        assert {m["type"] for m in styles if m["role"] == "remnant"} == {"BH", "NS"}
        page.locator(".point").first.scroll_into_view_if_needed()
        page.wait_for_timeout(150)
        page.locator(".point").first.hover()
        assert page.locator("#tooltip").is_visible()
        assert "Black hole" in page.locator("#tooltip").inner_text()
        page.keyboard.press("Escape")
        assert not page.locator("#tooltip").is_visible()
        assert page.locator("#detail-values").inner_text().find("63.1") >= 0
        assert page.locator("#data-body tr").count() == 10
        all_positions = page.locator(".point").evaluate_all("(nodes) => Object.fromEntries(nodes.map(n => [n.__data__.id, n.getAttribute('transform')]))")
        page.locator("#search").fill("GW190814")
        assert page.locator(".point").count() == 3
        assert page.locator("#detail-name").inner_text() == "GW190814"
        assert "2.5–2.7" in page.locator("#detail-values").inner_text()
        assert "physical type uncertain" in page.locator("#detail-values").inner_text()
        assert "Neutron star" in page.locator("#data-body").inner_text()
        filtered_positions = page.locator(".point").evaluate_all("(nodes) => Object.fromEntries(nodes.map(n => [n.__data__.id, n.getAttribute('transform')]))")
        assert all(all_positions[k] == v for k, v in filtered_positions.items())
        page.locator("#range").select_option("low")
        assert page.locator(".point").count() == 1
        assert page.locator("#detail-values > div").count() == 3  # Full event remains available.
        page.locator("#search").fill("no-such-object")
        assert page.locator(".point").count() == 0
        assert page.locator("#empty-state").is_visible()
        assert page.locator("#detail-name").inner_text() == "No object selected"
        assert page.locator("#next").is_disabled()
        page.locator("#reset").click()
        page.locator("#method").select_option("EM")
        assert page.locator(".point").count() == 112
        assert "EM" in page.locator("#detail-values").inner_text()
        page.locator("#scale").select_option("linear")
        assert "linear" in page.locator("#overview .axis-label").text_content()
        page.locator("#gap").uncheck()
        assert page.locator(".band-label").count() == 0
        page.locator("#sort").select_option("mass-asc")
        values = page.locator("#data-body td:nth-child(3)").all_text_contents()
        assert list(map(float, values)) == sorted(map(float, values))
        page.locator("#next").click()
        assert page.locator("#page-status").inner_text().startswith("11–20")
        page.locator("#data-body button").first.focus()
        selected_name = page.locator("#data-body button").first.inner_text()
        page.keyboard.press("Enter")
        assert page.locator("#detail-name").inner_text() == selected_name
        assert page.locator("#data-body button").first.evaluate("(n) => n === document.activeElement")
        for index in range(1, 5):
            page.locator(f'[data-view="{index}"]').click()
            page.wait_for_function("document.getElementById('original-image').complete && document.getElementById('original-image').naturalWidth > 0")
        page.locator('[data-view="1"]').click()
        page.locator('[data-example="GW170817"]').click()
        for name, mass, note in [("GW170817", "2.8", "no reported uncertainty"), ("GW190425", "3.4", "proxy")]:
            page.locator("#search").fill(name)
            assert page.locator(".point").count() == 3
            assert page.locator("#detail-values > div").count() == 3
            remnant = page.locator(f'#detail-chart g[data-entry-id="{name}:remnant"]')
            assert remnant.locator("path").get_attribute("fill") == "#fff"
            assert remnant.locator("line").count() == 0  # Never fabricate remnant whiskers.
            assert "Not reported" in page.locator("#data-body").inner_text()
            assert mass in page.locator("#detail-values").inner_text()
            assert note in page.locator("#detail-values").inner_text().lower()
            assert "physical type uncertain" in page.locator("#detail-values").inner_text()
            page.locator("#range").select_option("low")
            assert page.locator(".point").count() == 3
            point = page.locator(f'.point[aria-label^="{name}, GW · remnant"]')
            point.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            point.hover()
            assert note in page.locator("#tooltip").inner_text().lower()
            page.keyboard.press("Escape")
            page.locator("#range").select_option("all")
        page.locator("#reset").click()
        page.reload()
        page.wait_for_selector(".point")
        reloaded = page.locator(".point").evaluate_all("(nodes) => Object.fromEntries(nodes.map(n => [n.__data__.id, n.getAttribute('transform')]))")
        assert all_positions == reloaded
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        previews = ROOT / "validation"
        previews.mkdir(exist_ok=True)
        page.locator(".explorer").screenshot(path=str(previews / "desktop.png"))
        page.screenshot(path=str(previews / "page.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(150)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Page overflows on mobile"
        assert page.locator(".point").count() == 382
        page.locator('[data-example="GW190814"]').click()
        assert page.locator(".point").count() == 3
        page.locator(".explorer").screenshot(path=str(previews / "mobile.png"))
        assert not errors, errors
        # Check the local file references without relying on internet access.
        for attr, selector in [("src", "[src]"), ("href", "link[href]")]:
            for node in page.locator(selector).all():
                ref = node.get_attribute(attr)
                if not ref.startswith(("http:", "https:", "#")):
                    assert page.request.get(url + ref).ok, ref
        # The explicit error state must also work when the JSON cannot be fetched.
        page.route("**/data/masses.json", lambda route: route.abort())
        page.reload()
        page.wait_for_selector("#load-error", state="visible")
        assert "HTTP" in page.locator("#load-error").inner_text()
        browser.close()
finally:
    server.shutdown()
print("PASS: data provenance, intervals, 382 marks, stable geometry, search, filters, scales,")
print("both ambiguous remnants without fabricated whiskers, object colors/types, custom tooltip and accessible name, local detail-scale labeling,")
print("selection, empty state, keyboard table, pagination, gallery, mobile overflow, and load failure.")
