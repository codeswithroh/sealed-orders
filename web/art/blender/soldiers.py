# Builds the Sealed Orders soldiers (infantry + scout) on one rig and exports
# web/public/models/soldier.glb with Idle, Walk, Run, Shoot and Die actions.
#
#   blender -b -P web/art/blender/soldiers.py
#
# Character faces -Y in Blender, which is +Z in glTF / three.js.
import bpy, math, os, sys
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "models", "soldier.glb")
PREVIEW = "--preview" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


MATS = {}


def mat(name, hexc, rough=0.85, metal=0.0):
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


# Materials. "Team*" and "Skin" are recolored at runtime.
TEAM = lambda: mat("Team", "#cfcfcf")
TEAMBAND = lambda: mat("TeamBand", "#ffffff", 0.4)
SKIN = lambda: mat("Skin", "#c99a78", 0.7)
GEAR = lambda: mat("Gear", "#545a43")
GEARDK = lambda: mat("GearDark", "#3a3d31")
PANTS = lambda: mat("Pants", "#4a4c40")
BOOTS = lambda: mat("Boots", "#1f1c19", 0.6)
HELMET = lambda: mat("Helmet", "#4c5440", 0.7)
GLOVE = lambda: mat("Gloves", "#2b2824", 0.7)
GUN = lambda: mat("GunDark", "#202226", 0.5, 0.2)
METAL = lambda: mat("GunMetal", "#3b3f45", 0.35, 0.8)
EYE = lambda: mat("Eye", "#15120f", 0.3)
STRAP = lambda: mat("Strap", "#2d2b25")
ROLL = lambda: mat("Bedroll", "#6d6a4e")
LENS = lambda: mat("Lens", "#6fa8d8", 0.1, 0.5)

PARTS = []


def finish(o, m, bone, smooth=False):
    o.data.materials.append(m)
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_flat()
    PARTS.append(o)
    return o


def bevel(o, w, seg=2):
    bpy.context.view_layer.objects.active = o
    md = o.modifiers.new("B", "BEVEL")
    md.width = w
    md.segments = seg
    md.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier="B")


def box(loc, size, m, bone, rot=(0, 0, 0), bev=0.012, taper=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    if taper:
        for v in o.data.vertices:
            if v.co.z > 0:
                v.co.x *= taper[0]
                v.co.y *= taper[1]
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bev:
        bevel(o, bev)
    return finish(o, m, bone)


def sphere(loc, r, m, bone, scale=(1, 1, 1), segs=14, rings=9, cut=None, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=(0, 0, 0))
    o = bpy.context.active_object
    if cut is not None:
        import bmesh

        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut * r], context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
    o.scale = scale
    o.location = loc
    return finish(o, m, bone, smooth)


def cyl(p1, p2, r1, r2, m, bone, verts=10, smooth=True):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d.length, location=(p1 + p2) / 2)
    o = bpy.context.active_object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, m, bone, smooth)


def join(name):
    bpy.ops.object.select_all(action="DESELECT")
    for p in PARTS:
        p.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    PARTS.clear()
    return o


def rifle(B, d, scout):
    """Rifle built along -Y then rotated to point along d with the butt at B."""
    q = Vector((0, -1, 0)).rotation_difference(Vector(d).normalized())
    B = Vector(B)
    w = lambda p: tuple(B + q @ Vector(p))
    rot = q.to_euler()
    L = 1.0 if scout else 0.86

    def rbox(c, s, m, extra=(0, 0, 0)):
        o = box(w(c), s, m, "arms", rot=rot, bev=0.006)
        return o

    rbox((0, -0.1, -0.025), (0.042, 0.2, 0.095), GUN())
    rbox((0, -0.33, 0.0), (0.05, 0.28, 0.075), METAL())
    rbox((0, -0.26, -0.075), (0.034, 0.04, 0.09), GUN())
    rbox((0, -0.37, -0.095), (0.03, 0.06, 0.12), GUN())
    rbox((0, -0.56, 0.0), (0.056, 0.2, 0.062), GUN())
    cyl(w((0, -0.66, 0.006)), w((0, -L, 0.006)), 0.011, 0.011, METAL(), "arms", 8)
    cyl(w((0, -L + 0.06, 0.006)), w((0, -L - 0.01, 0.006)), 0.017, 0.017, METAL(), "arms", 8)
    if scout:
        cyl(w((0, -0.22, 0.07)), w((0, -0.5, 0.07)), 0.024, 0.028, METAL(), "arms", 10)
        cyl(w((0, -0.5, 0.07)), w((0, -0.51, 0.07)), 0.026, 0.026, LENS(), "arms", 10)
    else:
        cyl(w((0, -0.28, 0.058)), w((0, -0.4, 0.058)), 0.018, 0.018, METAL(), "arms", 8)
    return w


