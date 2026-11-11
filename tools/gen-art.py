#!/usr/bin/env python3
"""Generates the flat-vector card art (bokeh backdrop + outlined character) for online / drills."""
import random, os
O = "#1f2433"; SW = 3.5
OUT = os.path.join(os.path.dirname(__file__), "..", "assets")

def poly(pts, fill, extra="", stroke=True):
    p = " ".join(f"{x},{y}" for x, y in pts)
    s = f' stroke="{O}" stroke-width="{SW}" stroke-linejoin="round"' if stroke else ""
    return f'<polygon points="{p}" fill="{fill}"{s} {extra}/>'

def limb(pts, w, fill):
    p = " ".join(f"{x},{y}" for x, y in pts)
    return (f'<polyline points="{p}" fill="none" stroke="{O}" stroke-width="{w+7}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<polyline points="{p}" fill="none" stroke="{fill}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')

def bokeh(seed, cols, bg0, bg1, extra=""):
    r = random.Random(seed)
    c = "".join(f'<circle cx="{r.randint(-10,620)}" cy="{r.randint(0,830)}" r="{r.randint(12,44)}" fill="{r.choice(cols)}" opacity="{r.uniform(.2,.7):.2f}"/>' for _ in range(70))
    return (f'<defs><filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>'
            f'<pattern id="hatchd" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="9" fill="{O}"/></pattern>'
            f'<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            f'<radialGradient id="bg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="{bg0}"/><stop offset="1" stop-color="{bg1}"/></radialGradient></defs>'
            f'<rect width="600" height="830" fill="url(#bg)"/><g filter="url(#blur)">{c}</g>{extra}')

def hair(kind, col):
    if kind == "short":
        return poly([(222,262),(222,190),(250,140),(300,124),(352,136),(380,178),(382,256),(368,212),(344,194),(320,204),(300,188),(274,206),(246,212),(232,250)], col)
    if kind == "buzz":
        return poly([(228,236),(230,184),(256,150),(300,140),(346,150),(372,184),(374,236),(362,204),(300,190),(238,204)], col)
    if kind == "bun":
        return (poly([(226,250),(228,186),(256,146),(300,134),(346,146),(374,186),(376,250),(360,206),(300,192),(242,206)], col)
                + f'<circle cx="300" cy="118" r="26" fill="{col}" stroke="{O}" stroke-width="{SW}"/>')
    if kind == "fade":
        return poly([(228,244),(228,190),(254,158),(300,146),(348,158),(372,190),(372,244),(360,206),(300,194),(240,206)], col) + f'<polyline points="236,230 238,200" stroke="#000" stroke-width="10" opacity=".25" stroke-linecap="round"/>'
    if kind == "tousled":
        return poly([(224,266),(216,196),(232,150),(262,108),(292,126),(318,100),(350,120),(382,160),(386,214),(380,270),(366,216),(344,186),(314,196),(284,182),(252,200),(236,236)], col)
    if kind == "undercut":
        return poly([(228,240),(224,190),(244,142),(278,100),(318,92),(352,112),(376,160),(376,240),(364,206),(344,176),(310,190),(270,184),(244,204)], col)
    if kind == "swept":
        return poly([(222,270),(218,190),(240,140),(280,112),(330,108),(372,140),(384,196),(380,270),(366,214),(340,196),(300,186),(262,196),(238,226)], col) + f'<polyline points="250,150 300,126 350,140" fill="none" stroke="#fff" stroke-width="3" opacity=".25" stroke-linecap="round"/>'
    return poly([(222,262),(222,186),(256,132),(300,112),(348,128),(380,176),(382,256),(366,206),(300,196),(240,210)], col)

def head(skin, shade, hcol, hk, mouth="open", brow_tilt=0, stubble=0, narrow=False, thick=False, round_=False, sx=1, sy=1, eyek=1, nose=1, jaw=None, lip=1, look=0, furrow=0, lift=0):
    return f'<g transform="translate(300 270) scale({sx} {sy}) translate(-300 -270)">' + _head(skin, shade, hcol, hk, mouth, brow_tilt, stubble, narrow, thick, round_, eyek, nose, jaw, lip, look, furrow, lift) + '</g>'

