#!/usr/bin/env python3
"""Photo-to-flat-vector tracing for the celebration cards (assets/celebs/*.svg).

The earlier hand-placed polygons guessed proportions and faces. This tool derives the drawing FROM the photograph:
it cuts the figure out, splits it into materials (skin, hair, kit, ...), flattens each material to a few tones, then
traces every tone region into a straight-edged polygon in card coordinates. The result is stored as compact JSON in
tools/art-data/<name>.json (committed; the photographs are not) and tools/gen-art2.py renders the SVG from it.

Usage:   python3 tools/trace-art.py <spec.json> [--debug DIR] [--out DIR]    (--out: write the JSON elsewhere than tools/art-data, for experiments)
         python3 tools/gen-art2.py            # JSON -> assets/celebs/<name>.svg (no photograph needed)
Needs numpy, Pillow, scipy, scikit-learn, contourpy (ships with matplotlib). Nothing is downloaded.

SPEC (JSON, kept next to the photographs, one JSON file per card). All coordinates are in "photo
pixels" = the photograph resized to `photo_width` pixels wide (view the image at that width, read points off a gridded
crop: see "Reading coordinates" below). Polygons are lists of [x, y].
  name            output file name, tools/art-data/<name>.json
  photo           path to the photograph (absolute, or relative to the spec file)
  photo_width     width the coordinates refer to (default 2000)
  work_scale      working resolution, work px per photo px (default 1.0)
  card            {"k": card px per photo px, "cx": photo x that lands on card x=300, "dy": card y of photo y=0,
                   "pad_bottom": photo rows by which the bottom edge row is repeated downwards (lets a cropped
                   photograph fill the card without squashing: only for shirts / torsos that run off the bottom),
                   "fade": optional [y0, y1] card rows: the figure dissolves into the backdrop's dark colour between them,
                   so a figure cut by the photo frame ends softly instead of in a hard edge}
  silhouette      coarse polygon (30-60 points) around the whole figure
  exclude/include lists of polygons forced out of / into the figure mask
  mask_band       half width in photo px of the uncertain band around the silhouette that the colour model decides
  repaint         [{"poly": [...], "fill": "auto" | "#rrggbb", "select": {"b_below":-8, "L_below":75, ...}}]
                  flat-fills (auto: median of the bright pixels around the polygon) what is inside BEFORE tracing:
                  use it to erase sponsors, crests, badges, manufacturer logos. `select` limits the repaint to the
                  pixels that pass (Lab thresholds L/a/b _below/_above), so text can be removed from between fingers.
  known           optional {"L_below", "b_below", ...}: the Lab range of undamaged kit that "auto" repaints sample (default: bright
                  non-skin pixels, right for a white shirt; a blue shirt with white print needs {"L_below": 62, "b_below": -15})
  force           optional [{"poly", "material", "from": [names]}]: inside the polygon, figure pixels classified as one of the `from`
                  materials are reassigned to `material` (clean stripes the colour model cannot separate); clipped by the figure mask
  materials       {name: {"seeds": [polygons that sample the material's colour], "levels": n tones,
                          "palette": [n hex colours, dark to light], "outline": group name or null,
                          "only": optional polygons the material is confined to (stops look-alike colours),
                          "dp": simplification tolerance (card px), "min_area": smallest region (card px^2),
                          "smooth": contour smoothing (work px)}}
                  Every pixel inside the figure is assigned to the material of the nearest seed pixels (k-NN in
                  Lab + position); then each material's lightness is split into `levels` flat tones (k-means).
                  Materials with the same "outline" group are stroked as one shape: the group's boundary
                  gets the dark outline, boundaries between its members do not.
  under           optional hex colour: the whole figure silhouette is first filled with it, so the hairline gaps between jagged tone regions
                  (backdrop showing through a stripe edge) disappear (use the figure's darkest or most common colour)
  style           {"outline": hex, "outline_w": px, "silhouette_w": px, "mode_sigma": speckle filter (work px),
                   "pos_weight": weight of position in the material classifier, "knn": k}
  backdrop        {"seed", "cols", "bg0", "bg1", "band"} arguments of gen-art.py backdrop()
  details         hand-authored finishing, in photo coordinates:
                  {"t":"eye","x","y","rx","ry","iris","look"}   (gen-art.py eye(), radii in photo px)
                  {"t":"poly","pts","fill","st":true}  {"t":"line","pts","col","w"}
                  {"t":"text","s","x","y","size","fill","rot"}  (size in card px)
  Reading coordinates: python3 -c with PIL: resize to photo_width, crop, draw a labelled grid, view the PNG.

Pipeline: repaint -> figure mask (colour mixture model inside the uncertain band, morphology, largest component)
-> edge-preserving smoothing (median + gaussian in Lab) -> material k-NN -> tone k-means -> mode filter and
minimum-area clean-up -> contours (contourpy) -> Douglas-Peucker -> painter order (largest first).
Output JSON: {"layers": [[hex, [x,y,x,y,...]], ...], "lines": [[width, [x,y,...]], ...], "details": [...], "bg": {...}}
with integer card coordinates. --debug DIR writes mask / material / tone previews.

Limits (learnt from Bale, face ~330 photo px wide, and Rooney, face ~110 px): a face needs about 250+ photo px across
(eyes ~20 px apart in card px or more) to keep its features through tracing; at ~110 px it becomes a blob with no eyes, brows
or mouth, and upscaling (work_scale 2) does not add information. Bodies, kit folds and pose survive down to a figure ~500 px
tall. Fallback for small photographs: trace the body (the face materials only supply skin / hair tones and the head
outline), then hand-author the face from the landmarks read off the photograph (details: eye / poly / line / text), at
card scale; or crop tighter (a larger `k`) so the head is the hero. Backgrounds with the kit's own colour (red crowd behind a
red shirt) need a tighter silhouette, a smaller `mask_band` and `include` / `exclude` polygons.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.neighbors import KNeighborsClassifier
from contourpy import contour_generator


# ------------------------------------------------------------------ colour
def rgb2lab(a):
    a = a.astype(np.float64) / 255
    a = np.where(a > .04045, ((a + .055) / 1.055) ** 2.4, a / 12.92)
    m = np.array([[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]])
    xyz = (a @ m.T) / np.array([.9505, 1, 1.089])
    f = np.where(xyz > .008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def raster(polys, shape, ws):
    im = Image.new("L", (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(x * ws, y * ws) for x, y in p], fill=1)
    return np.array(im, bool)


def morph(fn, m, it):
    """Binary morphology that treats the photo border as more of the same (a figure cut by the frame stays cut, not eroded)."""
    p = it + 2
    return fn(np.pad(m, p, mode="edge"), iterations=it)[p:-p, p:-p]


def mode_filter(lab, sigma, classes):
    best = np.full(lab.shape, -9.0); out = lab.copy()
    for c in classes:
        g = ndi.gaussian_filter((lab == c).astype(np.float32), sigma, mode="nearest")
        up = g > best
        best[up] = g[up]; out[up] = c
    return out


# ------------------------------------------------------------------ steps
def repaint(img, lab, spec, ws):
    img = img.copy(); shape = img.shape[:2]; rs = spec.get("repaint", [])
    masks = []
    for r in rs:
        m = raster([r["poly"]], shape, ws); sel = r.get("select")
        if sel:
            ok = np.ones_like(m)
            for key, ch in (("L", 0), ("a", 1), ("b", 2)):
                if key + "_below" in sel: ok &= lab[..., ch] < sel[key + "_below"]
                if key + "_above" in sel: ok &= lab[..., ch] > sel[key + "_above"]
            m = m & ndi.binary_dilation(ok & m, iterations=int(sel.get("grow", 3)))
        masks.append(m)
    if not rs: return img
    allm = ndi.binary_dilation(np.any(masks, 0), iterations=3)
    skin = (lab[..., 1] > 5) & (lab[..., 2] > 8)
    known = ~allm & ~skin & (lab[..., 2] > -9) & (lab[..., 0] > 30)           # undamaged kit around the patch (never skin, never navy text, never the dark background)
    if "known" in spec:                                                       # colour kit (blue shirt, white print): say which pixels count as undamaged kit
        kn = spec["known"]; known = ~allm & ~skin
        for key, ch in (("L", 0), ("a", 1), ("b", 2)):
            if key + "_below" in kn: known &= lab[..., ch] < kn[key + "_below"]
            if key + "_above" in kn: known &= lab[..., ch] > kn[key + "_above"]
    src = img.astype(np.float32); out = img.copy()
    for r, m in zip(rs, masks):
        if r.get("fill", "auto") != "auto":
            h = r["fill"].lstrip("#"); out[m] = [int(h[i:i + 2], 16) for i in (0, 2, 4)]; continue
        col = np.zeros(img.shape, np.float32); done = np.zeros(shape, bool)
        for sg in (6, 14, 30, 60):                                           # inpaint: blur the known pixels in, so the shading carries across
            w = ndi.gaussian_filter(known.astype(np.float32), sg)
            ok = m & ~done & (w > .05)
            for c in range(3):
                col[..., c][ok] = (ndi.gaussian_filter(np.where(known, src[..., c], 0), sg) / np.maximum(w, 1e-6))[ok]
            done |= ok
        col[m & ~done] = src[known].mean(0)
        out[m] = col[m]
    return out


def figure_mask(lab, spec, ws):
    shape = lab.shape[:2]
    coarse = raster([spec["silhouette"]], shape, ws)
    band = int(spec.get("mask_band", 18) * ws)
    sure_in = morph(ndi.binary_erosion, coarse, band)
    sure_out = ~morph(ndi.binary_dilation, coarse, band)
    ys, xs = np.nonzero(sure_in); i = np.random.RandomState(1).choice(len(ys), min(30000, len(ys)), replace=False)
    fg = GaussianMixture(6, covariance_type="full", random_state=0).fit(lab[ys[i], xs[i]])
    ys, xs = np.nonzero(sure_out); i = np.random.RandomState(2).choice(len(ys), min(30000, len(ys)), replace=False)
    bg = GaussianMixture(6, covariance_type="full", random_state=0).fit(lab[ys[i], xs[i]])
    uncertain = coarse & ~sure_in | ~coarse & ~sure_out
    ys, xs = np.nonzero(uncertain)
    llr = fg.score_samples(lab[ys, xs]) - bg.score_samples(lab[ys, xs])
    sd = ndi.distance_transform_edt(coarse) - ndi.distance_transform_edt(~coarse)       # signed distance, + inside
    score = llr + float(spec.get("mask_prior", .25)) * sd[ys, xs]
    m = sure_in.copy(); m[ys, xs] = score > 0
    m = morph(ndi.binary_opening, m, 2); m = morph(ndi.binary_closing, m, 3)
    m |= raster(spec.get("include", []), shape, ws)
    m &= ~raster(spec.get("exclude", []), shape, ws)
    m = ndi.binary_fill_holes(m)
    cl, n = ndi.label(m)
    if n > 1: m = cl == (1 + np.argmax(ndi.sum(m, cl, range(1, n + 1))))
    m = ndi.gaussian_filter(m.astype(np.float32), float(spec.get("mask_smooth", 3.0)), mode="nearest") > .5
    return m


def classify(lab, mask, spec, ws, names, st):
    """Material of every figure pixel: k-NN over seed pixels in (L, a, b, x, y)."""
    shape = mask.shape
    sm = np.stack([ndi.gaussian_filter(ndi.median_filter(lab[..., c], 5), 1.0) for c in range(3)], -1)
    yy, xx = np.mgrid[:shape[0], :shape[1]]
    pw = st.get("pos_weight", .02) / ws
    feat = np.concatenate([sm * np.array([1, 1.4, 1.4]), (xx * pw)[..., None], (yy * pw)[..., None]], -1)
    X, y = [], []
    for k, n in enumerate(names):
        m = raster(spec["materials"][n]["seeds"], shape, ws) & mask
        f = feat[m]
        if len(f) > 6000: f = f[np.random.RandomState(k).choice(len(f), 6000, replace=False)]
        X.append(f); y += [k] * len(f)
    knn = KNeighborsClassifier(st.get("knn", 25), n_jobs=-1).fit(np.concatenate(X), y)
    s = 2; samp = mask & (yy % s == 0) & (xx % s == 0)
    pr = knn.predict_proba(feat[samp])
    for k, n in enumerate(names):                                            # "only": a material may exist inside these polygons alone
        if "only" in spec["materials"][n]: pr[~raster(spec["materials"][n]["only"], shape, ws)[samp], k] = -1
    mat = np.full(shape, -1, np.int16); mat[samp] = pr.argmax(1)
    idx = ndi.distance_transform_edt(mat < 0, return_distances=False, return_indices=True)
    mat = mat[idx[0], idx[1]]; mat[~mask] = -1
    return mat, sm


def tones(sm, mat, spec, names):
    lab_ = np.full(mat.shape, -1, np.int32)
    for k, n in enumerate(names):
        m = mat == k; lv = spec["materials"][n]["levels"]
        if not m.any(): continue
        Lm = sm[..., 0]
        bl = spec["materials"][n].get("tone_blur", 0)
        if bl:                                                               # smooth the lightness inside the material only, so folds read as big planes
            w = ndi.gaussian_filter(m.astype(np.float32), bl) + 1e-4
            Lm = ndi.gaussian_filter(np.where(m, Lm, 0).astype(np.float32), bl) / w
        L = Lm[m]
        if lv == 1: t = np.zeros(len(L), int)
        else:
            sub = L[np.random.RandomState(k).choice(len(L), min(40000, len(L)), replace=False)]
            km = KMeans(lv, n_init=4, random_state=0).fit(sub[:, None])
            order = np.argsort(km.cluster_centers_[:, 0]); rank = np.empty(lv, int); rank[order] = np.arange(lv)
            t = rank[km.predict(L[:, None])]
        lab_[m] = k * 8 + t
    return lab_


def clean(lab, spec, names, ws, k_card, st):
    classes = sorted(set(np.unique(lab)))
    lab = mode_filter(lab, st.get("mode_sigma", 2.0), classes)
    for _ in range(2):
        bad = np.zeros(lab.shape, bool)
        for v in np.unique(lab):
            if v < 0: continue
            ma = spec["materials"][names[v // 8]].get("min_area", 25) / (k_card * ws) ** 2
            cl, n = ndi.label(lab == v)
            if n == 0: continue
            area = ndi.sum(np.ones_like(cl), cl, range(1, n + 1))
            small = np.nonzero(area < ma)[0] + 1
            bad |= np.isin(cl, small)
        if not bad.any(): break
        t = lab.copy(); t[bad] = -3
        idx = ndi.distance_transform_edt(t == -3, return_distances=False, return_indices=True)
        lab = np.where(bad, lab[idx[0], idx[1]], lab)
    return lab


def dp(pts, eps):
    """Douglas-Peucker on a closed ring (first point not repeated)."""
    n = len(pts)
    if n < 4: return pts
    a = pts[0]; j = int(np.argmax(((pts - a) ** 2).sum(1)))
    def rec(seq):
        if len(seq) < 3: return [0, len(seq) - 1]
        p, q = seq[0], seq[-1]; d = q - p; L = np.hypot(*d)
        dist = np.abs(d[0] * (seq[:, 1] - p[1]) - d[1] * (seq[:, 0] - p[0])) / L if L > 1e-9 else np.hypot(*(seq - p).T)
        i = int(np.argmax(dist))
        if dist[i] <= eps: return [0, len(seq) - 1]
        l = rec(seq[:i + 1]); r = rec(seq[i:])
        return l[:-1] + [i + x for x in r]
    h1 = np.vstack([pts[:j + 1]]); h2 = np.vstack([pts[j:], pts[:1]])
    a1 = [h1[i] for i in rec(h1)]; a2 = [h2[i] for i in rec(h2)]
    return np.array(a1[:-1] + a2[:-1])


def area(p):
    x, y = p[:, 0], p[:, 1]
    return .5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def rings(mask, sigma, level):
    pad = int(sigma * 3) + 2
    z = ndi.gaussian_filter(np.pad(mask.astype(np.float32), pad), sigma)
    out = []
    for ln in contour_generator(z=z).lines(level):
        ln = np.asarray(ln, float) - pad
        out.append(ln[:-1] if np.allclose(ln[0], ln[-1]) else ln)
    return out


def to_card(card, ws):
    k, cx, dy = card["k"], card["cx"], card["dy"]
    return lambda p: np.stack([(p[:, 0] / ws - cx) * k + 300, p[:, 1] / ws * k + dy], -1)


def flat(p): return [int(round(v)) for v in np.asarray(p).ravel()]


def main(argv):
    if len(argv) < 2: sys.exit(__doc__)
    sp = os.path.abspath(argv[1]); spec = json.load(open(sp))
    dbg = argv[argv.index("--debug") + 1] if "--debug" in argv else None
    if dbg: os.makedirs(dbg, exist_ok=True)
    ws = spec.get("work_scale", 1.0); card = spec["card"]; st = spec.get("style", {})
    path = spec["photo"] if os.path.isabs(spec["photo"]) else os.path.join(os.path.dirname(sp), spec["photo"])
    im = Image.open(path).convert("RGB"); W = int(spec.get("photo_width", 2000) * ws)
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    img = np.array(im); lab = rgb2lab(img)
    img = repaint(img, lab, spec, ws); lab = rgb2lab(img)
    mask = figure_mask(lab, spec, ws)
    names = list(spec["materials"])
    mat, sm = classify(lab, mask, spec, ws, names, st)
    for f in spec.get("force", []):                                          # hand-drawn bands (stripes): inside the polygon, pixels of the `from` materials become `material`
        fm = raster([f["poly"]], mask.shape, ws) & mask & np.isin(mat, [names.index(n) for n in f.get("from", names)])
        mat[fm] = names.index(f["material"])
    tl = tones(sm, mat, spec, names)
    tl = clean(tl, spec, names, ws, card["k"], st)
    mat = np.where(tl < 0, -1, tl // 8)
    pad = int(card.get("pad_bottom", 0) * ws)
    if pad: tl = np.pad(tl, ((0, pad), (0, 0)), mode="edge"); mat = np.pad(mat, ((0, pad), (0, 0)), mode="edge")
    if dbg:
        def hexrgb(v):
            if v < 0: return (0, 0, 0)
            pl = spec["materials"][names[v // 8]]["palette"]; h = pl[min(v % 8, len(pl) - 1)]
            return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
        pal = np.array([hexrgb(v) for v in range(-1, 8 * len(names))], np.uint8)
        Image.fromarray(pal[tl + 1]).save(os.path.join(dbg, "tones.png"))
        Image.fromarray((mask * 255).astype(np.uint8)).save(os.path.join(dbg, "mask.png"))
        Image.fromarray(img).save(os.path.join(dbg, "repainted.png"))
    tc = to_card(card, ws); k = card["k"]
    layers = []
    for v in np.unique(tl):
        if v < 0: continue
        mt = spec["materials"][names[v // 8]]
        eps = mt.get("dp", 1.0); sig = mt.get("smooth", 1.3)
        cl, n = ndi.label(tl == v)
        for c in range(1, n + 1):
            filled = ndi.binary_fill_holes(cl == c)
            rs = rings(filled, sig, .4)
            if not rs: continue
            r = max(rs, key=len); pc = dp(tc(r), eps)
            if len(pc) >= 3 and area(pc) >= mt.get("min_area", 25) * .5:
                layers.append((area(pc), mt["palette"][v % 8], pc))
    layers.sort(key=lambda t: -t[0])
    groups = {}
    for kx, n in enumerate(names):
        g = spec["materials"][n].get("outline")
        if g: groups.setdefault(g, []).append(kx)
    lines = []; under = None
    sil = (mat >= 0)
    jobs = [(sil, st.get("silhouette_w", 3.5), 1.0)] + [(np.isin(mat, ks), st.get("outline_w", 3.0), spec["materials"][names[ks[0]]].get("dp", 1.0)) for ks in groups.values()]
    for ji, (m, w, eps) in enumerate(jobs):
        first = ji == 0
        m = morph(ndi.binary_closing, m, 2)
        for r in rings(m, st.get("outline_smooth", 2.2), .5):
            pc = dp(tc(r), eps)
            if len(pc) >= 3 and area(pc) > 40: lines.append((w, pc))
            if first and len(pc) >= 3 and (under is None or area(pc) > area(under)): under = pc                    # first job = silhouette; its largest ring is the underlay
    det = []
    for d in spec.get("details", []):
        d = dict(d)
        pt = lambda x, y: [float(v) for v in tc(np.array([[x * ws, y * ws]]))[0]]
        if d["t"] == "eye":
            x, y = pt(d["x"], d["y"]); d.update(x=round(x, 1), y=round(y, 1), rx=round(d["rx"] * k, 1), ry=round(d["ry"] * k, 1), look=round(d.get("look", 0) * k, 1))
        elif d["t"] in ("poly", "line"):
            d["pts"] = [round(c) for xy in d["pts"] for c in pt(*xy)]
        elif d["t"] == "text":
            x, y = pt(d["x"], d["y"]); d.update(x=round(x), y=round(y))
        det.append(d)
    out = {"bg": spec["backdrop"], "style": {"o": st.get("outline", "#1f2433")},
           "layers": [[c, flat(p)] for _, c, p in layers], "lines": [[w, flat(p)] for w, p in lines], "details": det}
    if card.get("fade"): out["fade"] = card["fade"]
    if spec.get("under") and under is not None: out["under"] = [spec["under"], flat(under)]
    outdir = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), "art-data")
    dest = os.path.join(outdir, spec["name"] + ".json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(out, open(dest, "w"), separators=(",", ":"))
    print(dest, os.path.getsize(dest), "bytes;", len(layers), "regions,", len(lines), "outline rings")


if __name__ == "__main__":
    main(sys.argv)