def arm(S, E, Hd, sleeve=True):
    cyl(S, E, 0.056, 0.047, TEAM(), "arms")
    cyl(E, Hd, 0.046, 0.037, TEAM() if sleeve else SKIN(), "arms")
    sphere(S, 0.064, TEAM(), "arms")
    sphere(E, 0.049, TEAM(), "arms")
    sphere(Hd, 0.043, GLOVE(), "arms", scale=(1, 1.15, 0.85))
    # team armband on the upper arm
    a = Vector(S).lerp(Vector(E), 0.45)
    b = Vector(S).lerp(Vector(E), 0.62)
    cyl(a, b, 0.06, 0.055, TEAMBAND(), "arms")


def leg(x):
    side = "L" if x > 0 else "R"
    cyl((x * 0.95, 0, 0.92), (x, -0.01, 0.52), 0.088, 0.066, PANTS(), f"thigh.{side}")
    sphere((x, -0.055, 0.5), 0.046, GEARDK(), f"shin.{side}", scale=(1, 0.65, 1.05))
    cyl((x, 0, 0.52), (x, 0.012, 0.15), 0.064, 0.05, PANTS(), f"shin.{side}")
    cyl((x, 0.01, 0.12), (x, 0.01, 0.24), 0.06, 0.058, BOOTS(), f"shin.{side}")
    box((x, -0.035, 0.065), (0.11, 0.26, 0.13), BOOTS(), f"shin.{side}", bev=0.025)
    # cargo pocket
    box((x * 1.55, -0.01, 0.7), (0.035, 0.11, 0.13), PANTS(), f"thigh.{side}", bev=0.01)


def soldier(scout):
    # head
    sphere((0, 0, 1.63), 0.105, SKIN(), "head", scale=(0.9, 1.0, 1.12), segs=18, rings=12)
    box((0, -0.104, 1.615), (0.028, 0.04, 0.045), SKIN(), "head", bev=0.008)
    box((0, -0.088, 1.565), (0.06, 0.03, 0.03), SKIN(), "head", bev=0.01)  # jaw
    for sx in (-1, 1):
        sphere((sx * 0.094, 0.0, 1.62), 0.026, SKIN(), "head", scale=(0.5, 1, 1.3), segs=8, rings=6)
        sphere((sx * 0.037, -0.091, 1.645), 0.012, EYE(), "head", segs=8, rings=6)
        box((sx * 0.037, -0.098, 1.668), (0.034, 0.012, 0.008), STRAP(), "head", bev=0)  # brow
    cyl((0, 0, 1.46), (0, 0, 1.57), 0.05, 0.046, SKIN(), "head")

    if scout:
        # boonie hat
        sphere((0, 0.0, 1.675), 0.128, GEAR(), "head", scale=(1, 1.06, 0.92), cut=-0.05, segs=18, rings=12)
        cyl((0, 0, 1.672), (0, 0, 1.684), 0.2, 0.19, GEAR(), "head", 16)
        cyl((0, 0, 1.684), (0, 0, 1.706), 0.122, 0.12, TEAMBAND(), "head", 16)
        # scarf
        cyl((0, 0, 1.44), (0, 0, 1.51), 0.085, 0.07, GEARDK(), "chest", 12)
    else:
        sphere((0, 0.008, 1.668), 0.132, HELMET(), "head", scale=(1, 1.08, 0.86), cut=-0.08, segs=18, rings=12)
        cyl((0, 0.008, 1.652), (0, 0.008, 1.664), 0.142, 0.138, HELMET(), "head", 18)
        cyl((0, 0.008, 1.69), (0, 0.008, 1.715), 0.128, 0.12, TEAMBAND(), "head", 18)
        box((0, -0.11, 1.74), (0.05, 0.03, 0.03), GEARDK(), "head", bev=0.006)  # NVG mount
        for sx in (-1, 1):
            cyl((sx * 0.105, -0.01, 1.66), (sx * 0.06, -0.07, 1.545), 0.008, 0.008, STRAP(), "head", 6)

    # torso
    w = 0.33 if scout else 0.36
    box((0, 0, 1.19), (w, 0.21, 0.5), TEAM(), "chest", taper=(1.12, 1.05), bev=0.03)
    box((0, 0, 0.9), (0.33, 0.2, 0.16), PANTS(), "hips", bev=0.02)
    box((0, 0, 0.965), (0.35, 0.225, 0.06), GEARDK(), "hips", bev=0.01)
    box((0, -0.115, 0.965), (0.06, 0.012, 0.045), METAL(), "hips", bev=0)  # buckle
    if scout:
        # light chest rig + binoculars
        box((0, -0.03, 1.2), (0.34, 0.2, 0.2), GEAR(), "chest", bev=0.015)
        for sx in (-0.085, 0.0, 0.085):
            box((sx, -0.135, 1.2), (0.07, 0.04, 0.09), GEARDK(), "chest", bev=0.008)
        for sx in (-1, 1):
            cyl((sx * 0.03, -0.17, 1.33), (sx * 0.03, -0.24, 1.33), 0.022, 0.022, GUN(), "chest", 8)
        box((0, 0.14, 0.99), (0.22, 0.09, 0.1), GEAR(), "hips", bev=0.015)  # butt pack
        # ghillie strips on the back
        for i, sx in enumerate((-0.12, -0.04, 0.05, 0.12)):
            box((sx, 0.12, 1.25 - (i % 2) * 0.05), (0.06, 0.02, 0.32), mat("Ghillie", "#5b6440"), "chest", rot=(0.15, 0, (i - 1.5) * 0.1), bev=0)
    else:
        box((0, -0.005, 1.24), (0.375, 0.255, 0.34), GEAR(), "chest", bev=0.02)
        for sx in (-0.1, 0.0, 0.1):
            box((sx, -0.14, 1.12), (0.085, 0.05, 0.1), GEARDK(), "chest", bev=0.01)
        box((0.11, -0.14, 1.3), (0.06, 0.04, 0.09), GEARDK(), "chest", bev=0.008)  # radio
        cyl((0.12, -0.13, 1.34), (0.13, -0.12, 1.5), 0.005, 0.004, GUN(), "chest", 5)  # antenna
        box((0, 0.17, 1.22), (0.3, 0.15, 0.37), GEAR(), "chest", bev=0.03)
        box((0, 0.25, 1.17), (0.22, 0.04, 0.18), GEARDK(), "chest", bev=0.015)
        cyl((-0.16, 0.18, 1.44), (0.16, 0.18, 1.44), 0.055, 0.055, ROLL(), "chest", 12)
        # shoulder straps
        for sx in (-1, 1):
            box((sx * 0.12, -0.11, 1.38), (0.05, 0.03, 0.1), GEARDK(), "chest", bev=0.006)

    for x in (0.1, -0.1):
        leg(x)

    # rifle at low ready, arms holding it (weighted to the "arms" bone)
    B = (-0.1, -0.06, 1.25)
    d = (0.15, -0.9, -0.3)
    w_ = rifle(B, d, scout)
    grip = w_((0, -0.26, -0.11))
    fore = w_((0, -0.5 if not scout else 0.0 - 0.52, -0.045))
    arm((-0.2, 0, 1.4), (-0.25, -0.1, 1.13), grip)
    arm((0.2, 0, 1.4), (0.15, -0.23, 1.18), fore)

    return join("Scout" if scout else "Infantry")


