"""Vertex-coloured environment modelling kit (trees, rocks, buildings). Run inside Blender, headless.

Frame: +Z up (exported to glTF Y-up), +Y forward (becomes -Z in the game), origin at the base of the object.
Every face carries a hex colour in a custom layer; to_object() bakes those into one corner-colour attribute so
the game can draw each model with a single vertex-coloured material and no textures.
"""
import math
import random
import bpy
import bmesh
from mathutils import Vector, noise, Matrix


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexlin(h):
    return (lin(((h >> 16) & 255) / 255.0), lin(((h >> 8) & 255) / 255.0), lin((h & 255) / 255.0), 1.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    ar, ag, ab = (a >> 16) & 255, (a >> 8) & 255, a & 255
    br, bg, bb = (b >> 16) & 255, (b >> 8) & 255, b & 255
    return (int(ar + (br - ar) * t) << 16) | (int(ag + (bg - ag) * t) << 8) | int(ab + (bb - ab) * t)


def shade(h, k):
    r, g, b = (h >> 16) & 255, (h >> 8) & 255, h & 255
    return (min(255, int(r * k)) << 16) | (min(255, int(g * k)) << 8) | min(255, int(b * k))


class VC:
    def __init__(self, name, seed=1):
        self.name = name
        self.bm = bmesh.new()
        self.layer = self.bm.faces.layers.int.new("col")
        self.rng = random.Random(seed)

    def face(self, pts, color):
        try:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        except ValueError:
            return None
        f[self.layer] = int(color)
        return f

    # ---- primitives
    def box(self, c, size, color, rot_z=0.0, top=None, bevel=0.0):
        cx, cy, cz = c
        sx, sy, sz = size
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = res["verts"]
        for v in vs:
            v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        if rot_z:
            bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z, 3, "Z"))
        bmesh.ops.translate(self.bm, verts=vs, vec=(cx, cy, cz))
        faces = {f for v in vs for f in v.link_faces}
        for f in faces:
            col = color
            if top is not None and f.normal.z > 0.5:
                col = top
            f[self.layer] = int(col)
        return vs

    def prism_between(self, a, b, w, color):
        """A square beam from point a to b with width w."""
        a, b = Vector(a), Vector(b)
        d = b - a
        L = d.length
        if L < 1e-6:
            return
        res = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = res["verts"]
        for v in vs:
            v.co = Vector((v.co.x * w, v.co.y * w, v.co.z * L))
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bmesh.ops.rotate(self.bm, verts=vs, cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(self.bm, verts=vs, vec=(a + b) / 2)
        for f in {f for v in vs for f in v.link_faces}:
            f[self.layer] = int(color)

    def ring_loft(self, rings, colors, closed_bottom=True, closed_top=True):
        """rings: list of vertex rings (equal length); colors: one colour per ring gap (or function)."""
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for k in range(n):
                k2 = (k + 1) % n
                col = colors(i, k) if callable(colors) else colors[min(i, len(colors) - 1)]
                self.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], col)
        if closed_bottom:
            self.face(list(reversed(rings[0])), colors(0, 0) if callable(colors) else colors[0])
        if closed_top:
            self.face(rings[-1], colors(len(rings) - 2, 0) if callable(colors) else colors[-1])

    def tiers(self, cx, cy, z0, radii_heights, sides, dark, light, jitter=0.12, twist=0.4, droop=0.0):
        """Stacked conical foliage tiers: each (radius, height, z_offset) with ragged edges and a light top."""
        rng = self.rng
        for t, (r, h, dz) in enumerate(radii_heights):
            z = z0 + dz
            ang0 = rng.random() * 6.28 + t * twist
            rim = []
            for s in range(sides):
                a = ang0 + 2 * math.pi * s / sides
                rr = r * (1 + (rng.random() - 0.5) * 2 * jitter)
                rim.append(Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z - droop * r)))
            inner = []
            for s in range(sides):
                a = ang0 + 2 * math.pi * (s + 0.5) / sides
                rr = r * 0.55 * (1 + (rng.random() - 0.5) * jitter)
                inner.append(Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z + h * 0.35)))
            tip = Vector((cx + (rng.random() - 0.5) * 0.05, cy + (rng.random() - 0.5) * 0.05, z + h))
            for s in range(sides):
                s2 = (s + 1) % sides
                sm = (s - 1) % sides
                vary = 0.85 + rng.random() * 0.3
                low = shade(mix(dark, light, 0.12 + 0.2 * rng.random()), vary)
                up = shade(mix(dark, light, 0.5 + 0.35 * rng.random()), vary)
                self.face([rim[s], rim[s2], inner[s]], low)
                self.face([rim[s], inner[s], inner[sm]], low)
                self.face([inner[s], inner[s2], tip], up)
            # underside cap
            self.face(list(reversed(rim)), shade(dark, 0.55))

    def blob(self, c, radius, color_low, color_high, subdiv=2, squash=0.85, noise_amt=0.18, seed_off=0.0, flat_bottom=True):
        cx, cy, cz = c
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=1.0)
        vs = res["verts"]
        rng = self.rng
        off = rng.random() * 100 + seed_off
        for v in vs:
            n = noise.noise(Vector((v.co.x * 1.7 + off, v.co.y * 1.7 + off, v.co.z * 1.7)))
            k = 1.0 + n * noise_amt
            v.co = Vector((v.co.x * radius * k, v.co.y * radius * k, v.co.z * radius * k * squash))
            if flat_bottom and v.co.z < -radius * squash * 0.35:
                v.co.z = -radius * squash * 0.35 + (v.co.z + radius * squash * 0.35) * 0.3
            v.co += Vector((cx, cy, cz))
        for f in {f for v in vs for f in v.link_faces}:
            h = (f.calc_center_median().z - cz) / (radius * squash + 1e-6)
            col = mix(color_low, color_high, 0.5 + 0.5 * h + (rng.random() - 0.5) * 0.18)
            f[self.layer] = int(col)
        return vs

    def rock(self, c, size, base, strata, seed=0, facets=2):
        cx, cy, cz = c
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=facets, radius=1.0)
        vs = res["verts"]
        off = seed * 13.37
        for v in vs:
            n1 = noise.noise(Vector((v.co.x * 1.3 + off, v.co.y * 1.3, v.co.z * 1.3)))
            n2 = noise.noise(Vector((v.co.x * 3.1 + off, v.co.y * 3.1, v.co.z * 3.1)))
            k = 1.0 + n1 * 0.35 + n2 * 0.12
            v.co = Vector((v.co.x * size[0] * k, v.co.y * size[1] * k, v.co.z * size[2] * k))
            if v.co.z < -size[2] * 0.25:
                v.co.z = -size[2] * 0.25
        # chisel flat facets: snap vertices to a coarse grid direction
        bmesh.ops.translate(self.bm, verts=vs, vec=(cx, cy, cz + size[2] * 0.25))
        for f in {f for v in vs for f in v.link_faces}:
            m = f.calc_center_median()
            band = 0.5 + 0.5 * math.sin((m.z - cz) * 7.0 + seed)
            lit = 0.8 + 0.4 * max(0.0, f.normal.z)
            col = shade(mix(base, strata, band * 0.55), lit * (0.92 + 0.16 * self.rng.random()))
            f[self.layer] = int(col)
        return vs

    def to_object(self, scale=1.0, smooth=False):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        me = bpy.data.meshes.new(self.name)
        # corner colours from the per-face layer
        cl = bm.loops.layers.float_color.new("Col")
        for f in bm.faces:
            c = hexlin(f[self.layer])
            for lp in f.loops:
                lp[cl] = c
            f.smooth = smooth
        if scale != 1.0:
            for v in bm.verts:
                v.co *= scale
        bm.to_mesh(me)
        bm.free()
        # exactly one colour attribute, marked active + render, so the exporter writes it as COLOR_0
        for a in list(me.color_attributes):
            if a.name != "Col":
                me.color_attributes.remove(a)
        me.color_attributes.active_color = me.color_attributes["Col"]
        me.color_attributes.render_color_index = 0
        me.materials.append(vc_material())
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj


_VC = None


def vc_material():
    global _VC
    if _VC is None:
        m = bpy.data.materials.new("vc")
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        attr = nt.nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 1.0
        _VC = m
    return _VC


def reset():
    global _VC
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _VC = None


def export(objects, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
    )
