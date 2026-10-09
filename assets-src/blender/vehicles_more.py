"""Coaster, Ranger and Cruiser builders (the hatch lives in build_vehicles.py)."""
import math
from mathutils import Vector
from cbhr_lib import Part, loft, shade_by_angle
from cbhr_vehicle import apply_boolean, cutter, profile_of, roof_window, side_window, stations_from


def finish_body(part, g, r, yf, yr, arch_scale=1.0, arch_extra=0.05, bevel=0.035, inner=0.62):
    """Bevels the loft, cuts the wheel arches and returns the object."""
    body = part.to_object(bevel=bevel)
    cutters = []
    for y in (yf, yr):
        for side in (-1, 1):
            cutters.append(cutter((side * inner, y, g + r), (r + arch_extra) * arch_scale, 0.72))
    apply_boolean(body, cutters)
    shade_by_angle(body.data, 38)
    return body


def flares(d, g, r, yf, yr, wb, flare, mat="black"):
    """Fender flares: a thick ring segment over each wheel arch."""
    for y in (yf, yr):
        for side in (-1, 1):
            segs = 14
            r_in = r + 0.06
            r_out = r + 0.13
            x_in = side * (wb - 0.02)
            x_out = side * (wb + flare)
            prev = None
            for i in range(segs + 1):
                a = math.radians(15 + 150 * i / segs)
                ci, si = math.cos(a), math.sin(a)
                cur = [
                    (x_in, y + r_in * ci, g + r + r_in * si),
                    (x_out, y + r_in * ci, g + r + r_in * si),
                    (x_out, y + r_out * ci, g + r + r_out * si),
                    (x_in, y + r_out * ci, g + r + r_out * si),
                ]
                if prev:
                    for k in range(4):
                        k2 = (k + 1) % 4
                        d.quad(prev[k], prev[k2], cur[k2], cur[k], mat)
                prev = cur


def roof_rack(d, gz, z, y0, y1, half, crossbars=5, mat="black"):
    n = max(2, crossbars)
    for side in (-1, 1):
        d.box((side * half, (y0 + y1) / 2, gz + z), (0.035, abs(y1 - y0), 0.04), mat, bevel=0.008)
    for i in range(n):
        y = y0 + (y1 - y0) * i / (n - 1)
        d.box((0, y, gz + z), (half * 2, 0.035, 0.035), mat)
    for side in (-1, 1):
        for y in (y0, y1):
            d.box((side * half, y, gz + z - 0.04), (0.03, 0.03, 0.08), mat)


def lamp_pair(d, gz, y, x, z, w, h, kind="light_head", bezel=True, rear=False):
    for side in (-1, 1):
        d.box((side * x, y, gz + z), (w, 0.06, h), kind, bevel=0.015)
        if bezel:
            d.box((side * x, y + (-0.012 if rear else 0.012), gz + z), (w + 0.03, 0.03, h + 0.03), "chrome", bevel=0.008)


def luggage_pile(d, gz, z, y, items):
    for (x, dy, dz, sx, sy, sz, mat) in items:
        d.box((x, y + dy, gz + z + dz), (sx, sy, sz), mat, bevel=0.05)


def dragon_decal(d, gz, x, y0, y1, z0, z1, mat="accent"):
    """A simple S-curved dragon body ribbon with a head, painted on a flank at x."""
    n = 22
    pts = []
    for i in range(n + 1):
        t = i / n
        y = y0 + (y1 - y0) * t
        z = z0 + (z1 - z0) * (0.5 + 0.5 * math.sin(t * math.pi * 2.0 + 0.4)) * 0.7 + (z1 - z0) * 0.15
        pts.append((y, z))
    for i in range(n):
        (ya, za), (yb, zb) = pts[i], pts[i + 1]
        w0 = 0.05 * (1 - abs(i / n - 0.35)) + 0.012
        w1 = 0.05 * (1 - abs((i + 1) / n - 0.35)) + 0.012
        d.quad((x, ya, gz + za - w0), (x, yb, gz + zb - w1), (x, yb, gz + zb + w1), (x, ya, gz + za + w0), mat)
    ya, za = pts[-1]
    d.poly([(x, ya, gz + za - 0.05), (x, ya + 0.13, gz + za - 0.02), (x, ya + 0.15, gz + za + 0.03), (x, ya + 0.03, gz + za + 0.07)], mat)


def common(p):
    g = p["axles"][0]["wheelY"] - p["wheelRadius"]
    return g, -p["axles"][0]["z"], -p["axles"][1]["z"], p["wheelRadius"]


