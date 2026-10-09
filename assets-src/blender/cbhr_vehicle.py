"""Vehicle builder: bodies are lofted from a station table, then detailed with arches, glass, lights, wheels."""
import math
import bpy
from mathutils import Vector
from cbhr_lib import Part, half_profile, loft, shade_by_angle, material

# ------------------------------------------------------------------------------------------- helpers


def lerp(a, b, t):
    return a + (b - a) * t


def station_params(stations, y):
    """Linear interpolation of the station table at y (stations sorted by y ascending)."""
    if y <= stations[0]["y"]:
        return stations[0]
    for a, b in zip(stations, stations[1:]):
        if y <= b["y"]:
            t = (y - a["y"]) / max(1e-9, b["y"] - a["y"])
            return {k: lerp(a[k], b[k], t) if isinstance(a[k], (int, float)) else a[k] for k in a}
    return stations[-1]


def profile_of(s):
    return half_profile(s["wb"], s["wt"], s["zb"], s["zbelt"], s["zt"], s.get("crown", 0.02), s.get("r", 0.07), s.get("shoulder", 0.35))


def x_at_z(hp, z, lo=2, hi=6):
    """Half-width of the surface at height z on the greenhouse/side segments."""
    for i in range(lo, hi):
        (x0, z0), (x1, z1) = hp[i], hp[i + 1]
        if min(z0, z1) - 1e-9 <= z <= max(z0, z1) + 1e-9 and abs(z1 - z0) > 1e-9:
            t = (z - z0) / (z1 - z0)
            return lerp(x0, x1, t)
    return hp[hi][0]


def z_at_x(hp, x, lo=4, hi=8):
    """Height of the top surface at |x| (windscreen / roof area)."""
    for i in range(lo, hi):
        (x0, z0), (x1, z1) = hp[i], hp[i + 1]
        if min(x0, x1) - 1e-9 <= x <= max(x0, x1) + 1e-9 and abs(x1 - x0) > 1e-9:
            t = (x - x0) / (x1 - x0)
            return lerp(z0, z1, t)
    return hp[hi][1]


def glass_quad(part, p00, p01, p11, p10, off=0.006, mat="glass", center=Vector((0, 0, 0))):
    a, b, c, d = Vector(p00), Vector(p01), Vector(p11), Vector(p10)
    n = (b - a).cross(d - a)
    if n.length < 1e-9:
        return
    n.normalize()
    mid = (a + b + c + d) / 4
    if n.dot(mid - center) < 0:
        n = -n
    part.quad(a + n * off, b + n * off, c + n * off, d + n * off, mat)


def side_window(part, stations, y0, y1, side, zlo, zhi, cols=3, rows=2, center=Vector((0, 0, 0.0)), off=0.006, mat="glass"):
    """A glass panel on the greenhouse side between y0..y1 and heights zlo..zhi (measured above the belt line)."""
    ys = [lerp(y0, y1, i / cols) for i in range(cols + 1)]
    pts = []
    for y in ys:
        s = station_params(stations, y)
        hp = profile_of(s)
        zb = min(s["zbelt"], s["zt"] - 0.03)
        zl = zb + zlo
        zh = s["zt"] - zhi
        col = []
        for j in range(rows + 1):
            z = lerp(zl, zh, j / rows)
            col.append(Vector((side * x_at_z(hp, z), y, z)))
        pts.append(col)
    for i in range(cols):
        for j in range(rows):
            a, b, c, d = pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]
            if side < 0:
                a, b, c, d = b, a, d, c
            glass_quad(part, a, b, c, d, off=off, mat=mat, center=center)


def roof_window(part, stations, y0, y1, xfrac=0.86, cols=4, rows=2, off=0.006, mat="glass"):
    """Windscreen / rear glass on the top surface between y0..y1."""
    ys = [lerp(y0, y1, j / rows) for j in range(rows + 1)]
    xs = [lerp(-1, 1, i / cols) for i in range(cols + 1)]
    pts = []
    for y in ys:
        s = station_params(stations, y)
        hp = profile_of(s)
        xm = s["wt"] * xfrac
        row = []
        for f in xs:
            x = abs(f) * xm
            row.append(Vector((f * xm, y, z_at_x(hp, x))))
        pts.append(row)
    for j in range(rows):
        for i in range(cols):
            glass_quad(part, pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i], off=off, mat=mat, center=Vector((0, (y0 + y1) / 2, -0.4)))


def mirror_part(part, fn):
    """Calls fn(side) for both sides."""
    for side in (-1, 1):
        fn(side)


# ----------------------------------------------------------------------------------------------- wheels


