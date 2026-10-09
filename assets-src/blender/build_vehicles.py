"""Builds the four vehicle GLBs. Run (from the repo root):

  blender -b -P assets-src/blender/build_vehicles.py -- <id|all> [--preview]

Output: assets-src/out/<id>.glb  (nodes: "body" and "wheel"), then scripts/build-models.mjs optimises them
into public/models/vehicles/.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from cbhr_lib import Part, clear_scene, export_glb, standard_materials, loft, shade_by_angle  # noqa: E402
from cbhr_vehicle import (  # noqa: E402
    apply_boolean,
    cutter,
    stations_from,
    build_wheel,
    glass_quad,
    half_profile,
    profile_of,
    roof_window,
    side_window,
    station_params,
)

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PARAMS = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "assets-src", "vehicle-params.json")))}
OUT = os.path.join(ROOT, "assets-src", "out")


# -------------------------------------------------------------------------------------------------- hatch


def build_hatch(p):
    g = p["axles"][0]["wheelY"] - p["wheelRadius"]
    yf, yr = -p["axles"][0]["z"], -p["axles"][1]["z"]
    r = p["wheelRadius"]
    ST = stations_from(
        [
            dict(y=-1.80, wb=0.70, wt=0.60, zb=0.30, zbelt=0.62, zt=1.02, r=0.09),
            dict(y=-1.74, wb=0.81, wt=0.63, zb=0.26, zbelt=0.90, zt=1.30, r=0.08, shoulder=0.4),
            dict(y=-1.50, wb=0.83, wt=0.64, zb=0.22, zbelt=0.92, zt=1.55, r=0.08),
            dict(y=-0.30, wb=0.84, wt=0.64, zb=0.22, zbelt=0.92, zt=1.58, r=0.08),
            dict(y=0.40, wb=0.84, wt=0.70, zb=0.22, zbelt=0.92, zt=1.00, r=0.08),
            dict(y=1.20, wb=0.82, wt=0.74, zb=0.22, zbelt=0.90, zt=0.96, r=0.08),
            dict(y=1.72, wb=0.80, wt=0.72, zb=0.26, zbelt=0.82, zt=0.90, r=0.09),
            dict(y=1.80, wb=0.74, wt=0.68, zb=0.34, zbelt=0.62, zt=0.74, r=0.10),
        ],
        g,
    )
    part = Part("body")
    loft(part, [(s["y"], profile_of(s)) for s in ST], lambda i, k, side: "paint")
    # glazing
    c = Vector((0, 0, g + 0.9))
    for side in (-1, 1):
        side_window(part, ST, -1.36, -0.34, side, 0.06, 0.07, cols=3, center=c)
        side_window(part, ST, -0.28, 0.28, side, 0.06, 0.07, cols=2, center=c)
    roof_window(part, ST, 0.46, -0.28, xfrac=0.9)  # windscreen
    roof_window(part, ST, -1.5, -1.76, xfrac=0.86)  # tailgate glass
    body = part.to_object(bevel=0.035)
    # wheel arches
    cutters = []
    for y in (yf, yr):
        for side in (-1, 1):
            cutters.append(cutter((side * 0.62, y, g + r), r + 0.05, 0.62))
    apply_boolean(body, cutters)
    shade_by_angle(body.data, 38)

    d = Part("details")
    gz = g
    # sill + lower valance in black plastic, door seams, handles, mirrors
    for side in (-1, 1):
        d.box((side * 0.838, 0.0, gz + 0.30), (0.03, 2.5, 0.12), "black", bevel=0.01)
        for y in (-0.78, 0.30):
            d.box((side * 0.842, y, gz + 0.62), (0.014, 0.012, 0.64), "black")
        d.box((side * 0.846, -0.42, gz + 0.86), (0.02, 0.16, 0.035), "chrome")
        d.box((side * 0.846, 0.38, gz + 0.86), (0.02, 0.16, 0.035), "chrome")
        # mirror
        d.box((side * 0.93, 0.36, gz + 1.0), (0.05, 0.1, 0.1), "paint", bevel=0.02)
        d.box((side * 0.88, 0.40, gz + 0.97), (0.1, 0.03, 0.03), "black")
        # accent stripe + trim line
        d.box((side * 0.836, 0.0, gz + 0.70), (0.012, 3.0, 0.07), "accent")
        d.box((side * 0.836, 0.0, gz + 0.60), (0.012, 3.0, 0.03), "trim")
        # head and tail lamps
        d.box((side * 0.56, 1.80, gz + 0.62), (0.28, 0.06, 0.14), "light_head", bevel=0.02)
        d.box((side * 0.56, 1.805, gz + 0.62), (0.31, 0.03, 0.17), "chrome", bevel=0.01)
        d.box((side * 0.70, -1.80, gz + 0.86), (0.1, 0.05, 0.28), "light_tail", bevel=0.015)
        d.box((side * 0.58, 1.77, gz + 0.36), (0.08, 0.05, 0.05), "light_amber")
    # grille + number plate + bumpers
    d.box((0, 1.80, gz + 0.52), (0.62, 0.05, 0.10), "black", bevel=0.01)
    d.box((0, 1.805, gz + 0.54), (0.5, 0.03, 0.02), "chrome")
    d.box((0, 1.78, gz + 0.32), (1.38, 0.14, 0.18), "black", bevel=0.03)
    d.box((0, -1.79, gz + 0.36), (1.4, 0.14, 0.2), "black", bevel=0.03)
    d.box((0, 1.86, gz + 0.36), (0.36, 0.015, 0.1), "paint")
    d.box((0, -1.83, gz + 0.5), (0.4, 0.015, 0.11), "paint")
    # roof rack with lashed luggage
    for side in (-1, 1):
        d.box((side * 0.56, -0.5, gz + 1.65), (0.03, 1.5, 0.03), "black")
    for y in (-1.15, -0.5, 0.15):
        d.box((0, y, gz + 1.64), (1.18, 0.03, 0.03), "black")
    d.box((-0.18, -0.55, gz + 1.84), (0.56, 0.62, 0.34), "luggage_a", bevel=0.05)
    d.box((0.28, -0.7, gz + 1.8), (0.4, 0.45, 0.26), "luggage_b", bevel=0.05)
    d.box((0.05, -0.1, gz + 1.76), (0.7, 0.3, 0.2), "canvas", bevel=0.04)
    # interior hints visible through the glass
    d.box((0, -0.2, gz + 1.1), (1.1, 1.5, 0.05), "interior")
    for side in (-1, 1):
        d.box((side * 0.32, -0.25, gz + 1.0), (0.4, 0.14, 0.34), "interior", bevel=0.03)
        d.box((side * 0.32, 0.35, gz + 0.92), (0.4, 0.5, 0.12), "interior", bevel=0.03)
    dobj = d.to_object(smooth_angle=40.0)
    return [body, dobj]


# ----------------------------------------------------------------------------------------------- driver


from vehicles_more import build_coaster, build_cruiser, build_ranger  # noqa: E402

BUILDERS = {
    "dzo-hatch": ("street", build_hatch),
    "tourist-coaster": ("bus", build_coaster),
    "druk-ranger": ("alloy", build_ranger),
    "dragon-cruiser": ("offroad", build_cruiser),
}


def build(vid, preview=False):
    clear_scene()
    standard_materials()
    p = PARAMS[vid]
    kind, fn = BUILDERS[vid]
    objs = fn(p)
    wheel = build_wheel(p, kind)
    wheel.name = "wheel"
    # one mesh object named "body": join the parts
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = "body"
    wheel.location = (0, 0, 0)
    os.makedirs(OUT, exist_ok=True)
    export_glb([objs[0], wheel], os.path.join(OUT, f"{vid}.glb"), ())
    print("EXPORTED", vid)
    if preview:
        # Show the car with wheels placed for a quick look.
        for ax in p["axles"]:
            for side in (-1, 1):
                w = wheel.copy()
                w.data = wheel.data
                w.location = (side * ax["halfTrack"], -ax["z"], ax["wheelY"])
                bpy.context.scene.collection.objects.link(w)
        render_previews(vid, p)


def render_previews(vid, p):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.render.resolution_x = 900
    sc.render.resolution_y = 560
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_cavity = True
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.55, 0.55, 0.55)
    sc.view_settings.view_transform = "Standard"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    L = p["size"]["length"]
    views = {
        "front34": (L * 1.1, L * 0.9, 1.2, 0.0),
        "rear34": (-L * 1.1, -L * 0.9, 1.4, 0.0),
        "side": (L * 1.9, 0.0, 0.2, 0.0),
        "front": (0.0, L * 1.9, 0.4, 0.0),
    }
    for name, (x, y, z, _) in views.items():
        if name == "front34":
            cam.location = (2.6, L * 1.05, 1.4)
        elif name == "rear34":
            cam.location = (-2.6, -L * 1.05, 1.5)
        elif name == "side":
            cam.location = (L * 1.9, 0.0, 0.2)
        else:
            cam.location = (0.0, L * 1.8, 0.5)
        d = Vector((0, 0, -0.2)) - cam.location
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 45
        sc.render.filepath = os.path.join(OUT, f"{vid}-{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ids = list(BUILDERS) if not argv or argv[0] == "all" else [argv[0]]
    for v in ids:
        build(v, preview="--preview" in argv)