# --------------------------------------------------------------------------------------------- coaster


def build_coaster(p):
    g, yf, yr, r = common(p)
    ST = stations_from(
        [
            dict(y=-3.30, wb=0.98, wt=0.93, zb=0.50, zbelt=1.00, zt=2.46, r=0.10, crown=0.03),
            dict(y=-3.18, wb=1.03, wt=0.97, zb=0.44, zbelt=1.00, zt=2.56, r=0.10, crown=0.03),
            dict(y=2.62, wb=1.03, wt=0.97, zb=0.44, zbelt=1.00, zt=2.58, r=0.10, crown=0.03),
            dict(y=3.02, wb=1.02, wt=0.96, zb=0.46, zbelt=0.96, zt=1.52, r=0.10),
            dict(y=3.26, wb=0.98, wt=0.9, zb=0.52, zbelt=0.9, zt=1.08, r=0.12),
            dict(y=3.32, wb=0.9, wt=0.84, zb=0.62, zbelt=0.8, zt=0.92, r=0.12),
        ],
        g,
    )
    part = Part("body")
    loft(part, [(s["y"], profile_of(s)) for s in ST], lambda i, k, side: "paint")
    c = Vector((0, 0, g + 1.4))
    for side in (-1, 1):
        for (a, b) in [(-3.05, -2.3), (-2.2, -1.45), (-1.35, -0.6), (-0.5, 0.25), (0.35, 1.1), (1.2, 1.95)]:
            side_window(part, ST, a, b, side, 0.12, 0.14, cols=2, rows=2, center=c)
        side_window(part, ST, 2.15, 2.85, side, 0.1, 0.12, cols=2, rows=2, center=c)
    roof_window(part, ST, 3.0, 2.72, xfrac=0.9, cols=6)
    roof_window(part, ST, -3.18, -3.30, xfrac=0.8, cols=5, rows=1)
    body = finish_body(part, g, r, yf, yr, bevel=0.04, inner=0.62)

    d = Part("details")
    gz = g
    for side in (-1, 1):
        d.box((side * 1.04, 0.0, gz + 0.46), (0.03, 6.2, 0.14), "black", bevel=0.01)
        for y in (1.98, 2.9):
            d.box((side * 1.04, y, gz + 1.5), (0.014, 0.012, 1.1), "black")
        d.box((side * 1.05, 2.1, gz + 1.15), (0.02, 0.2, 0.04), "chrome")
        d.box((side * 1.0, 2.5, gz + 0.38), (0.12, 0.7, 0.05), "chrome")
        d.box((side * 1.035, 0.0, gz + 1.05), (0.012, 6.0, 0.14), "accent")
        d.box((side * 1.035, 0.0, gz + 0.9), (0.012, 6.0, 0.05), "trim")
        d.box((side * 1.2, 3.0, gz + 1.5), (0.07, 0.04, 0.3), "black")
        d.box((side * 1.22, 2.98, gz + 1.62), (0.1, 0.06, 0.2), "black", bevel=0.02)
    lamp_pair(d, gz, 3.31, 0.74, 0.78, 0.3, 0.2)
    lamp_pair(d, gz, 3.31, 0.78, 0.56, 0.1, 0.07, kind="light_amber", bezel=False)
    lamp_pair(d, gz, -3.31, 0.86, 0.92, 0.1, 0.5, kind="light_tail", rear=True)
    d.box((0, 3.325, gz + 0.8), (1.0, 0.05, 0.3), "black", bevel=0.01)
    for i in range(5):
        d.box((0, 3.33, gz + 0.7 + i * 0.05), (0.96, 0.02, 0.012), "chrome")
    d.box((0, 3.26, gz + 0.48), (1.9, 0.22, 0.22), "chrome", bevel=0.05)
    d.box((0, -3.26, gz + 0.5), (1.9, 0.22, 0.24), "black", bevel=0.05)
    d.box((0, 3.37, gz + 0.5), (0.4, 0.015, 0.12), "paint")
    d.box((0, -3.32, gz + 0.75), (0.42, 0.015, 0.12), "paint")
    d.box((0, 3.29, gz + 1.7), (1.5, 0.05, 0.1), "black")
    d.box((0, 3.31, gz + 1.7), (1.3, 0.02, 0.07), "light_amber")
    roof_rack(d, gz, 2.62, -2.9, 1.6, 0.8, crossbars=7)
    luggage_pile(
        d, gz, 2.7, -0.7,
        [(-0.25, -0.9, 0.2, 0.7, 0.7, 0.4, "luggage_a"), (0.3, -0.5, 0.18, 0.55, 0.6, 0.36, "luggage_b"), (-0.1, 0.4, 0.16, 0.8, 0.5, 0.3, "canvas"), (0.35, 1.0, 0.2, 0.5, 0.55, 0.38, "luggage_c"), (-0.35, 1.4, 0.15, 0.5, 0.5, 0.3, "luggage_a")],
    )
    d.box((0.45, -3.34, gz + 1.6), (0.04, 0.03, 1.5), "chrome")
    d.box((-0.45, -3.34, gz + 1.6), (0.04, 0.03, 1.5), "chrome")
    for z in (1.0, 1.4, 1.8, 2.2):
        d.box((0, -3.34, gz + z), (0.9, 0.03, 0.04), "chrome")
    d.box((0, -0.3, gz + 1.0), (1.8, 5.6, 0.06), "interior")
    for i in range(7):
        y = -2.8 + i * 0.78
        for side in (-1, 1):
            d.box((side * 0.55, y, gz + 1.45), (0.55, 0.12, 0.7), "interior", bevel=0.03)
            d.box((side * 0.55, y + 0.2, gz + 1.15), (0.55, 0.4, 0.14), "interior", bevel=0.03)
    d.box((0, 2.75, gz + 1.5), (0.5, 0.3, 0.6), "interior", bevel=0.04)
    return [body, d.to_object(smooth_angle=40.0)]


