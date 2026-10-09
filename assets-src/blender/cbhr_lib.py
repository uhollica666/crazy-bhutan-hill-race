"""Small modelling kit for the Crazy Bhutan Hill Race vehicle models (run inside Blender, headless).

Frame used while modelling (Blender native): +X = right, +Y = FORWARD (the car's nose), +Z = up, units = metres,
origin = the vehicle's centre of mass (same origin the physics uses). The glTF exporter converts this to the
game's frame (Y up, nose toward -Z).
"""
import math
import bpy
import bmesh
from mathutils import Vector

# --------------------------------------------------------------------------------------------- materials

_MATS = {}


def hexrgb(h):
    r = ((h >> 16) & 255) / 255.0
    g = ((h >> 8) & 255) / 255.0
    b = (h & 255) / 255.0

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (lin(r), lin(g), lin(b), 1.0)


def material(name, color, rough=0.6, metal=0.0, emissive=None, emissive_strength=1.0, alpha=1.0):
    key = name
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hexrgb(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emissive is not None:
        bsdf.inputs["Emission Color"].default_value = hexrgb(emissive)
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    m.diffuse_color = hexrgb(color)
    _MATS[key] = m
    return m


def standard_materials():
    """The material names the game recolours at runtime: paint, accent and trim take the vehicle's livery."""
    material("paint", 0xFFFFFF, rough=0.38, metal=0.15)
    material("accent", 0xFFFFFF, rough=0.45, metal=0.05)
    material("trim", 0xFFFFFF, rough=0.55)
    material("glass", 0x1B2A33, rough=0.04, metal=0.0, alpha=0.78)
    material("chrome", 0xC9CBCC, rough=0.28, metal=0.75)
    material("black", 0x161616, rough=0.75)
    material("rubber", 0x101010, rough=0.95)
    material("rim", 0xB9BDBF, rough=0.35, metal=0.6)
    material("interior", 0x2B2824, rough=0.9)
    material("light_head", 0xFFF4D6, rough=0.2, emissive=0xFFE9B0, emissive_strength=0.6)
    material("light_tail", 0x8A1414, rough=0.3, emissive=0xFF2A1E, emissive_strength=0.5)
    material("light_amber", 0xE08A10, rough=0.3, emissive=0xFF9A1E, emissive_strength=0.3)
    material("luggage_a", 0x7B4A2B, rough=0.8)
    material("luggage_b", 0x2F4F3A, rough=0.8)
    material("luggage_c", 0xA33A2A, rough=0.8)
    material("canvas", 0xBFB08A, rough=0.95)
    material("mud", 0x5B4330, rough=1.0)


# ------------------------------------------------------------------------------------------- mesh building


class Part:
    """One bmesh with per-face material names; turned into a single Blender object at the end."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, matname):
        if matname not in self.slots:
            self.slots.append(matname)
        return self.slots.index(matname)

    def quad(self, a, b, c, d, mat):
        try:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in (a, b, c, d)])
        except ValueError:
            return None
        f.material_index = self.slot(mat)
        return f

    def tri(self, a, b, c, mat):
        try:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in (a, b, c)])
        except ValueError:
            return None
        f.material_index = self.slot(mat)
        return f

    def poly(self, pts, mat):
        try:
            f = self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        except ValueError:
            return None
        f.material_index = self.slot(mat)
        return f

    def merge_by_distance(self, d=1e-5):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=d)

    def box(self, center, size, mat, bevel=0.0, segs=2):
        """Axis-aligned box (optionally bevelled)."""
        bm = self.bm
        cx, cy, cz = center
        sx, sy, sz = size
        res = bmesh.ops.create_cube(bm, size=1.0)
        verts = res["verts"]
        for v in verts:
            v.co.x = v.co.x * sx + cx
            v.co.y = v.co.y * sy + cy
            v.co.z = v.co.z * sz + cz
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = self.slot(mat)
        if bevel > 0:
            edges = {e for v in verts for e in v.link_edges}
            r = bmesh.ops.bevel(bm, geom=list(edges), offset=bevel, segments=segs, profile=0.7, affect="EDGES")
            for f in r["faces"]:
                f.material_index = self.slot(mat)
        return verts

    def cylinder(self, center, radius, depth, axis, mat, segs=16, r2=None, cap=True):
        """Cylinder along 'x', 'y' or 'z'; r2 gives a cone frustum (radius at +axis end)."""
        bm = self.bm
        res = bmesh.ops.create_cone(
            bm,
            cap_ends=cap,
            cap_tris=False,
            segments=segs,
            radius1=radius,
            radius2=radius if r2 is None else r2,
            depth=depth,
        )
        verts = res["verts"]
        for v in verts:
            x, y, z = v.co
            if axis == "x":
                v.co = Vector((z, x, y))
            elif axis == "y":
                v.co = Vector((x, z, y))
            v.co += Vector(center)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = self.slot(mat)
        return verts

    def to_object(self, collection=None, smooth_angle=38.0, bevel=0.0, subsurf=0, crease_angle=None):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for s in self.slots:
            me.materials.append(bpy.data.materials[s])
        obj = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        if bevel > 0:
            mod = obj.modifiers.new("bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(28)
        if subsurf > 0:
            mod = obj.modifiers.new("sub", "SUBSURF")
            mod.levels = subsurf
            mod.render_levels = subsurf
        if bevel > 0 or subsurf > 0:
            dg = bpy.context.evaluated_depsgraph_get()
            ev = obj.evaluated_get(dg)
            me2 = bpy.data.meshes.new_from_object(ev)
            obj.modifiers.clear()
            old = obj.data
            obj.data = me2
            bpy.data.meshes.remove(old)
        shade_by_angle(obj.data, smooth_angle)
        return obj


def shade_by_angle(me, angle_deg):
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < lim
        else:
            e.smooth = True
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()


# ------------------------------------------------------------------------------------------------ lofting


def half_profile(wb, wt, zb, zbelt, zt, crown=0.02, r=0.07, shoulder=0.35):
    """Right-hand half of a body cross-section, bottom centre to top centre. 9 points, always."""
    zr = min(zbelt, zt - 0.03)
    zs = zr + (zt - zr) * shoulder
    return [
        (0.0, zb),
        (wb - r, zb),
        (wb, zb + r * 0.9),
        (wb, zr),
        (wb - (wb - wt) * 0.25, zs),
        (wt, zt - (zt - zr) * 0.18),
        (wt - 0.05, zt - 0.005),
        (wt * 0.5, zt + crown * 0.6),
        (0.0, zt + crown),
    ]


def loft(part, stations, mat_fn, ends=True, flip=False):
    """stations: list of (y, half_profile). Consecutive stations are joined with quads on both sides.

    mat_fn(i_station_pair, i_segment, side) -> material name for that quad (side is +1 / -1).
    """
    n = len(stations[0][1])
    rings = []
    for y, hp in stations:
        right = [Vector((x, y, z)) for (x, z) in hp]
        left = [Vector((-x, y, z)) for (x, z) in reversed(hp[1:-1])]
        rings.append(right + left)  # closed loop: bottom centre ... top centre ... back to bottom
    m = len(rings[0])
    faces = []
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(m):
            k2 = (k + 1) % m
            # segment index folded to the right half so both sides share materials
            seg = k if k < n - 1 else (m - 1 - k) if k >= n - 1 else k
            side = 1 if k < n - 1 else -1
            mname = mat_fn(i, min(seg, n - 2), side)
            f = part.quad(a[k], a[k2], b[k2], b[k], mname)
            if f is not None and flip:
                f.normal_flip()
            faces.append(f)
    if ends:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            pts = list(reversed(ring)) if rev else list(ring)
            part.poly(pts, mat_fn(-1, 0, 1))
    return rings


def revolve(part, profile, segs, mat, axis_x=0.0, center=(0, 0, 0)):
    """Revolves [(x_along_axis, radius), ...] around the X axis (a wheel). Closed at both ends."""
    rings = []
    for (x, r) in profile:
        ring = []
        for s in range(segs):
            a = 2 * math.pi * s / segs
            ring.append(Vector((x + center[0], center[1] + r * math.cos(a), center[2] + r * math.sin(a))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            part.quad(rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s], mat)
    # close the centre holes if the end radius is ~0
    for ring in (rings[0], rings[-1]):
        if abs(ring[0].y - center[1]) < 1e-6 and abs(ring[0].z - center[2]) < 1e-6:
            continue


def export_glb(objects, path, extra_empties=()):
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
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_extras=False,
    )


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