def build_wheel(p, kind, name="wheel"):
    """A wheel with its axis along X, centred at the origin. kind: street | alloy | steel | offroad | bus."""
    r = p["wheelRadius"]
    w = p["wheelWidth"]
    part = Part(name)
    segs = 28 if kind in ("offroad", "alloy") else 22
    half = w / 2
    rim_r = r * (0.64 if kind in ("street", "steel") else 0.62 if kind == "bus" else 0.6 if kind == "alloy" else 0.56)
    side_r = r * 0.9
    # tyre cross-section, closed loop around the sidewall/tread (x = along axle)
    tread = r
    prof = [
        (-half * 0.82, rim_r * 1.02),
        (-half * 0.98, rim_r * 1.18),
        (-half, side_r),
        (-half * 0.9, tread * 0.985),
        (-half * 0.55, tread),
        (half * 0.55, tread),
        (half * 0.9, tread * 0.985),
        (half, side_r),
        (half * 0.98, rim_r * 1.18),
        (half * 0.82, rim_r * 1.02),
    ]
    rings = []
    for (x, rad) in prof:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            ring.append((x, rad * math.cos(a), rad * math.sin(a)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            part.quad(rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s], "rubber")
    # inner closure of the tyre (the bore), so it is a closed solid
    for s in range(segs):
        s2 = (s + 1) % segs
        part.quad(rings[-1][s], rings[-1][s2], rings[0][s2], rings[0][s], "rubber")
    # tread blocks on offroad / bus tyres: raised lugs on the shoulder
    if kind in ("offroad", "bus"):
        lug = 0.022 if kind == "offroad" else 0.012
        for s in range(0, segs, 2):
            a0 = 2 * math.pi * s / segs
            a1 = 2 * math.pi * (s + 1) / segs
            for x0, x1 in ((-half * 0.9, -half * 0.12), (half * 0.12, half * 0.9)):
                pts = []
                for (x, aa, rr) in ((x0, a0, tread), (x1, a0, tread), (x1, a1, tread), (x0, a1, tread)):
                    pts.append((x, rr * math.cos(aa), rr * math.sin(aa)))
                top = [(x, (rr + lug) * math.cos(aa), (rr + lug) * math.sin(aa)) for (x, aa, rr) in ((x0, a0 + 0.02, tread), (x1, a0 + 0.02, tread), (x1, a1 - 0.02, tread), (x0, a1 - 0.02, tread))]
                part.poly(top, "rubber")
                for k in range(4):
                    k2 = (k + 1) % 4
                    part.quad(pts[k], pts[k2], top[k2], top[k], "rubber")
    # rim: dished disc on the outer face (+x) and inner face (-x)
    rr = rim_r
    for sgn in (1, -1):
        x_face = sgn * half * 0.78
        x_dish = sgn * half * 0.55
        ring_o = [(x_face, rr * 1.02 * math.cos(2 * math.pi * s / segs), rr * 1.02 * math.sin(2 * math.pi * s / segs)) for s in range(segs)]
        ring_i = [(x_dish, rr * 0.55 * math.cos(2 * math.pi * s / segs), rr * 0.55 * math.sin(2 * math.pi * s / segs)) for s in range(segs)]
        ring_h = [(x_dish + sgn * 0.012, rr * 0.2 * math.cos(2 * math.pi * s / segs), rr * 0.2 * math.sin(2 * math.pi * s / segs)) for s in range(segs)]
        for s in range(segs):
            s2 = (s + 1) % segs
            part.quad(ring_o[s], ring_o[s2], ring_i[s2], ring_i[s], "rim")
            part.quad(ring_i[s], ring_i[s2], ring_h[s2], ring_h[s], "black" if kind in ("alloy",) else "rim")
        part.poly(ring_h, "chrome")
        if kind in ("alloy", "offroad"):
            n = 6 if kind == "alloy" else 8
            for sp in range(n):
                a = 2 * math.pi * sp / n
                ca, sa = math.cos(a), math.sin(a)
                nx = -sa
                nz = ca
                wd = rr * 0.09
                p0 = (x_dish + sgn * 0.016, rr * 0.2 * ca - wd * nx, rr * 0.2 * sa - wd * nz)
                p1 = (x_dish + sgn * 0.016, rr * 0.2 * ca + wd * nx, rr * 0.2 * sa + wd * nz)
                p2 = (x_dish + sgn * 0.016, rr * 0.98 * ca + wd * 0.8 * nx, rr * 0.98 * sa + wd * 0.8 * nz)
                p3 = (x_dish + sgn * 0.016, rr * 0.98 * ca - wd * 0.8 * nx, rr * 0.98 * sa - wd * 0.8 * nz)
                part.quad(p0, p1, p2, p3, "rim")
    # brake disc + caliper visible behind the spokes
    if kind in ("alloy", "offroad", "bus"):
        part.cylinder((half * 0.35, 0, 0), rr * 0.85, half * 0.18, "x", "black", segs=segs)
        part.box((half * 0.35, 0, rr * 0.55), (half * 0.35, rr * 0.35, rr * 0.35), "light_tail" if kind == "alloy" else "black")
    # hub nuts / centre cap
    part.cylinder((half * 0.82, 0, 0), rr * 0.16, 0.03, "x", "chrome", segs=10)
    part.cylinder((-half * 0.82, 0, 0), rr * 0.16, 0.03, "x", "chrome", segs=10)
    return part.to_object(smooth_angle=45.0)


# ---------------------------------------------------------------------------------------- shared builders

def apply_boolean(obj, cutters):
    for c in cutters:
        mod = obj.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = c
        mod.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me2 = bpy.data.meshes.new_from_object(ev)
    obj.modifiers.clear()
    old = obj.data
    obj.data = me2
    bpy.data.meshes.remove(old)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def cutter(center, radius, depth, axis="x"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=center, rotation=(0, math.radians(90), 0) if axis == "x" else (0, 0, 0))
    o = bpy.context.active_object
    o.data.materials.append(bpy.data.materials["black"])
    return o


def stations_from(spec, g):
    out = []
    for s in spec:
        d = dict(crown=0.02, r=0.07, shoulder=0.35)
        d.update(s)
        for k in ("zb", "zbelt", "zt"):
            d[k] = g + s[k]
        out.append(d)
    return sorted(out, key=lambda d: d["y"])