# ----------------------------------------------------------------------------------------------- ranger


def build_ranger(p):
    g, yf, yr, r = common(p)
    ST = stations_from(
        [
            dict(y=-2.15, wb=0.86, wt=0.74, zb=0.38, zbelt=0.82, zt=1.18, r=0.1),
            dict(y=-2.1, wb=0.94, wt=0.76, zb=0.34, zbelt=1.0, zt=1.46, r=0.09, shoulder=0.4),
            dict(y=-1.85, wb=0.95, wt=0.77, zb=0.32, zbelt=1.04, zt=1.72, r=0.09),
            dict(y=-0.2, wb=0.95, wt=0.77, zb=0.32, zbelt=1.04, zt=1.76, r=0.09),
            dict(y=0.55, wb=0.95, wt=0.82, zb=0.32, zbelt=1.04, zt=1.18, r=0.09),
            dict(y=1.55, wb=0.93, wt=0.82, zb=0.32, zbelt=1.0, zt=1.14, r=0.09),
            dict(y=2.07, wb=0.9, wt=0.8, zb=0.38, zbelt=0.92, zt=1.04, r=0.1),
            dict(y=2.15, wb=0.82, wt=0.74, zb=0.46, zbelt=0.7, zt=0.84, r=0.1),
        ],
        g,
    )
    part = Part("body")
    loft(part, [(s["y"], profile_of(s)) for s in ST], lambda i, k, side: "paint")
    c = Vector((0, 0, g + 1.1))
    for side in (-1, 1):
        side_window(part, ST, -1.78, -0.9, side, 0.1, 0.1, cols=2, center=c)
        side_window(part, ST, -0.8, -0.05, side, 0.1, 0.1, cols=2, center=c)
        side_window(part, ST, 0.02, 0.5, side, 0.1, 0.1, cols=1, center=c)
    roof_window(part, ST, 0.52, -0.18, xfrac=0.9)
    roof_window(part, ST, -1.86, -2.1, xfrac=0.86)
    body = finish_body(part, g, r, yf, yr, bevel=0.04, inner=0.62)
    d = Part("details")
    gz = g
    for side in (-1, 1):
        d.box((side * 0.955, 0.0, gz + 0.4), (0.035, 3.3, 0.14), "black", bevel=0.01)
        for y in (-0.82, 0.12, 0.62):
            d.box((side * 0.955, y, gz + 0.8), (0.014, 0.012, 0.72), "black")
        d.box((side * 0.96, -0.5, gz + 0.98), (0.02, 0.16, 0.035), "chrome")
        d.box((side * 0.96, 0.28, gz + 0.98), (0.02, 0.16, 0.035), "chrome")
        d.box((side * 1.03, 0.5, gz + 1.25), (0.06, 0.1, 0.11), "paint", bevel=0.02)
        d.box((side * 0.98, 0.54, gz + 1.2), (0.1, 0.03, 0.03), "black")
        d.box((side * 0.952, 0.0, gz + 0.62), (0.012, 3.9, 0.08), "accent")
        d.box((side * 0.952, 0.0, gz + 0.52), (0.012, 3.9, 0.03), "trim")
        d.box((side * 0.99, 0.05, gz + 0.34), (0.1, 1.8, 0.05), "black", bevel=0.01)
    flares(d, gz, r, yf, yr, 0.95, 0.06)
    lamp_pair(d, gz, 2.13, 0.62, 0.78, 0.32, 0.14)
    lamp_pair(d, gz, 2.13, 0.66, 0.6, 0.12, 0.06, kind="light_amber", bezel=False)
    lamp_pair(d, gz, -2.14, 0.76, 0.92, 0.12, 0.34, kind="light_tail", rear=True)
    d.box((0, 2.14, gz + 0.74), (0.7, 0.05, 0.22), "black", bevel=0.01)
    for i in range(4):
        d.box((0, 2.15, gz + 0.66 + i * 0.045), (0.64, 0.02, 0.012), "chrome")
    d.box((0, 2.1, gz + 0.45), (1.62, 0.2, 0.2), "black", bevel=0.04)
    d.box((0, 2.12, gz + 0.38), (0.9, 0.2, 0.04), "chrome")
    d.box((0, -2.1, gz + 0.46), (1.6, 0.16, 0.22), "black", bevel=0.04)
    d.box((0, 2.2, gz + 0.5), (0.38, 0.015, 0.1), "paint")
    d.box((0, -2.2, gz + 0.62), (0.38, 0.015, 0.1), "paint")
    d.cylinder((0, -2.22, gz + 0.9), 0.34, 0.2, "y", "rubber", segs=20)
    d.cylinder((0, -2.33, gz + 0.9), 0.2, 0.04, "y", "rim", segs=14)
    roof_rack(d, gz, 1.78, -1.7, 0.2, 0.62, crossbars=5)
    luggage_pile(
        d, gz, 1.78, -0.7,
        [(-0.18, -0.5, 0.2, 0.55, 0.6, 0.38, "luggage_b"), (0.25, 0.1, 0.17, 0.5, 0.55, 0.32, "luggage_a"), (-0.1, 0.5, 0.14, 0.7, 0.4, 0.26, "canvas")],
    )
    d.box((0, -0.2, gz + 1.05), (1.4, 3.0, 0.06), "interior")
    for side in (-1, 1):
        d.box((side * 0.38, 0.3, gz + 1.15), (0.42, 0.14, 0.4), "interior", bevel=0.03)
        d.box((side * 0.38, -0.7, gz + 1.15), (0.42, 0.14, 0.4), "interior", bevel=0.03)
    return [body, d.to_object(smooth_angle=40.0)]