def _head(skin, shade, hcol, hk, mouth, brow_tilt, stubble, narrow, thick, round_, eyek, nose, jaw, lip, look, furrow, lift):
    s = poly([(236,196),(266,162),(334,162),(364,196),(374,282),(354,352),(320,386),(280,386),(246,352),(226,282)], skin)
    s += poly([(310,162),(334,162),(364,196),(374,282),(354,352),(320,386),(304,386),(340,300),(350,210)], shade, 'opacity=".55"', False)
    s = poly([(226,262),(212,272),(212,306),(226,314)], shade) + poly([(374,262),(388,272),(388,306),(374,314)], shade) + s
    if round_:
        s += poly([(240,300),(236,330),(262,372),(300,388),(338,372),(364,330),(360,300)], skin, "", False)
    if jaw == "square":
        s += poly([(238,310),(362,310),(360,356),(340,388),(260,388),(240,356)], skin, "", False)
        s += poly([(300,310),(362,310),(360,356),(340,388),(300,388)], shade, 'opacity=".4"', False)
    if jaw == "point":
        s += poly([(250,330),(350,330),(318,392),(300,402),(282,392)], skin)
    s += hair(hk, hcol)
    if stubble:
        s += poly([(240,318),(256,300),(284,322),(300,316),(320,322),(346,300),(362,318),(352,352),(322,384),(278,384),(248,352)], hcol, f'opacity="{stubble}"', False)
    bt = 6 if thick else 0
    s += f'<g transform="translate(302 0) scale({eyek} 1) translate(-302 0)">'
    s += poly([(246,246+brow_tilt-lift),(288,238+furrow-lift),(290,249+bt+furrow-lift),(250,254+brow_tilt+bt-lift)], hcol, "", False) + poly([(358,248+brow_tilt-lift),(318,238+furrow-lift),(316,250+bt+furrow-lift),(354,256+brow_tilt+bt-lift)], hcol, "", False)
    ry = 5.5 if narrow else 7.5
    s += f'<ellipse cx="270" cy="276" rx="14" ry="{ry}" fill="#fbf4ee"/><ellipse cx="{271+look}" cy="276" rx="5" ry="5" fill="#1b1410"/>'
    s += f'<ellipse cx="334" cy="276" rx="14" ry="{ry}" fill="#fbf4ee"/><ellipse cx="{335+look}" cy="276" rx="5" ry="5" fill="#1b1410"/>'
    s += f'<polyline points="255,274 270,266 285,274" fill="none" stroke="{O}" stroke-width="3" stroke-linecap="round"/><polyline points="320,274 334,266 350,274" fill="none" stroke="{O}" stroke-width="3" stroke-linecap="round"/>'
    s += '</g>'
    s += f'<g transform="translate(302 306) scale({nose}) translate(-302 -306)">' + poly([(302,284),(292,326),(314,328)], shade, "", False) + '</g>'
    if mouth == "open":
        s += poly([(266,342),(334,342),(326,362),(300,372),(274,362)], "#5a2e22") + poly([(272,344),(328,344),(324,352),(276,352)], "#fbf4ee", "", False)
    elif mouth == "o":   # small relaxed 'o' with a hint of teeth
        s += poly([(284,346),(316,344),(322,356),(300,366),(282,358)], "#5a2e22") + poly([(288,347),(314,346),(316,351),(290,352)], "#fbf4ee", "", False)
    elif mouth == "smile":   # soft closed-lip smile, cheeks pushed up
        s += f'<polyline points="266,346 300,358 340,342" fill="none" stroke="{O}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' + f'<polyline points="262,334 270,344" stroke="{shade}" stroke-width="3" stroke-linecap="round" fill="none"/><polyline points="344,332 338,342" stroke="{shade}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    elif mouth == "half":   # lopsided half-grin, teeth showing on one side
        s += poly([(274,352),(300,346),(342,336),(336,352),(300,362)], "#5a2e22") + poly([(290,348),(338,339),(336,346),(294,354)], "#fbf4ee", "", False)
    elif mouth == "smirk":
        s += f'<polyline points="274,350 300,358 334,342" fill="none" stroke="{O}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    else:
        s += f'<polyline points="278,352 304,352 330,350" fill="none" stroke="{O}" stroke-width="4" stroke-linecap="round"/>'
    return s