inf = soldier(False)
sc = soldier(True)

# ---------- rig ----------
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm_obj = bpy.context.active_object
arm_obj.name = "Rig"
arm_obj.data.name = "Rig"
eb = arm_obj.data.edit_bones
root = eb[0]
root.name = "root"
root.head, root.tail = (0, 0, 0), (0, 0, 0.25)


def bone(name, h, t, parent):
    b = eb.new(name)
    b.head, b.tail = h, t
    b.roll = 0
    b.parent = eb[parent]
    return b


bone("hips", (0, 0, 0.92), (0, 0, 1.05), "root")
bone("chest", (0, 0, 1.05), (0, 0, 1.42), "hips")
bone("head", (0, 0, 1.46), (0, 0, 1.78), "chest")
bone("arms", (0, 0, 1.4), (0, -0.25, 1.4), "chest")
for s, x in (("L", 0.1), ("R", -0.1)):
    bone(f"thigh.{s}", (x, 0, 0.92), (x, 0, 0.52), "hips")
    bone(f"shin.{s}", (x, 0, 0.52), (x, 0, 0.1), f"thigh.{s}")
bpy.ops.object.mode_set(mode="OBJECT")

for o in (inf, sc):
    o.parent = arm_obj
    md = o.modifiers.new("Armature", "ARMATURE")
    md.object = arm_obj

# ---------- animation ----------
R = math.radians
pb = arm_obj.pose.bones
for b in pb:
    b.rotation_mode = "XYZ"

# Sign conventions (checked with --preview renders):
# up bones: +rx leans the bone forward (toward -Y).
# leg bones: +rx swings the leg forward.
# arms bone: +rx raises the rifle.
FWD_UP = 1
FWD_LEG = -1
RAISE = 1


def reset():
    for b in pb:
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)


def key(f):
    for b in pb:
        b.keyframe_insert("rotation_euler", frame=f)
        b.keyframe_insert("location", frame=f)


def make(name, n, fn, step=2):
    arm_obj.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm_obj.animation_data.action = act
    for f in list(range(0, n, step)) + [n]:
        reset()
        fn(f / n, f)
        key(f)
    return act


