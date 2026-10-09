"""Builds the environment kit: assets-src/out/env/kit.glb

  blender -b -P assets-src/blender/build_env.py [-- preview]

Every mesh is vertex-coloured, 1 unit = 1 metre, origin at ground level. Names are the keys Scenery looks up.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import env_lib as E  # noqa: E402
from env_lib import VC, mix, shade  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets-src", "out", "env")

BARK = 0x4a3426
BARK_LIGHT = 0x6b4f38
WHITE = 0xece4d0
WHITE_SHADE = 0xcfc6ae
STONE = 0x8b857a
STONE_DARK = 0x6c675f
TIMBER = 0x5b3a22
TIMBER_DARK = 0x3d2615
MAROON = 0x7a2c20
OCHRE = 0xb98a2c
GOLD = 0xd9a62c
ROOF_SLATE = 0x6d6a63
ROOF_WOOD = 0x6a5a48
GLASSDARK = 0x24211e


def trunk(v, z0, z1, r0, r1, sides=7, lean=(0, 0)):
    rings = []
    zs = [z0, z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.7, z1]
    rs = [r0, r0 * 0.82 + r1 * 0.18, r0 * 0.4 + r1 * 0.6, r1]
    for z, r in zip(zs, rs):
        t = (z - z0) / max(1e-6, z1 - z0)
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            ring.append(Vector((lean[0] * t + r * math.cos(a), lean[1] * t + r * math.sin(a), z)))
        rings.append(ring)
    v.ring_loft(rings, lambda i, k: mix(BARK, BARK_LIGHT, 0.25 + 0.5 * ((k + i) % 3) / 2), closed_bottom=False, closed_top=False)


def pine(seed, tiers=6, wide=1.0, droop=0.0, height=1.0, dark=0x2a4b30, light=0x5f8748):
    v = VC("pine", seed)
    trunk(v, 0, 5.4 * height, 0.24, 0.08)
    radii = [(1.95 * wide, 1.7, 1.1), (1.75 * wide, 1.6, 1.9), (1.5 * wide, 1.5, 2.7), (1.25 * wide, 1.4, 3.4), (0.95 * wide, 1.3, 4.0), (0.62 * wide, 1.1, 4.6)][:tiers]
    radii = [(r, h, dz * height) for (r, h, dz) in radii]
    v.tiers(0, 0, 0.0, radii, 8, dark, light, jitter=0.16, twist=0.5, droop=droop)
    return v.to_object()


def spruce(seed):
    v = VC("spruce", seed)
    trunk(v, 0, 6.2, 0.2, 0.06)
    radii = [(1.35, 1.5, 0.9), (1.2, 1.4, 1.6), (1.05, 1.35, 2.3), (0.9, 1.3, 3.0), (0.72, 1.2, 3.7), (0.52, 1.1, 4.4), (0.3, 1.0, 5.1)]
    v.tiers(0, 0, 0.0, radii, 7, 0x213f2a, 0x4a7240, jitter=0.12, twist=0.7)
    return v.to_object()


def cypress(seed):
    v = VC("cypress", seed)
    trunk(v, 0, 1.6, 0.22, 0.14)
    for (r, h, z) in [(1.1, 4.4, 1.1), (0.95, 4.0, 3.2), (0.7, 3.0, 5.6), (0.42, 2.0, 7.4)]:
        v.tiers(0, 0, 0.0, [(r, h, z)], 7, 0x1d382a, 0x3d6a45, jitter=0.1, twist=0.9)
    return v.to_object()


def broadleaf(seed, leaf_low=0x557a35, leaf_high=0x9ab957):
    v = VC("broadleaf", seed)
    trunk(v, 0, 2.6, 0.3, 0.16, lean=(0.2, 0.1))
    v.prism_between((0.2, 0.1, 2.2), (-1.0, 0.6, 3.5), 0.16, BARK)
    v.prism_between((0.2, 0.1, 2.4), (1.2, -0.3, 3.7), 0.15, BARK)
    for (x, y, z, r) in [(0, 0, 4.3, 1.9), (-1.35, 0.5, 3.7, 1.35), (1.45, -0.4, 3.9, 1.4), (0.2, -1.1, 3.5, 1.2), (-0.3, 1.2, 3.6, 1.15)]:
        v.blob((x, y, z), r, leaf_low, leaf_high, subdiv=2, squash=0.8, noise_amt=0.22)
    return v.to_object()


def shrub(seed):
    v = VC("shrub", seed)
    for (x, y, z, r) in [(0, 0, 0.55, 0.85), (0.7, 0.3, 0.4, 0.6), (-0.65, -0.2, 0.42, 0.62)]:
        v.blob((x, y, z), r, 0x3f6232, 0x7aa04a, subdiv=1, squash=0.75, noise_amt=0.25)
    return v.to_object()


def rock(name, seed, size, base=STONE, strata=STONE_DARK, facets=2):
    v = VC(name, seed)
    v.rock((0, 0, 0), size, base, strata, seed=seed, facets=facets)
    return v.to_object()


# ------------------------------------------------------------------------------------------------ buildings


def slab(v, p0, p1, p2, p3, thick, top, side, under):
    """A thick plank from four corners (counter-clockwise seen from above)."""
    n = (Vector(p1) - Vector(p0)).cross(Vector(p3) - Vector(p0)).normalized()
    off = n * thick
    P0, P1, P2, P3 = (Vector(p) for p in (p0, p1, p2, p3))
    v.face([P0, P1, P2, P3], top)
    v.face([P3 - off, P2 - off, P1 - off, P0 - off], under)
    for a, b in ((P0, P1), (P1, P2), (P2, P3), (P3, P0)):
        v.face([a, b, b - off, a - off], side)


def gable_roof(v, w, d, z0, rise, over_x, over_y, top, under, batten=None, front_y=-1):
    """Roof ridge along X. Eaves at z0, ridge z0+rise, with overhangs. Battens: lines of dark strips."""
    hw = w / 2 + over_x
    hd = d / 2 + over_y
    zr = z0 + rise * (hd / (d / 2)) * 0.0 + rise
    ze = z0 - rise * (over_y / (d / 2))
    # near / far slopes
    slab(v, (-hw, -hd, ze), (hw, -hd, ze), (hw, 0, zr), (-hw, 0, zr), 0.18, top, under, under)
    slab(v, (hw, hd, ze), (-hw, hd, ze), (-hw, 0, zr), (hw, 0, zr), 0.18, top, under, under)
    if batten is not None:
        for i in range(1, 9):
            t = i / 9
            y = -hd + hd * t
            z = ze + (zr - ze) * t + 0.02
            v.box((0, y, z + 0.02), (hw * 2 - 0.1, 0.06, 0.05), batten)
            v.box((0, -y, z + 0.02), (hw * 2 - 0.1, 0.06, 0.05), batten)
    # ridge capping
    v.box((0, 0, zr + 0.06), (hw * 2 + 0.1, 0.4, 0.16), TIMBER_DARK)


def window(v, x, y, z, w, h, facing, frame=TIMBER, accent=MAROON, glass=GLASSDARK, depth=0.12):
    """Window on a wall facing +Y (facing=1) or -Y (facing=-1)."""
    d = facing
    v.box((x, y + d * 0.04, z), (w + 0.24, 0.1, h + 0.24), frame)
    v.box((x, y + d * 0.1, z), (w, 0.08, h), glass)
    v.box((x, y + d * 0.1, z), (0.07, 0.1, h), frame)
    v.box((x, y + d * 0.1, z), (w, 0.1, 0.07), frame)
    v.box((x, y + d * 0.08, z + h / 2 + 0.2), (w + 0.5, 0.1, 0.16), accent)  # painted lintel
    v.box((x, y + d * 0.06, z - h / 2 - 0.1), (w + 0.4, 0.14, 0.08), frame)


def house(seed, variant=0):
    v = VC("house" + str(variant), seed)
    W, D = (9.0, 6.4) if variant == 0 else (10.4, 6.0) if variant == 1 else (7.6, 5.6)
    fy = -D / 2  # the front (faces -Y here = +Z in game space)
    v.box((0, 0, -0.9), (W + 0.7, D + 0.7, 3.4), STONE)  # stone plinth that buries slopes
    v.box((0, 0, 0.8), (W + 0.5, D + 0.5, 0.5), STONE_DARK)
    z1 = 3.1
    v.box((0, 0, 0.8 + (z1 - 0.8) / 2 + 0.25), (W, D, z1 - 0.8), WHITE, top=WHITE_SHADE)  # ground floor, limewash
    v.box((0, 0, z1 + 0.1), (W + 0.3, D + 0.3, 0.3), TIMBER_DARK)  # floor beam
    z2 = z1 + 2.7
    v.box((0, 0, z1 + 0.25 + (z2 - z1) / 2), (W - 0.02, D - 0.02, z2 - z1 - 0.1), shade(WHITE, 0.97))  # upper storey
    v.box((0, 0, z2 + 0.15), (W + 0.4, D + 0.4, 0.34), TIMBER_DARK)  # eaves beam
    # ground floor: small openings and the door
    for x in (-3.0, 3.0):
        v.box((x, fy - 0.06, 1.9), (0.7, 0.1, 0.8), GLASSDARK)
        v.box((x, fy - 0.04, 1.9), (0.9, 0.08, 1.0), TIMBER)
    v.box((-0.2, fy - 0.07, 1.9), (1.3, 0.12, 2.1), TIMBER_DARK)
    v.box((-0.2, fy - 0.12, 2.98), (1.7, 0.14, 0.22), MAROON)
    # first floor: triple windows, painted lintels and a timber balcony
    cols = [-3.2, 0.0, 3.2] if variant != 2 else [-2.2, 2.2]
    for x in cols:
        window(v, x, fy, z1 + 1.45, 1.3, 1.25, -1, accent=[MAROON, OCHRE, 0x3f6a7a][int(abs(x * 3)) % 3])
    bal_y = fy - 0.55
    v.box((0, bal_y, z1 + 0.6), (W - 0.8, 1.1, 0.14), TIMBER)
    for i in range(14):
        x = -(W - 1.2) / 2 + i * (W - 1.2) / 13
        v.box((x, bal_y - 0.5, z1 + 1.0), (0.07, 0.07, 0.75), TIMBER_DARK)
    v.box((0, bal_y - 0.5, z1 + 1.4), (W - 0.8, 0.1, 0.09), TIMBER_DARK)
    for sx in (-1, 1):
        v.box((sx * (W - 0.9) / 2, bal_y, z1 + 0.35), (0.14, 0.14, 0.5), TIMBER_DARK)
    # back and side windows
    for x in cols:
        window(v, x, D / 2, z1 + 1.45, 1.1, 1.1, 1)
    for sy in (-1.5, 1.5):
        for sx in (-1, 1):
            v.box((sx * W / 2, sy, z1 + 1.45), (0.1, 1.0, 1.0), GLASSDARK)
            v.box((sx * (W / 2 + 0.02), sy, z1 + 1.45), (0.08, 1.24, 1.24), TIMBER)
    # roof: broad gable, slate or weathered shingle, with weighting stones
    rise = 2.6 if variant != 2 else 2.2
    top = ROOF_SLATE if variant != 1 else ROOF_WOOD
    gable_roof(v, W, D, z2 + 0.3, rise, 1.4, 1.5, top, shade(top, 0.55), batten=shade(top, 0.78))
    rng = v.rng
    for _ in range(26):
        sy = rng.choice((-1, 1))
        t = 0.1 + 0.8 * rng.random()
        hd = D / 2 + 1.5
        zr = z2 + 0.3 + rise
        ze = z2 + 0.3 - rise * (1.5 / (D / 2))
        y = sy * hd * (1 - t)
        z = ze + (zr - ze) * t + 0.14
        x = (rng.random() - 0.5) * (W + 2.0)
        v.box((x, y, z), (0.32, 0.26, 0.12), shade(STONE, 0.8 + 0.3 * rng.random()))
    # gable ends: open timber lattice attic
    for sx in (-1, 1):
        tri_h = rise - 0.2
        v.face([Vector((sx * (W / 2 + 0.01), -D / 2 - 0.1, z2 + 0.45)), Vector((sx * (W / 2 + 0.01), D / 2 + 0.1, z2 + 0.45)), Vector((sx * (W / 2 + 0.01), 0, z2 + 0.45 + tri_h))] if sx > 0 else [Vector((sx * (W / 2 + 0.01), D / 2 + 0.1, z2 + 0.45)), Vector((sx * (W / 2 + 0.01), -D / 2 - 0.1, z2 + 0.45)), Vector((sx * (W / 2 + 0.01), 0, z2 + 0.45 + tri_h))], shade(WHITE, 0.9))
        for k in range(5):
            y = -D / 2 + 0.6 + k * (D - 1.2) / 4
            v.box((sx * (W / 2 + 0.05), y, z2 + 0.9), (0.06, 0.08, 0.75), TIMBER_DARK)
    # prayer flag pole and a stack of firewood
    v.prism_between((W / 2 + 0.9, 0.3, z2 + 0.3), (W / 2 + 0.9, 0.3, z2 + rise + 3.4), 0.1, TIMBER)
    v.box((W / 2 + 0.92, 0.55, z2 + rise + 2.9), (0.02, 0.5, 1.5), 0xefe9d8)
    for i in range(4):
        v.box((-W / 2 + 0.9 + i * 0.28, fy - 0.25, 1.3 + (i % 2) * 0.0), (0.22, 0.4, 0.6), TIMBER)
    return v.to_object()


def chorten(seed=3):
    v = VC("chorten", seed)
    v.box((0, 0, 0.16), (3.9, 3.9, 0.32), STONE)
    for (s, h, z, c) in [(3.5, 0.55, 0.6, WHITE), (3.0, 0.5, 1.12, WHITE), (2.5, 0.5, 1.62, WHITE_SHADE)]:
        v.box((0, 0, z), (s, s, h), c)
    v.box((0, 0, 1.95), (2.6, 2.6, 0.12), MAROON)
    # bell: lathe profile
    prof = [(1.0, 1.95), (1.28, 2.25), (1.4, 2.7), (1.3, 3.15), (1.0, 3.5), (0.72, 3.62)]
    rings = []
    for (r, z) in prof:
        rings.append([Vector((r * math.cos(2 * math.pi * s / 14), r * math.sin(2 * math.pi * s / 14), z)) for s in range(14)])
    v.ring_loft(rings, lambda i, k: WHITE if k % 2 == 0 else WHITE_SHADE, closed_bottom=False, closed_top=False)
    v.box((0, 0, 3.78), (1.34, 1.34, 0.3), MAROON)
    v.box((0, 0, 4.05), (1.0, 1.0, 0.3), GOLD)
    # 13 gilded rings narrowing to the finial
    for i in range(9):
        r = 0.62 - i * 0.05
        z = 4.3 + i * 0.22
        v.box((0, 0, z), (r * 1.6, r * 1.6, 0.14), GOLD)
    v.box((0, 0, 6.5), (0.26, 0.26, 0.5), GOLD)
    v.blob((0, 0, 6.9), 0.2, GOLD, 0xf4d77a, subdiv=1, squash=1.0, noise_amt=0.0, flat_bottom=False)
    return v.to_object()


def build():
    E.reset()
    objs = []
    objs.append(pine(1, tiers=6, wide=1.0, height=1.0))
    objs[-1].name = "pine_a"
    objs.append(pine(7, tiers=5, wide=1.18, droop=0.12, height=0.9, dark=0x2d4a33, light=0x6a8f4d))
    objs[-1].name = "pine_b"
    objs.append(spruce(4))
    objs[-1].name = "spruce"
    objs.append(cypress(5))
    objs[-1].name = "cypress"
    objs.append(broadleaf(6))
    objs[-1].name = "broadleaf"
    objs.append(shrub(8))
    objs[-1].name = "shrub"
    objs.append(rock("rock_a", 2, (1.5, 1.2, 1.0)))
    objs[-1].name = "rock_a"
    objs.append(rock("rock_b", 5, (1.9, 1.3, 0.8), base=0x938c7f, strata=0x756f64))
    objs[-1].name = "rock_b"
    objs.append(rock("rock_c", 9, (1.1, 1.0, 1.5), base=0x867f74, strata=0x655f57))
    objs[-1].name = "rock_c"
    objs.append(rock("boulder", 11, (2.6, 2.2, 1.9), facets=2))
    objs[-1].name = "boulder"
    for i in range(3):
        objs.append(house(10 + i, i))
        objs[-1].name = f"house_{i}"
    objs.append(chorten())
    objs[-1].name = "chorten"
    os.makedirs(OUT, exist_ok=True)
    E.export(objs, os.path.join(OUT, "kit.glb"))
    print("EXPORTED env kit", [o.name for o in objs])
    return objs


def preview(objs):
    sc = bpy.context.scene
    # lay the objects in a row
    x = 0
    for o in objs:
        dims = max(o.dimensions.x, o.dimensions.y)
        o.location = (x + dims / 2, 0, 0)
        x += dims + 2.0
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "VERTEX"
    sc.render.resolution_x = 1800
    sc.render.resolution_y = 520
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.62, 0.66, 0.7)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = x * 0.52
    cam.location = (x / 2, -60, 6)
    cam.rotation_euler = (math.radians(90) - 0.05, 0, 0)
    sc.render.filepath = os.path.join(OUT, "kit-preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    objs = build()
    if "preview" in sys.argv:
        preview(objs)