def torso(skin, shade, main, trim, trim2, collar, num=None, stripes=None):
    s = poly([(262,350),(338,350),(350,460),(250,460)], shade)
    s += poly([(40,830),(55,540),(150,470),(250,440),(300,486),(350,440),(450,470),(545,540),(560,830)], main)
    if stripes:
        for i, x in enumerate(range(70, 560, 56)):
            s += f'<polygon points="{x},830 {x+14},500 {x+36},500 {x+28},830" fill="{stripes}" opacity=".9"/>'
    s += poly([(350,440),(450,470),(545,540),(560,830),(400,830),(430,620)], "#000", 'opacity=".18"', False)
    s += poly([(55,540),(150,470),(240,444),(228,476),(150,516),(70,600)], trim) + poly([(545,540),(450,470),(360,444),(372,476),(450,516),(530,600)], trim)
    s += f'<polyline points="250,442 300,500 350,442" fill="none" stroke="{collar}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<polyline points="256,446 300,496 344,446" fill="none" stroke="{trim2}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
    if num:
        s += f'<text x="300" y="690" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="170" font-style="italic" fill="{trim2}" stroke="{O}" stroke-width="4">{num}</text>'
    return s

def hand(cx, cy, skin, shade, finger=None):
    s = poly([(cx-30,cy-8),(cx,cy-18),(cx+32,cy-6),(cx+44,cy+22),(cx+30,cy+48),(cx-6,cy+54),(cx-28,cy+36)], skin)
    s += f'<polyline points="{cx-18},{cy+8} {cx+30},{cy+2}" stroke="{shade}" stroke-width="3" stroke-linecap="round" fill="none"/><polyline points="{cx-16},{cy+26} {cx+28},{cy+24}" stroke="{shade}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    if finger:
        s += limb([(cx+6,cy-12),finger], 20, skin)
    return s