def setr(b, x=0, y=0, z=0):
    pb[b].rotation_euler = (x, y, z)


def walk_like(amp_t, amp_s, lean, bob, n_t):
    def fn(t, f):
        p = 2 * math.pi * t
        s = math.sin(p)
        c = math.cos(p)
        setr("thigh.L", FWD_LEG * R(amp_t) * s)
        setr("thigh.R", -FWD_LEG * R(amp_t) * s)
        # knee bends while the leg swings forward
        setr("shin.L", -FWD_LEG * R(5 + amp_s * max(0.0, c)))
        setr("shin.R", -FWD_LEG * R(5 + amp_s * max(0.0, -c)))
        pb["hips"].location = (0, bob * math.cos(2 * p), 0)  # bone-local Y is up
        pb["hips"].rotation_euler = (0, R(5) * s, 0)
        setr("chest", FWD_UP * R(lean), -R(8) * s, 0)
        setr("head", -FWD_UP * R(lean * 0.6), R(3) * s, 0)
        setr("arms", RAISE * R(2) * math.cos(2 * p), 0, 0)

    return fn


def idle(t, f):
    p = 2 * math.pi * t
    setr("chest", FWD_UP * R(2) * math.sin(p))
    setr("head", FWD_UP * R(2) * math.sin(p + 1), R(14) * math.sin(p), 0)
    setr("arms", RAISE * R(1.5) * math.sin(p))
    pb["hips"].location = (0, 0.006 * math.sin(p), 0)


def shoot(t, f):
    # aimed rifle with a kick on each loop start
    kick = max(0.0, 1 - t * 5)
    setr("chest", FWD_UP * R(6 - 4 * kick), R(-6), 0)
    setr("arms", RAISE * R(17 + 5 * kick), R(4), 0)
    setr("head", FWD_UP * R(6), R(4), 0)
    setr("thigh.L", FWD_LEG * R(14))
    setr("thigh.R", -FWD_LEG * R(8))
    setr("shin.L", -FWD_LEG * R(12))
    setr("shin.R", -FWD_LEG * R(6))
    pb["hips"].location = (0, -0.03, 0)


def die(t, f):
    a = min(1.0, t / 0.35)  # knees give
    b_ = max(0.0, min(1.0, (t - 0.3) / 0.45))  # topple
    b_ = b_ * b_ * (3 - 2 * b_)
    setr("thigh.L", FWD_LEG * R(55 * a))
    setr("thigh.R", FWD_LEG * R(40 * a))
    setr("shin.L", -FWD_LEG * R(95 * a * (1 - 0.6 * b_)))
    setr("shin.R", -FWD_LEG * R(80 * a * (1 - 0.6 * b_)))
    pb["hips"].location = (0, -0.38 * a, 0)
    setr("chest", FWD_UP * R(25 * a), R(-15 * a), 0)
    setr("arms", -RAISE * R(35 * a), 0, R(10 * a))
    setr("head", FWD_UP * R(15 * a), R(20 * b_), 0)
    pb["root"].rotation_euler = (FWD_UP * R(78 * b_), 0, R(10 * b_))
    pb["root"].location = (0, 0.12 * b_, 0)


acts = [
    make("Idle", 48, idle, 4),
    make("Walk", 24, walk_like(26, 38, 5, 0.022, 24)),
    make("Run", 16, walk_like(40, 62, 14, 0.04, 16)),
    make("Shoot", 12, shoot, 1),
    make("Die", 30, die, 1),
]

if PREVIEW:
    # Quick contact sheet of each action for checking bone signs.
    arm_obj.animation_data.action = bpy.data.actions[sys.argv[sys.argv.index("--preview") + 1]]
    frame = int(sys.argv[sys.argv.index("--preview") + 2])
    scene.frame_set(frame)
    cam_data = bpy.data.cameras.new("C")
    cam = bpy.data.objects.new("C", cam_data)
    scene.collection.objects.link(cam)
    side = "--side" in sys.argv
    cam.location = (3.2, -0.2, 1.1) if side else (1.9, -2.6, 1.5)
    target = Vector((0, 0, 0.9))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    sc.hide_render = "--scout" not in sys.argv
    inf.hide_render = "--scout" in sys.argv
    light = bpy.data.objects.new("L", bpy.data.lights.new("L", "SUN"))
    light.rotation_euler = (R(40), R(10), R(30))
    scene.collection.objects.link(light)
    world = bpy.data.worlds.new("W")
    scene.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.65, 0.7, 1)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 480
    scene.render.resolution_y = 600
    scene.render.filepath = sys.argv[sys.argv.index("--out") + 1]
    bpy.ops.render.render(write_still=True)
else:
    arm_obj.animation_data.action = acts[0]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_apply=True,
        export_yup=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
    )
    print("wrote", OUT)
