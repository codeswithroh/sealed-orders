# Battlefield props for Sealed Orders: trees, rocks, bridge, sandbags, flag,
# HQ tent, crates. Exports web/public/models/props.glb, one top-level node each.
#
#   blender -b -P web/art/blender/props.py
import bpy, bmesh, math, os, random, sys
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "props.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(7)


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


MATS = {}


def mat(name, hexc, rough=0.9, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = lin(hexc)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m.diffuse_color = lin(hexc)
    MATS[name] = m
    return m


PARTS = []


def done(o, m, smooth=False):
    o.data.materials.append(m)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    (bpy.ops.object.shade_smooth if smooth else bpy.ops.object.shade_flat)()
    PARTS.append(o)
    return o


def jitter(o, amt, seed):
    r = random.Random(seed)
    for v in o.data.vertices:
        v.co += Vector((r.uniform(-amt, amt), r.uniform(-amt, amt), r.uniform(-amt, amt)))


def box(loc, size, m, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        md = o.modifiers.new("B", "BEVEL")
        md.width = bev
        md.segments = 2
        bpy.ops.object.modifier_apply(modifier="B")
    return done(o, m)


def cone(loc, r1, r2, h, m, verts=8, rot=(0, 0, 0), j=0.0, smooth=False):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    if j:
        jitter(o, j, len(PARTS))
    return done(o, m, smooth)


def ico(loc, r, m, scale=(1, 1, 1), sub=1, j=0.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    if j:
        jitter(o, j, len(PARTS) * 3 + 1)
    return done(o, m)


def group(name):
    bpy.ops.object.select_all(action="DESELECT")
    for p in PARTS:
        p.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    PARTS.clear()
    return o


BARK = mat("Bark", "#5a4330")
PINE = mat("Pine", "#2f5a35")
PINE2 = mat("PineLight", "#3d6e3f")
LEAF = mat("Leaf", "#4f7d38")
LEAF2 = mat("LeafLight", "#6b9446")
ROCK = mat("Rock", "#8a8a83")
WOOD = mat("Wood", "#7a5a3a")
WOODDK = mat("WoodDark", "#4f3a26")
SAND = mat("Sandbag", "#b3a07a")
CANVAS = mat("Canvas", "#5d6646")
POLE = mat("PoleMetal", "#6c7076", 0.4, 0.8)
STONE = mat("Stone", "#9c978b")
CLOTH = mat("FlagCloth", "#ffffff", 0.8)
CRATE = mat("Crate", "#8a6a40")
BARREL = mat("Barrel", "#4a5a3a", 0.6, 0.3)

# --- pine ---
cone((0, 0, 0.6), 0.16, 0.1, 1.2, BARK, 7)
for i, (z, r, h) in enumerate([(1.4, 1.25, 1.6), (2.3, 1.0, 1.5), (3.1, 0.72, 1.3), (3.8, 0.42, 1.0)]):
    cone((0, 0, z), r, 0.04, h, PINE if i % 2 == 0 else PINE2, 9, j=0.07)
group("Pine")

# --- broadleaf ---
cone((0, 0, 0.9), 0.2, 0.12, 1.8, BARK, 7)
cone((0.25, 0, 1.6), 0.08, 0.05, 0.8, BARK, 6, rot=(0, 0.7, 0))
for (x, y, z, r, mm) in [(0, 0, 2.6, 1.15, LEAF), (0.7, 0.2, 2.2, 0.8, LEAF2), (-0.6, 0.3, 2.3, 0.85, LEAF), (0.1, -0.6, 2.2, 0.8, LEAF2), (0.0, 0.2, 3.3, 0.75, LEAF2)]:
    ico((x, y, z), r, mm, sub=1, j=0.08)
group("Oak")

# --- bush ---
for (x, y, z, r) in [(0, 0, 0.35, 0.5), (0.4, 0.1, 0.3, 0.38), (-0.35, 0.15, 0.28, 0.36)]:
    ico((x, y, z), r, LEAF2 if x else LEAF, scale=(1, 1, 0.8), sub=1, j=0.05)
group("Bush")

# --- rocks ---
ico((0, 0, 0.25), 0.6, ROCK, scale=(1.2, 0.9, 0.7), sub=2, j=0.12)
group("Rock")
ico((0, 0, 0.15), 0.35, ROCK, scale=(1, 1.3, 0.6), sub=1, j=0.08)
ico((0.45, 0.2, 0.1), 0.22, ROCK, sub=1, j=0.06)
group("Rocks")

# --- wooden bridge (length along Y, 5.4 m long, 2.4 m wide) ---
for i in range(18):
    y = -2.55 + i * 0.3
    box((0, y, 0.5 + random.uniform(-0.01, 0.01)), (2.4, 0.27, 0.08), WOOD if i % 3 else WOODDK, rot=(0, 0, random.uniform(-0.03, 0.03)), bev=0.01)
for sx in (-1, 1):
    box((sx * 1.0, 0, 0.38), (0.18, 5.6, 0.18), WOODDK)
    box((sx * 1.15, 0, 1.15), (0.1, 5.5, 0.1), WOOD, bev=0.01)
    for py in (-2.6, -1.3, 0, 1.3, 2.6):
        box((sx * 1.15, py, 0.75), (0.12, 0.12, 0.9), WOODDK)
        box((sx * 1.0, py, -0.2), (0.22, 0.22, 1.2), WOODDK)
group("Bridge")

# --- sandbag wall (arc) ---
for row in range(2):
    n = 7 - row
    for i in range(n):
        a = math.radians(-40 + (80 / (n - 1)) * i + row * 5)
        r = 1.6
        bpy.ops.mesh.primitive_cube_add(size=1, location=(math.sin(a) * r, -math.cos(a) * r + 1.6, 0.13 + row * 0.24), rotation=(0, 0, a))
        o = bpy.context.active_object
        o.scale = (0.5, 0.28, 0.22)
        bpy.ops.object.transform_apply(scale=True)
        md = o.modifiers.new("S", "SUBSURF")
        md.levels = 1
        bpy.ops.object.modifier_apply(modifier="S")
        jitter(o, 0.015, i + row * 10)
        done(o, SAND, smooth=True)
group("Sandbags")

# --- flag pole (cloth is a separate node so it can wave) ---
cone((0, 0, 0.12), 0.55, 0.45, 0.24, STONE, 10, j=0.02)
cone((0, 0, 2.2), 0.05, 0.035, 4.2, POLE, 8, smooth=True)
ico((0, 0, 4.35), 0.08, POLE, sub=1)
group("FlagPole")
bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=6, size=1, location=(0, 0, 0))
o = bpy.context.active_object
o.scale = (1.3, 0.8, 1)
o.rotation_euler = (math.pi / 2, 0, 0)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for v in o.data.vertices:
    v.co.x += 0.65  # hinge at x=0
o.data.materials.append(CLOTH)
o.name = "Flag"
o.data.name = "Flag"

# --- HQ tent ---
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=2.3, radius2=0, depth=2.2, location=(0, 0, 1.1), rotation=(0, 0, math.pi / 4))
t = bpy.context.active_object
t.scale = (1, 1.4, 1)
done(t, CANVAS)
box((0, -1.62, 0.55), (0.9, 0.05, 1.1), WOODDK)
cone((0, 0, 1.4), 0.04, 0.04, 2.8, WOOD, 6)
for sx in (-1, 1):
    box((sx * 1.9, -1.4, 0.3), (0.6, 0.6, 0.6), CRATE, bev=0.03)
group("Tent")

box((0, 0, 0.35), (0.7, 0.7, 0.7), CRATE, bev=0.04)
box((0.15, 0.1, 0.95), (0.5, 0.5, 0.5), CRATE, rot=(0, 0, 0.4), bev=0.03)
group("Crates")

cone((0, 0, 0.45), 0.3, 0.3, 0.9, BARREL, 12, smooth=True)
cone((0.65, 0.1, 0.45), 0.3, 0.3, 0.9, BARREL, 12, smooth=True)
group("Barrels")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_animations=False)
print("wrote", OUT)
