#!/usr/bin/env python3
"""Menu card art for the eight celebrations (assets/celebs/*.svg): Bale, Drogba, Palmer, Pogba, Pulisic, Rooney, Salah, Vardy.
Each card is drawn from tools/art-data/<name>.json (made from a reference photograph by tools/trace-art.py; the
photographs are not part of the repo), with the backdrop and drawing helpers of gen-art.py.
Usage: python3 tools/gen-art2.py [out_dir]   (default: ../assets; files land in <out_dir>/celebs/)
Env ART_DATA=<dir> reads the JSON from another directory (a trace-art.py --out experiment)."""
import importlib.util, json, os, sys

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("gen_art", os.path.join(_here, "gen-art.py"))
ga = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ga)
O, P, L, eye, text, backdrop, svg = ga.O, ga.P, ga.L, ga.eye, ga.text, ga.backdrop, ga.svg
ga._p = lambda pts: " ".join(f"{round(x):g},{round(y):g}" for x, y in pts)      # whole-pixel coordinates keep the larger cards under 40 KB
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(_here, "..", "assets")


DATA = os.environ.get("ART_DATA") or os.path.join(_here, "art-data")      # ART_DATA: a trace-art.py --out directory, for experiments


def traced(name):
    """A card drawn from tools/art-data/<name>.json (made by tools/trace-art.py from a photograph): backdrop, tone regions
    in painter's order, dark outlines, then the hand-authored finishing details."""
    d = json.load(open(os.path.join(DATA, name + ".json")))
    pairs = lambda a: list(zip(a[0::2], a[1::2]))
    b = d["bg"]
    s = backdrop(b["seed"], b["cols"], b["bg0"], b["bg1"], b["band"])
    if d.get("under"):                                                         # silhouette underlay: no backdrop shows through gaps between regions
        s += P(pairs(d["under"][1]), d["under"][0], False)
    for col, pts in d["layers"]:
        s += P(pairs(pts), col, False, extra=f' stroke="{col}" stroke-width="1.2" stroke-linejoin="round"')   # a thin same-colour stroke closes the slivers between neighbouring regions
    for w, pts in d["lines"]:
        s += P(pairs(pts), "none", True, sw=w)
    if d.get("fade"):                                                          # figure cut by the photo frame: dissolve into the backdrop's dark colour
        y0, y1 = d["fade"]
        s += (f'<defs><linearGradient id="ff" x1="0" y1="{y0}" x2="0" y2="{y1}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{b["bg1"]}" stop-opacity="0"/>'
              f'<stop offset="1" stop-color="{b["bg1"]}"/></linearGradient></defs><rect x="0" y="{y0}" width="600" height="{830 - y0}" fill="url(#ff)"/>')
    for e in d["details"]:
        if e["t"] == "eye": s += eye(e["x"], e["y"], e["rx"], e["ry"], e.get("look", 0), e.get("iris", "#1c1512"), lw=3)
        elif e["t"] == "poly": s += P(pairs(e["pts"]), e["fill"], e.get("st", True))
        elif e["t"] == "line": s += L(pairs(e["pts"]), e.get("col", O), e.get("w", 3.5))
        elif e["t"] == "text": s += text(e["s"], e["x"], e["y"], e["size"], e["fill"], e.get("rot", 0))
    return svg(s)


def figures():
    """Every tools/art-data/<name>.json is drawn by traced()."""
    return [(n[:-5], (lambda n=n[:-5]: traced(n))) for n in sorted(os.listdir(DATA)) if n.endswith(".json")]


if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "celebs"), exist_ok=True)
    for name, fn in figures():
        p = os.path.join(OUT, "celebs", name + ".svg")
        open(p, "w").write(fn())
        print(p, os.path.getsize(p))