def svg(body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 830" width="600" height="830">{body}</svg>\n'
def write(path, body, tf=None):
    if tf:
        # wrap everything after the bokeh backdrop in a transform group
        i = body.index('</g>', body.index('<g filter="url(#blur)">')) + 4
        j = body.find('<polygon points="270,0', i)  # keep light rays with backdrop if present
        body = body[:i] + f'<g transform="{tf}">' + body[i:] + '</g>'
    with open(os.path.join(OUT, path), "w") as f: f.write(svg(body))


def stripes(cols, y0=480, y1=830, x0=60, x1=545, w=40):
    out=""; x=x0; i=0
    while x < x1:
        out += f'<polygon points="{x},{y0} {min(x+w,x1)},{y0} {min(x+w,x1)+6},{y1} {x+6},{y1}" fill="{cols[i%len(cols)]}"/>'
        x += w; i += 1
    return out
def clip_torso(main_stripes_svg):
    return f'<clipPath id="tc"><polygon points="40,830 55,540 150,470 250,440 300,486 350,440 450,470 545,540 560,830"/></clipPath><g clip-path="url(#tc)">{main_stripes_svg}</g>'
def crest(x,y,c1,c2):
    return f'<polygon points="{x-20},{y-22} {x+20},{y-22} {x+20},{y+6} {x},{y+26} {x-20},{y+6}" fill="{c1}" stroke="{O}" stroke-width="3"/><polygon points="{x-20},{y-22} {x},{y-22} {x},{y+26} {x-20},{y+6}" fill="{c2}"/>'
def arm_stroke_shirt(pts,w,col): return limb(pts,w,col)


def fingers(cx, cy, ang, skin, shade, n=4, flen=44, spread=14, fw=15):
    """open hand: palm + fingers radiating from (cx,cy) toward angle ang (deg)"""
    import math
    a = math.radians(ang); ux, uy = math.cos(a), math.sin(a); px, py = -uy, ux
    out = poly([(cx-26*px-8*ux, cy-26*py-8*uy), (cx+26*px-8*ux, cy+26*py-8*uy), (cx+22*px+26*ux, cy+22*py+26*uy), (cx-22*px+26*ux, cy-22*py+26*uy)], skin)
    for i in range(n):
        o = (i-(n-1)/2)*spread
        sx_, sy_ = cx+o*px+18*ux, cy+o*py+18*uy
        l = flen - abs(i-(n-1)/2)*4
        out += limb([(sx_, sy_), (sx_+l*ux, sy_+l*uy)], fw, skin)
    return out
def fist(cx, cy, skin, shade, thumb=None, knuckle_dir=(0,-1)):
    out = poly([(cx-34,cy-20),(cx-6,cy-30),(cx+30,cy-22),(cx+40,cy+6),(cx+28,cy+40),(cx-8,cy+46),(cx-34,cy+28)], skin)
    for k in range(4):
        x = cx-22+k*15
        out += f'<polyline points="{x},{cy-24} {x+2},{cy+2}" stroke="{shade}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    if thumb:
        out += limb([(cx+4,cy+6), thumb], 20, skin)
    return out

# ---- Online 1v1: back view, red #7 kit, right arm raised over head, packed red crowd
SK, SH = "#e2b48c", "#c99a72"
body = bokeh(11, ["#c8102e","#7a2f3a","#f4f4f4","#2b3442","#9a6a44","#566377"], "#4a1520", "#0b0d12")
# raised arm (behind head)
body += limb([(430,540),(440,380),(380,220)], 54, "#d3202f") + poly([(352,214),(384,196),(416,208),(424,236),(408,262),(374,264)], SK)
body += limb([(374,236),(358,200)], 16, SK)
# torso back
body += poly([(40,830),(55,540),(150,470),(250,440),(300,462),(350,440),(450,470),(545,540),(560,830)], "#d3202f")
body += poly([(350,440),(450,470),(545,540),(560,830),(400,830),(430,620)], "#000", 'opacity=".2"', False)
body += poly([(262,350),(338,350),(350,450),(250,450)], "#c99a72")
body += poly([(236,196),(266,170),(334,170),(364,196),(370,282),(346,350),(254,350),(230,282)], SK)
body += poly([(222,262),(222,186),(256,132),(300,116),(348,130),(380,176),(380,262),(362,210),(300,198),(240,212)], "#120d0a")
body += poly([(226,250),(222,186),(256,132),(300,116),(348,130),(380,176),(378,250),(340,306),(260,306)], "#120d0a")
body += poly([(374,262),(390,272),(390,306),(374,314)], "#c99a72")
body += f'<polyline points="248,446 300,470 352,446" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
body += f'<text x="300" y="540" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="40" fill="#fff" stroke="{O}" stroke-width="1.5">RONALDO</text>'
body += f'<text x="300" y="720" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="190" font-style="italic" fill="#fff" stroke="{O}" stroke-width="4">7</text>'
body += limb([(70,830),(70,640),(150,540)], 50, "#d3202f")
write("play/online.svg", body)

# ---- Arena: blue kit, forearms crossed over chest (hands on opposite shoulders), short fade, round face, wide grin
SK, SH = "#6b3f24", "#4f2c18"
body = bokeh(23, ["#2f5d9a","#b9c4d3","#f4f4f4","#c8102e","#3a4658","#6d7f9c"], "#24407a", "#07101e")
body += torso(SK, SH, "#1f5fd0", "#143a86", "#fff", "#143a86")
body += head(SK, SH, "#0f0a08", "fade", "o", 0, stubble=0.10, look=4, lift=3, round_=True, sx=1.14, sy=0.94, eyek=1.18, nose=1.25)
body += crest(436,540,"#fff","#c8102e")
# short sleeves + ribbed cuffs, bare forearms crossed, fingered hands on the opposite shoulders
body += limb([(78,560),(96,650),(110,690)], 60, "#1f5fd0") + limb([(522,560),(504,650),(490,690)], 60, "#2a6be0")
body += limb([(104,672),(112,696)], 66, "#143a86") + limb([(496,672),(488,696)], 66, "#143a86")
body += limb([(112,716),(250,640),(380,560),(452,508)], 48, SK)
body += limb([(488,716),(350,640),(220,560),(148,508)], 48, SK)
body += f'<polyline points="150,700 300,624" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/><polyline points="450,700 300,624" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/>'
body += fingers(150,500,-120,SK,SH,flen=40) + fingers(450,500,-60,SK,SH,flen=40)
write("drills/arena.svg", body, "translate(-70,20) rotate(-5 300 830)")

# ---- Penalty: red #9 kit, strong jaw + stubble + heavy brows, big toothy smile, heart-hands high on the chest
SK, SH = "#e5b48a", "#c99a72"
body = bokeh(37, ["#c8102e","#0b1a52","#2f5d9a","#f4f4f4","#3a4658","#1d2a52"], "#1b1f4a", "#07080d",
             '<rect x="0" y="470" width="600" height="46" fill="#1d4fd0" opacity=".35"/>')
body += torso(SK, SH, "#d3202f", "#a3121f", "#fff", "#a3121f")
body += head(SK, SH, "#1a120c", "short", "smile", 0, stubble=0.32, look=1, lift=1, thick=True, jaw="square", sx=1.05, sy=1.03, eyek=0.95, nose=1.0)
body += f'<text x="300" y="690" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-weight="900" font-size="150" font-style="italic" fill="#fff" stroke="{O}" stroke-width="4">9</text>'
body += limb([(60,720),(110,600),(250,500)], 52, "#d3202f") + limb([(540,720),(490,600),(350,500)], 52, "#d3202f")
body += poly([(238,478),(258,452),(280,482),(256,508)], "#f2f4f7", "", False) + poly([(362,478),(342,452),(320,482),(344,508)], "#f2f4f7", "", False)
body += poly([(300,512),(268,452),(240,458),(226,496),(244,540),(300,574)], SK) + poly([(300,512),(332,452),(360,458),(374,496),(356,540),(300,574)], SK)
body += "".join(f'<polyline points="{x},{y} {x+d},{y+26}" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/>' for x,y,d in [(250,468,12),(262,474,12),(274,486,10),(350,468,-12),(338,474,-12),(326,486,-10)])
body += f'<polyline points="300,520 300,568" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/>'
write("drills/penalty.svg", body, "translate(40,-10) rotate(3 300 830) translate(300 830) scale(1.06) translate(-300 -830)")

# ---- Target: red/white stripes, tousled brown hair with side fringe, light stubble, thumbs pointing (left thumb in at chest, right thumb up)
SK, SH = "#ecc4a0", "#cfa07a"
body = bokeh(41, ["#c8102e","#f4f4f4","#7a2f3a","#2b3442","#9a6a44","#566377"], "#3a1620", "#0b0709")
body += torso(SK, SH, "#f2f4f7", "#c8102e", "#0b2a8a", "#0b2a8a")
body += clip_torso(stripes(["#d3202f","#f2f4f7"], 440, 830, 40, 560, 44))
body += f'<polyline points="250,442 300,500 350,442" fill="none" stroke="#0b2a8a" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
body += head(SK, SH, "#6a4526", "tousled", "half", -3, stubble=0.18, look=4, lift=2, jaw="point", sx=0.9, sy=1.08, eyek=0.92, nose=1.2)
body += crest(376,590,"#fff","#c8102e")
body += poly([(250,640),(350,640),(350,700),(250,700)], "#fff", "", False)
body += limb([(70,830),(60,690),(120,580),(172,540)], 56, "#d3202f") + limb([(530,830),(550,690),(500,580),(448,540)], 56, "#d3202f")
body += poly([(140,556),(196,520),(214,544),(160,586)], "#f2f4f7", "", False) + poly([(484,556),(430,520),(414,544),(468,586)], "#f2f4f7", "", False)
body += fist(180,508,SK,SH,thumb=(246,478))
body += fist(436,508,SK,SH,thumb=(450,434))
write("drills/target.svg", body, "translate(60,10) rotate(-3 300 830)")

# ---- Chip: B/W stripes, undercut with tall swept-up brown top, heavy brows, narrowed intense eyes, stubble, hand clamped over mouth
SK, SH = "#e6b58c", "#c58f68"
body = bokeh(53, ["#2b3442","#f4f4f4","#1d2a52","#566377","#9a6a44","#3a4658"], "#1a2230", "#05070a")
body += torso(SK, SH, "#f2f4f7", "#1f2433", "#fff", "#1f2433")
body += clip_torso(stripes(["#15181f","#f2f4f7"], 440, 830, 50, 560, 50))
body += head(SK, SH, "#8a5a2c", "undercut", "flat", 4, stubble=0.22, narrow=True, thick=True, look=5, furrow=7, jaw="point", sx=0.94, sy=1.05, eyek=1.0, nose=1.05)
# forearm up from lower-left, wristband, hand across lower face covering mouth/chin
body += limb([(10,860),(34,770),(64,730)], 70, "#f2f4f7")
body += limb([(64,730),(120,640),(196,556)], 66, SK)
body += f'<polyline points="86,700 124,660" stroke="{SH}" stroke-width="4" stroke-linecap="round" fill="none"/>'
body += poly([(160,520),(208,486),(246,534),(204,586)], "#f4f6fa")
body += f'<polyline points="176,540 214,508" stroke="#cfd6df" stroke-width="3" stroke-linecap="round" fill="none"/>'
body += poly([(226,516),(244,456),(292,418),(330,400),(324,446),(284,492),(246,540)], SK)
body += limb([(270,448),(344,376)], 17, SK) + limb([(262,466),(346,396)], 17, SK) + limb([(254,486),(336,416)], 16, SK)
body += limb([(286,430),(356,344)], 16, SK)
body += f'<polyline points="300,424 352,366" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/><polyline points="290,444 340,394" stroke="{SH}" stroke-width="3" stroke-linecap="round" fill="none"/>'
body += crest(420,640,"#fff","#1c9a5a")
write("drills/chip.svg", body, "translate(-30,30) rotate(-9 300 830) translate(300 830) scale(1.12) translate(-300 -830)")