# ---------------------------------------------------------------------------------------------- cruiser


def build_cruiser(p):
    g, yf, yr, r = common(p)
    ST = stations_from(
        [
            dict(y=-2.45, wb=0.9, wt=0.82, zb=0.5, zbelt=1.0, zt=1.9, r=0.07, crown=0.01),
            dict(y=-2.38, wb=0.98, wt=0.84, zb=0.46, zbelt=1.1, zt=1.94, r=0.07, crown=0.01),
            dict(y=-0.2, wb=0.98, wt=0.84, zb=0.44, zbelt=1.1, zt=1.96, r=0.07, crown=0.01),
            dict(y=0.62, wb=0.98, wt=0.86, zb=0.44, zbelt=1.1, zt=1.32, r=0.07, crown=0.0),
            dict(y=2.28, wb=0.97, wt=0.88, zb=0.5, zbelt=1.08, zt=1.28, r=0.07, crown=0.0),
            dict(y=2.45, wb=0.9, wt=0.82, zb=0.56, zbelt=0.9, zt=1.1, r=0.08, crown=0.0),
        ],
        g,
    )
    part = Part("body")
    loft(part, [(s["y"], profile_of(s)) for s in ST], lambda i, k, side: "paint")
    c = Vector((0, 0, g + 1.4))
    for side in (-1, 1):
        side_window(part, ST, -2.1, -1.35, side, 0.1, 0.1, cols=2, center=c)
        side_window(part, ST, -1.25, -0.5, side, 0.1, 0.1, cols=2, center=c)
        side_window(part, ST, -0.4, 0.45, side, 0.1, 0.1, cols=2, center=c)
    roof_window(part, ST, 0.58, -0.12, xfrac=0.92)
    body = finish_body(part, g, r, yf, yr, arch_scale=1.1, arch_extra=0.09, bevel=0.045, inner=0.66)
    d = Part("details")
    gz = g
    for side in (-1, 1):
        d.box((side * 0.99, 0.0, gz + 0.5), (0.04, 3.9, 0.16), "black", bevel=0.01)
        for y in (-1.3, -0.45, 0.5):
            d.box((side * 0.985, y, gz + 0.95), (0.016, 0.012, 0.9), "black")
        d.box((side * 0.99, -0.58, gz + 1.12), (0.025, 0.2, 0.04), "chrome")
        d.box((side * 0.99, 0.36, gz + 1.12), (0.025, 0.2, 0.04), "chrome")
        d.box((side * 1.08, 0.6, gz + 1.5), (0.07, 0.12, 0.14), "paint", bevel=0.02)
        d.box((side * 1.02, 0.64, gz + 1.44), (0.14, 0.04, 0.04), "black")
        d.box((side * 1.0, 0.1, gz + 0.4), (0.18, 2.4, 0.05), "chrome", bevel=0.01)
        d.box((side * 0.985, 0.0, gz + 0.8), (0.012, 4.4, 0.05), "trim")
        dragon_decal(d, gz, side * 0.992, -1.7, 0.5, 0.8, 1.3, mat="accent")
    flares(d, gz, r, yf, yr, 0.98, 0.1)
    for side in (-1, 1):
        d.cylinder((side * 0.66, 2.46, gz + 0.98), 0.14, 0.08, "y", "chrome", segs=18)
        d.cylinder((side * 0.66, 2.5, gz + 0.98), 0.115, 0.05, "y", "light_head", segs=18)
        d.box((side * 0.82, 2.46, gz + 0.98), (0.14, 0.05, 0.12), "light_amber", bevel=0.012)
    d.box((0, 2.47, gz + 0.84), (0.6, 0.05, 0.4), "black", bevel=0.01)
    for i in range(7):
        d.box((-0.24 + i * 0.08, 2.5, gz + 0.84), (0.03, 0.04, 0.36), "chrome")
    d.box((0, 2.4, gz + 0.5), (1.9, 0.26, 0.22), "black", bevel=0.05)
    d.box((0, 2.5, gz + 0.5), (0.45, 0.14, 0.16), "chrome", bevel=0.02)
    d.box((0, 2.64, gz + 1.18), (1.3, 0.04, 0.05), "black")
    d.box((0, 2.64, gz + 0.74), (1.3, 0.04, 0.05), "black")
    for side in (-1, 1):
        d.box((side * 0.62, 2.62, gz + 0.96), (0.05, 0.05, 0.5), "black")
    lamp_pair(d, gz, -2.46, 0.84, 1.18, 0.12, 0.3, kind="light_tail", rear=True)
    d.box((0, -2.55, gz + 0.56), (1.9, 0.16, 0.2), "black", bevel=0.04)
    d.cylinder((0, -2.55, gz + 1.18), 0.46, 0.22, "y", "rubber", segs=24)
    d.cylinder((0, -2.67, gz + 1.18), 0.28, 0.04, "y", "rim", segs=14)
    d.box((0, 2.5, gz + 0.42), (0.38, 0.015, 0.1), "paint")
    roof_rack(d, gz, 1.96, -2.2, 0.35, 0.78, crossbars=6)
    d.box((0, 0.45, gz + 2.12), (1.5, 0.12, 0.1), "black", bevel=0.03)
    for i in range(5):
        d.cylinder((-0.55 + i * 0.275, 0.52, gz + 2.12), 0.07, 0.06, "y", "light_head", segs=14)
    luggage_pile(
        d, gz, 1.98, -1.1,
        [(-0.3, -0.5, 0.2, 0.55, 0.7, 0.4, "luggage_a"), (0.28, -0.3, 0.17, 0.5, 0.6, 0.34, "luggage_c"), (-0.1, 0.4, 0.14, 0.8, 0.5, 0.3, "canvas"), (0.35, 0.9, 0.2, 0.3, 0.3, 0.4, "luggage_b")],
    )
    d.cylinder((0.78, 0.72, gz + 1.5), 0.04, 1.1, "z", "black", segs=8)
    d.box((0.78, 0.72, gz + 2.08), (0.1, 0.1, 0.1), "black", bevel=0.03)
    d.box((0, -0.3, gz + 1.15), (1.5, 3.6, 0.06), "interior")
    for side in (-1, 1):
        for y in (0.15, -0.85, -1.65):
            d.box((side * 0.4, y, gz + 1.3), (0.44, 0.14, 0.5), "interior", bevel=0.03)
    return [body, d.to_object(smooth_angle=40.0)]
