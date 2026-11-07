// The 3D battlefield. Plain three.js, driven by the sealed game state.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FORESTS, H, POINTS, POINT_NAMES, SQUAD_NAMES, W, maxHp } from "@/lib/game";
import { BRIDGE_X, DECK_Y, FORD_X, HALF, T, WATER_Y, disp, footY, heightAt, isForestD, pathTo, riverAmount, roadAmount, snapTile, tileToWorld, toWorld, worldToTile } from "./world";
import { sfx } from "./sfx";

export type SceneUnit = {
  team: "blue" | "red";
  squad: number;
  kind: number;
  x: number;
  y: number;
  hp: number;
  ghost?: boolean;
  target?: { x: number; y: number } | null;
};
export type SceneState = {
  units: SceneUnit[];
  fog: Set<string> | null;
  control: number[];
  selected: number | null;
};
export type EngineOpts = {
  mySide: number;
  interactive?: boolean;
  intro?: boolean;
  onSelect?: (squad: number | null) => void;
  onCommand?: (squad: number, kind: "move" | "attack", x: number, y: number) => void;
  onTile?: (x: number, y: number) => void;
};

const MAP = W * T;
const SCALE = 1.38;
const TEAM = {
  blue: { jacket: "#35568f", band: "#5aa0ff", glow: "#2f7bff", ring: "#4d8dff" },
  red: { jacket: "#8f3535", band: "#ff6a5a", glow: "#ff2f2f", ring: "#ff5a5a" },
};
const SKIN_TONES = ["#c99a78", "#a8754f", "#e0b48f", "#7a5236"];

// ---------- asset loading (cached across mounts) ----------
let assets: Promise<{ soldier: GLTF; props: GLTF }> | null = null;
export function loadAssets(onProgress?: (p: number) => void) {
  if (!assets) {
    const loader = new GLTFLoader();
    const prog = [0, 0];
    const one = (url: string, i: number) =>
      loader.loadAsync(url, (e) => {
        if (e.total) prog[i] = e.loaded / e.total;
        onProgress?.((prog[0] + prog[1]) / 2);
      });
    assets = Promise.all([one("/models/soldier.glb", 0), one("/models/props.glb", 1)]).then(([soldier, props]) => ({ soldier, props }));
  }
  return assets;
}

// ---------- shared shader bits ----------
type Uniforms = { uFog: { value: THREE.DataTexture }; uFogOn: { value: number }; uTime: { value: number } };

function patch(mat: THREE.Material, u: Uniforms, o: { grid?: boolean; wind?: boolean; wave?: boolean; flag?: number } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader =
      "uniform float uTime;\nvarying vec3 vWP;\n" +
      sh.vertexShader
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          ${
            o.wind
              ? `{ vec4 ip = instanceMatrix[3]; float h = position.y;
              transformed.x += sin(uTime*1.8 + ip.x*0.35 + ip.z*0.2) * 0.09 * h;
              transformed.z += cos(uTime*1.4 + ip.x*0.2 + ip.z*0.3) * 0.06 * h; }`
              : ""
          }
          ${o.wave ? `transformed.z += sin(position.x*0.9 + uTime*1.4) * 0.05 + sin(position.x*2.3 - uTime*2.1) * 0.03;` : ""}
          ${o.flag !== undefined ? `transformed.z += sin(position.x*3.5 - uTime*6.0 + ${o.flag.toFixed(2)}) * 0.13 * position.x;` : ""}`,
        )
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
          { vec4 w4 = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              w4 = instanceMatrix * w4;
            #endif
            vWP = (modelMatrix * w4).xyz; }`,
        );
    sh.fragmentShader =
      "uniform sampler2D uFog;\nuniform float uFogOn;\nvarying vec3 vWP;\n" +
      sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        `{
          vec2 fuv = vWP.xz / ${MAP.toFixed(1)} + 0.5;
          float edge = max(abs(fuv.x - 0.5), abs(fuv.y - 0.5));
          float vis = texture2D(uFog, fuv).r;
          vis *= 1.0 - smoothstep(0.5, 0.58, edge) * 0.45;
          vis = mix(1.0, vis, uFogOn);
          ${
            o.grid
              ? `vec2 f = fract(vWP.xz / ${T.toFixed(1)} + 0.5); vec2 e = min(f, 1.0 - f);
                 float ln = 1.0 - smoothstep(0.0, 0.03, min(e.x, e.y));
                 gl_FragColor.rgb *= 1.0 - ln * step(edge, 0.5) * 0.16;`
              : ""
          }
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 hidden = mix(vec3(lum), gl_FragColor.rgb, 0.3) * 0.36 + vec3(0.015, 0.02, 0.04);
          gl_FragColor.rgb = mix(hidden, gl_FragColor.rgb, vis);
        }
        #include <dithering_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => JSON.stringify(o);
  return mat;
}

function glowTexture(inner = "rgba(255,240,200,1)", outer = "rgba(255,160,40,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, "rgba(255,200,90,0.8)");
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function puffTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(210,200,180,0.9)");
  gr.addColorStop(1, "rgba(210,200,180,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- squads ----------
type Soldier = {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acts: Record<string, THREE.AnimationAction>;
  cur: string;
  pos: THREE.Vector3;
  off: THREE.Vector2;
  face: number;
  alive: boolean;
  diedAt: number;
  lastShootT: number;
  speed: number;
};
type Squad = {
  key: string;
  team: "blue" | "red";
  squad: number;
  kind: number;
  ghost: boolean;
  soldiers: Soldier[];
  center: THREE.Vector3;
  goal: THREE.Vector3;
  heading: number;
  hp: number;
  tile: { x: number; y: number };
  present: boolean;
  ring: THREE.Mesh;
  proxy: THREE.Mesh;
  label: CSS2DObject;
  labelEl: HTMLDivElement;
  hpEl: HTMLDivElement | null;
  firing: boolean;
  enemyPos: THREE.Vector3 | null;
  marker?: THREE.Group;
  path?: THREE.Line;
  pathKey?: string;
};

type Fx = { obj: THREE.Object3D; life: number; max: number; kind: "tracer" | "flash" | "puff" | "dmg"; vel?: THREE.Vector3 };

export class BattleEngine {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private flip: boolean;
  private u: Uniforms;
  private fogData = new Float32Array(W * H).fill(1);
  private fogTarget = new Float32Array(W * H).fill(1);
  private fogBytes = new Uint8Array(W * H * 4).fill(255);
  private terrain!: THREE.Mesh;
  private squads = new Map<string, Squad>();
  private fx: Fx[] = [];
  private flags: { cloth: THREE.Mesh; mat: THREE.MeshStandardMaterial; owner: number; raise: number; zone: THREE.Mesh; pulse: number }[] = [];
  private state: SceneState | null = null;
  private assets: { soldier: GLTF; props: GLTF } | null = null;
  private matCache = new Map<string, THREE.Material>();
  private ghostMat = new THREE.MeshBasicMaterial({ color: "#ff6a6a", transparent: true, opacity: 0.28, depthWrite: false });
  private flashTex = glowTexture();
  private puffTex = puffTexture();
  private shotLight = new THREE.PointLight("#ffb347", 0, 10, 2);
  private tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  private tracerMat = new THREE.MeshBasicMaterial({ color: "#ffd98a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private hover: THREE.Mesh;
  private keys = new Set<string>();
  private shake = 0;
  private focusAnim: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private intro: { t: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private disposed = false;
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(
    private el: HTMLElement,
    private opts: EngineOpts,
  ) {
    this.flip = opts.mySide === 1;
    const fogTex = new THREE.DataTexture(this.fogBytes, W, H, THREE.RGBAFormat);
    fogTex.magFilter = THREE.LinearFilter;
    fogTex.minFilter = THREE.LinearFilter;
    fogTex.needsUpdate = true;
    this.u = { uFog: { value: fogTex }, uFogOn: { value: 1 }, uTime: { value: 0 } };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none";
    el.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
    el.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 500);
    this.camera.position.set(0, 36, 44);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 6);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 85;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.2;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.autoRotateSpeed = 0.5;

    this.hover = new THREE.Mesh(
      new THREE.PlaneGeometry(T * 0.94, T * 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.scene.add(this.shotLight);

    this.buildWorld();
    this.bindInput();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    if (opts.intro) {
      this.intro = { t: 0 };
      this.camera.position.set(0, 90, -70);
      this.controls.target.set(0, 0, -10);
    }
    loadAssets().then((a) => {
      if (this.disposed) return;
      this.assets = a;
      this.buildProps();
      if (this.state) this.apply(this.state);
    });
    this.loop();
  }

  // ---------- world ----------
  private buildWorld() {
    const s = this.scene;
    s.background = new THREE.Color("#b9d6ec");
    s.fog = new THREE.Fog("#b9d6ec", 95, 210);
    const pm = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.35;

    s.add(new THREE.HemisphereLight("#dcecff", "#5d6b3e", 1.15));
    const sun = new THREE.DirectionalLight("#fff0d6", 2.7);
    sun.position.set(-28, 48, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.near = 1;
    sc.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    s.add(sun);

    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: "varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader:
          "varying float vy; void main(){ vec3 top=vec3(0.36,0.6,0.86); vec3 hz=vec3(0.73,0.84,0.93); gl_FragColor=vec4(mix(hz,top,smoothstep(0.0,0.6,vy)),1.0); }",
      }),
    );
    s.add(sky);

    // terrain
    const size = 150;
    const seg = 170;
    const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color("#5f8a3c");
    const grassB = new THREE.Color("#7c9b45");
    const dark = new THREE.Color("#3f6430");
    const sand = new THREE.Color("#b9a678");
    const mud = new THREE.Color("#6b5a3e");
    const dirt = new THREE.Color("#9a8458");
    const rock = new THREE.Color("#8d8a7c");
    const hillC = new THREE.Color("#8ea457");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z, this.flip);
      pos.setY(i, h);
      const fx = x / T + HALF;
      const fy = z / T + HALF;
      const n = 0.5 + 0.5 * Math.sin(x * 0.7 + Math.sin(z * 0.5) * 2) * Math.cos(z * 0.6 - x * 0.2);
      c.copy(grassA).lerp(grassB, n);
      const rx = Math.round(fx);
      const ry = Math.round(fy);
      if (rx >= 0 && ry >= 0 && rx < W && ry < H && isForestD(rx, ry, this.flip)) c.lerp(dark, 0.55);
      if (h > 1.2 && Math.max(Math.abs(fx - HALF), Math.abs(fy - HALF)) < 8) c.lerp(hillC, Math.min(1, (h - 1.2) / 1.3) * 0.6);
      if (h > 4.5) c.lerp(rock, Math.min(1, (h - 4.5) / 3));
      c.lerp(dirt, roadAmount(fx, fy) * 0.85);
      const r = riverAmount(fx, fy);
      const bank = Math.max(0, 1 - Math.abs(fy - 7) / 1.25);
      c.lerp(sand, Math.min(1, bank * 1.3) * 0.7);
      c.lerp(mud, r * 0.8);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), this.u, { grid: true }));
    this.terrain.receiveShadow = true;
    s.add(this.terrain);

    // river
    const wg = new THREE.PlaneGeometry(size, 6.4, 120, 6).rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(
      wg,
      patch(new THREE.MeshStandardMaterial({ color: "#3a7da8", roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.84 }), this.u, { wave: true }),
    );
    water.position.y = WATER_Y;
    s.add(water);

    // fog-of-war clouds
    const clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP + 8, MAP + 8, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.u as unknown as Record<string, THREE.IUniform>,
        vertexShader: "varying vec3 vWP; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }",
        fragmentShader: `
          uniform sampler2D uFog; uniform float uFogOn; uniform float uTime; varying vec3 vWP;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
          void main(){
            vec2 uv = vWP.xz / ${MAP.toFixed(1)} + 0.5;
            float vis = texture2D(uFog, uv).r;
            float k = fbm(vWP.xz*0.09 + vec2(uTime*0.04, uTime*0.025));
            float a = (1.0 - vis) * uFogOn * smoothstep(0.25, 0.85, k) * 0.62;
            gl_FragColor = vec4(mix(vec3(0.55,0.6,0.68), vec3(0.85,0.88,0.92), k), a);
          }`,
      }),
    );
    clouds.position.y = 3.2;
    clouds.renderOrder = 5;
    s.add(clouds);

    // capture zones
    POINTS.forEach(([px, py]) => {
      const w = tileToWorld(px, py, this.flip);
      const zone = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 2.95, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }),
      );
      zone.position.set(w.x, Math.max(heightAt(w.x, w.z, this.flip), WATER_Y) + 0.12 + (BRIDGE_X.includes(disp(px, py, this.flip).x) ? DECK_Y + 0.5 : 0), w.z);
      s.add(zone);
      this.flags.push({ cloth: null as unknown as THREE.Mesh, mat: null as unknown as THREE.MeshStandardMaterial, owner: -1, raise: 1, zone, pulse: 0 });
    });
  }

  private instance(name: string, mats: THREE.Matrix4[], shadow = true) {
    const node = this.assets!.props.scene.getObjectByName(name);
    if (!node || !mats.length) return;
    const meshes: THREE.Mesh[] = [];
    node.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
    for (const m of meshes) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      patch(mat, this.u);
      const im = new THREE.InstancedMesh(m.geometry, mat, mats.length);
      mats.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = shadow;
      im.receiveShadow = true;
      this.scene.add(im);
    }
  }

  private buildProps() {
    const rnd = mulberry(42);
    const M = (x: number, z: number, s = 1, ry = rnd() * Math.PI * 2, y?: number) =>
      new THREE.Matrix4().compose(new THREE.Vector3(x, y ?? heightAt(x, z, this.flip), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    const pines: THREE.Matrix4[] = [];
    const oaks: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const rocks2: THREE.Matrix4[] = [];
    const bushes: THREE.Matrix4[] = [];
    // woods
    for (const [fx, fy] of FORESTS) {
      const d = disp(fx, fy, this.flip);
      const w = toWorld(d.x, d.y);
      for (let k = 0; k < 4; k++) {
        const x = w.x + (rnd() - 0.5) * 2.4;
        const z = w.z + (rnd() - 0.5) * 2.4;
        (rnd() < 0.6 ? pines : oaks).push(M(x, z, 0.85 + rnd() * 0.45));
      }
    }
    // frame of trees and rocks around the map
    for (let i = 0; i < 420; i++) {
      const x = (rnd() - 0.5) * 140;
      const z = (rnd() - 0.5) * 140;
      const e = Math.max(Math.abs(x), Math.abs(z)) / T;
      if (e < 8.1) continue;
      if (riverAmount(x / T + HALF, z / T + HALF) > 0.05) continue;
      const r = rnd();
      if (z > MAP / 2 - 2 && z < MAP / 2 + 30 && Math.abs(x) < 45 && r < 0.85) continue; // keep the camera side open
      if (r < 0.55) pines.push(M(x, z, 1 + rnd() * 0.7));
      else if (r < 0.85) oaks.push(M(x, z, 0.9 + rnd() * 0.6));
      else rocks.push(M(x, z, 1 + rnd() * 1.5));
    }
    // scatter inside the map
    for (let i = 0; i < 90; i++) {
      const x = (rnd() - 0.5) * MAP * 0.98;
      const z = (rnd() - 0.5) * MAP * 0.98;
      const fx = x / T + HALF;
      const fy = z / T + HALF;
      if (riverAmount(fx, fy) > 0.02 || roadAmount(fx, fy) > 0.1 || Math.abs(fy - 7) < 1.4) continue;
      if (Math.abs(fy - 13) < 1 || Math.abs(fy - 1) < 1) continue;
      const r = rnd();
      if (r < 0.45) bushes.push(M(x, z, 0.6 + rnd() * 0.6));
      else if (r < 0.7) rocks2.push(M(x, z, 0.7 + rnd() * 0.8));
      else if (r < 0.8) rocks.push(M(x, z, 0.4 + rnd() * 0.5));
    }
    // river banks
    for (let i = 0; i < 30; i++) {
      const x = (rnd() - 0.5) * 130;
      if (Math.abs(x / T + HALF - FORD_X) < 1.5 || BRIDGE_X.some((b) => Math.abs(x / T + HALF - b) < 1.2)) continue;
      const z = (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 0.6);
      rocks2.push(M(x, z, 0.5 + rnd() * 0.6));
    }
    this.instance("Pine", pines);
    this.instance("Oak", oaks);
    this.instance("Rock", rocks);
    this.instance("Rocks", rocks2);
    this.instance("Bush", bushes);

    // bridges
    this.instance(
      "Bridge",
      BRIDGE_X.map((bx) => M((bx - HALF) * T, 0, 1, 0, 0)),
    );

    // bases: tents, sandbags, crates
    const tents: THREE.Matrix4[] = [];
    const bags: THREE.Matrix4[] = [];
    const crates: THREE.Matrix4[] = [];
    const barrels: THREE.Matrix4[] = [];
    for (const south of [true, false]) {
      const sgn = south ? 1 : -1;
      const zb = sgn * 7.5 * T;
      tents.push(M(0, zb + sgn * 1.5, 1.1, south ? 0 : Math.PI));
      tents.push(M(-4.6 * T, zb + sgn * 0.8, 0.85, south ? 0.3 : Math.PI + 0.3));
      tents.push(M(4.6 * T, zb + sgn * 0.8, 0.85, south ? -0.3 : Math.PI - 0.3));
      bags.push(M(-2 * T, sgn * 5.2 * T, 1, south ? 0 : Math.PI));
      bags.push(M(2 * T, sgn * 5.2 * T, 1, south ? 0 : Math.PI));
      crates.push(M(-1.6 * T, zb, 1));
      crates.push(M(1.7 * T, zb + sgn * 0.6, 0.9));
      barrels.push(M(2.4 * T, zb, 1));
      barrels.push(M(-5.6 * T, zb - sgn * 1, 1));
    }
    this.instance("Tent", tents);
    this.instance("Sandbags", bags);
    this.instance("Crates", crates);
    this.instance("Barrels", barrels);

    // grass tufts
    const blade = new THREE.BufferGeometry();
    const v: number[] = [];
    const cl: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.13;
      const cz = Math.sin(a) * 0.13;
      v.push(-cx, 0, -cz, cx, 0, cz, 0, 0.42, 0);
      cl.push(0.07, 0.13, 0.04, 0.07, 0.13, 0.04, 0.2, 0.3, 0.08);
    }
    blade.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    blade.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
    blade.computeVertexNormals();
    const N = 4500;
    const grass = new THREE.InstancedMesh(blade, patch(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), this.u, { wind: true }), N);
    let k = 0;
    for (let i = 0; i < N * 3 && k < N; i++) {
      const x = (rnd() - 0.5) * (MAP + 30);
      const z = (rnd() - 0.5) * (MAP + 30);
      const fx = x / T + HALF;
      const fy = z / T + HALF;
      if (riverAmount(fx, fy) > 0.01 || roadAmount(fx, fy) > 0.3 || Math.abs(fy - 7) < 1.1) continue;
      if (heightAt(x, z, this.flip) > 4) continue;
      grass.setMatrixAt(k++, M(x, z, 0.7 + rnd() * 0.9));
    }
    grass.count = k;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // flags
    const pole = this.assets!.props.scene.getObjectByName("FlagPole")!;
    const cloth = this.assets!.props.scene.getObjectByName("Flag") as THREE.Mesh;
    POINTS.forEach(([px, py], i) => {
      const w = tileToWorld(px, py, this.flip);
      const x = w.x + 1.9;
      const z = w.z + (this.flip ? -0.4 : 0.4);
      const y = Math.max(heightAt(x, z, this.flip), WATER_Y + 0.02);
      const p = pole.clone();
      p.position.set(x, y, z);
      p.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.scene.add(p);
      const mat = patch(new THREE.MeshStandardMaterial({ color: "#f2f2f2", side: THREE.DoubleSide, roughness: 0.8 }), this.u, { flag: i * 1.7 }) as THREE.MeshStandardMaterial;
      const c = new THREE.Mesh(cloth.geometry, mat);
      c.position.set(0, 3.6, 0);
      c.castShadow = true;
      p.add(c);
      this.flags[i].cloth = c;
      this.flags[i].mat = mat;
    });
  }

  // ---------- materials for soldiers ----------
  private soldierMat(orig: THREE.MeshStandardMaterial, team: "blue" | "red", ghost: boolean, tone: number) {
    if (ghost) return this.ghostMat;
    const name = orig.name;
    const key = `${name}|${name === "Skin" ? tone : ""}|${name.startsWith("Team") ? team : ""}`;
    let m = this.matCache.get(key);
    if (!m) {
      const n = orig.clone();
      if (name === "Team") n.color.set(TEAM[team].jacket);
      if (name === "TeamBand") {
        n.color.set(TEAM[team].band);
        n.emissive.set(TEAM[team].glow);
        n.emissiveIntensity = 0.9;
      }
      if (name === "Skin") n.color.set(SKIN_TONES[tone % SKIN_TONES.length]);
      this.matCache.set(key, n);
      m = n;
    }
    return m;
  }

  private makeSoldier(team: "blue" | "red", kind: number, ghost: boolean, idx: number): Soldier {
    const g = this.assets!.soldier;
    const obj = skClone(g.scene);
    obj.scale.setScalar(SCALE);
    const tone = (idx * 7 + (team === "red" ? 3 : 0)) % 4;
    obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.material = this.soldierMat(m.material as THREE.MeshStandardMaterial, team, ghost, tone);
        m.castShadow = !ghost;
        m.frustumCulled = false;
      }
    });
    const inf = obj.getObjectByName("Infantry");
    const sc = obj.getObjectByName("Scout");
    if (inf) inf.visible = kind !== 1;
    if (sc) sc.visible = kind === 1;
    const mixer = new THREE.AnimationMixer(obj);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const clip of g.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name === "Die") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      acts[clip.name] = a;
    }
    acts.Idle.play();
    acts.Idle.time = Math.random() * 2;
    if (ghost) mixer.timeScale = 0;
    this.scene.add(obj);
    return { obj, mixer, acts, cur: "Idle", pos: new THREE.Vector3(), off: new THREE.Vector2(), face: 0, alive: true, diedAt: 0, lastShootT: 0, speed: 0 };
  }

  private play(s: Soldier, name: string, fade = 0.22) {
    if (s.cur === name) return;
    const next = s.acts[name];
    const prev = s.acts[s.cur];
    next.reset();
    if (name !== "Die") next.time = Math.random() * next.getClip().duration;
    next.setEffectiveTimeScale(name === "Shoot" ? 0.8 + Math.random() * 0.5 : 1);
    next.play();
    prev.crossFadeTo(next, fade, false);
    s.cur = name;
  }

  private getSquad(u: SceneUnit): Squad {
    const key = `${u.team}${u.squad}${u.ghost ? "g" : ""}`;
    let q = this.squads.get(key);
    if (q) return q;
    const n = u.kind === 1 ? 2 : 4;
    const offs =
      n === 4
        ? [
            [-0.75, -0.55],
            [0.75, -0.45],
            [-0.6, 0.75],
            [0.65, 0.8],
          ]
        : [
            [-0.45, 0],
            [0.5, 0.35],
          ];
    const soldiers = offs.map(([ox, oz], i) => {
      const s = this.makeSoldier(u.team, u.kind, !!u.ghost, u.squad * 4 + i);
      s.off.set(ox + (Math.random() - 0.5) * 0.2, oz + (Math.random() - 0.5) * 0.2);
      return s;
    });
    const col = TEAM[u.team].ring;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false }));
    ring.renderOrder = 2;
    this.scene.add(ring);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 10), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.userData.key = key;
    this.scene.add(proxy);
    const labelEl = document.createElement("div");
    labelEl.className = "so-label";
    const own = u.team === "blue" && !u.ghost;
    labelEl.innerHTML = u.ghost
      ? `<span class="so-tag so-ghost">${SQUAD_NAMES[u.squad]} · last seen</span>`
      : `<span class="so-tag" style="background:${col}">${own ? `<b>${u.squad + 1}</b>` : ""}${SQUAD_NAMES[u.squad]}</span><span class="so-hp"><i></i></span>`;
    if (own) {
      labelEl.style.pointerEvents = "auto";
      labelEl.style.cursor = "pointer";
      labelEl.onclick = (e) => {
        e.stopPropagation();
        this.selectSquad(u.squad);
      };
    }
    const label = new CSS2DObject(labelEl);
    this.scene.add(label);
    q = {
      key,
      team: u.team,
      squad: u.squad,
      kind: u.kind,
      ghost: !!u.ghost,
      soldiers,
      center: new THREE.Vector3(),
      goal: new THREE.Vector3(),
      heading: this.flip === (u.team === "blue") ? 0 : Math.PI,
      hp: u.hp,
      tile: { x: -1, y: -1 },
      present: false,
      ring,
      proxy,
      label,
      labelEl,
      hpEl: labelEl.querySelector(".so-hp i"),
      firing: false,
      enemyPos: null,
    };
    // initial facing: toward the enemy side
    q.heading = u.team === "blue" ? Math.PI : 0;
    this.squads.set(key, q);
    return q;
  }

  // ---------- state ----------
  setState(s: SceneState) {
    this.state = s;
    if (this.assets) this.apply(s);
  }

  private apply(s: SceneState) {
    // fog target
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = disp(x, y, this.flip);
        this.fogTarget[d.y * W + d.x] = !s.fog || s.fog.has(`${x},${y}`) ? 1 : 0;
      }
    this.u.uFogOn.value = s.fog ? 1 : 0;

    const seen = new Set<string>();
    for (const u of s.units) {
      if (u.hp <= 0 && !u.ghost) {
        // keep corpses; mark the squad dead
        const q = this.squads.get(`${u.team}${u.squad}`);
        if (q) this.setHp(q, 0);
        continue;
      }
      const q = this.getSquad(u);
      seen.add(q.key);
      const w = tileToWorld(u.x, u.y, this.flip);
      q.goal.set(w.x, 0, w.z);
      if (!q.present || q.center.distanceTo(q.goal) > T * 2.6) {
        q.center.copy(q.goal);
        for (const so of q.soldiers) if (so.alive) so.pos.set(q.goal.x + so.off.x, 0, q.goal.z + so.off.y);
      }
      if (!q.present) {
        for (const so of q.soldiers) so.obj.visible = so.alive || !q.ghost;
      }
      q.present = true;
      q.tile = { x: u.x, y: u.y };
      this.setHp(q, u.hp, u.kind);
      if (u.team === "blue" && !u.ghost) this.updatePath(q, u, s.selected === u.squad);
    }
    for (const q of this.squads.values()) {
      if (!seen.has(q.key) && q.present) {
        q.present = false;
        for (const so of q.soldiers) if (so.alive) so.obj.visible = false;
      }
      const sel = s.selected === q.squad && q.team === "blue" && !q.ghost;
      q.labelEl.classList.toggle("so-sel", sel);
    }
    // firing pairs: any live, present enemy within one tile
    const live = [...this.squads.values()].filter((q) => q.present && !q.ghost && q.hp > 0);
    for (const q of live) {
      q.firing = false;
      q.enemyPos = null;
      for (const e of live) {
        if (e.team === q.team) continue;
        if (Math.max(Math.abs(e.tile.x - q.tile.x), Math.abs(e.tile.y - q.tile.y)) <= 1) {
          q.firing = true;
          q.enemyPos = e.center;
        }
      }
    }
    // capture points
    s.control.forEach((c, i) => {
      const f = this.flags[i];
      if (!f) return;
      const owner = c === 0 ? 0 : c - 1 === this.opts.mySide ? 1 : 2;
      if (f.owner !== owner) {
        const first = f.owner === -1;
        if (!first) f.raise = 0;
        f.owner = owner;
        f.pulse = first ? 0 : 1;
        const colr = owner === 1 ? TEAM.blue.ring : owner === 2 ? TEAM.red.ring : "#f2f2f2";
        (f.zone.material as THREE.MeshBasicMaterial).color.set(colr);
        f.mat?.color.set(owner === 1 ? "#3f7dff" : owner === 2 ? "#e8463c" : "#f2f2f2");
      }
    });
  }

  private setHp(q: Squad, hp: number, kind = q.kind) {
    const prev = q.hp;
    q.hp = hp;
    const max = maxHp(kind);
    if (q.hpEl) {
      const f = Math.max(0, hp / max);
      q.hpEl.style.width = `${f * 100}%`;
      q.hpEl.style.background = f > 0.5 ? "#3ccf7e" : f > 0.25 ? "#f2b13d" : "#ff5a5a";
    }
    if (q.ghost) return;
    if (hp < prev && q.present) this.damageNumber(q, prev - hp);
    const n = q.soldiers.length;
    const alive = hp <= 0 ? 0 : Math.ceil((hp / max) * n);
    let living = q.soldiers.filter((s) => s.alive);
    while (living.length > alive) {
      const s = living[living.length - 1];
      s.alive = false;
      s.diedAt = this.clock.elapsedTime;
      s.obj.visible = true;
      this.play(s, "Die", 0.1);
      this.puff(s.pos.clone().setY(s.pos.y + 0.4), 3);
      sfx.death(this.pan(s.pos));
      if (q.team === "blue") this.shake = Math.max(this.shake, 0.35);
      living = q.soldiers.filter((x) => x.alive);
    }
    if (hp <= 0) {
      q.ring.visible = false;
      q.label.visible = false;
      if (q.marker) q.marker.visible = false;
      if (q.path) q.path.visible = false;
    }
  }

  private updatePath(q: Squad, u: SceneUnit, selected: boolean) {
    const t = u.target;
    const key = t ? `${u.x},${u.y}>${t.x},${t.y}` : "";
    if (key === q.pathKey) {
      if (q.path) (q.path.material as THREE.LineDashedMaterial).opacity = selected ? 1 : 0.55;
      return;
    }
    q.pathKey = key;
    if (q.path) {
      this.scene.remove(q.path);
      q.path.geometry.dispose();
      q.path = undefined;
    }
    if (!t || (t.x === u.x && t.y === u.y)) {
      if (q.marker) q.marker.visible = false;
      return;
    }
    const tiles = pathTo({ x: u.x, y: u.y }, t);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < tiles.length; i++) {
      const a = tileToWorld(tiles[i].x, tiles[i].y, this.flip);
      const b = i + 1 < tiles.length ? tileToWorld(tiles[i + 1].x, tiles[i + 1].y, this.flip) : a;
      const steps = i + 1 < tiles.length ? 6 : 1;
      for (let k = 0; k < steps; k++) {
        const x = a.x + ((b.x - a.x) * k) / steps;
        const z = a.z + ((b.z - a.z) * k) / steps;
        pts.push(new THREE.Vector3(x, footY(x, z, this.flip) + 0.25, z));
      }
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: "#9cc3ff", dashSize: 0.55, gapSize: 0.35, transparent: true, opacity: selected ? 1 : 0.55, depthTest: false }),
    );
    line.computeLineDistances();
    line.renderOrder = 6;
    this.scene.add(line);
    q.path = line;
    if (!q.marker) {
      const m = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: "#4d8dff", emissive: "#2f6fff", emissiveIntensity: 0.6 }));
      cone.position.y = 1.4;
      cone.name = "cone";
      m.add(cone);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#4d8dff", transparent: true, opacity: 0.8, depthWrite: false }));
      r.position.y = 0.08;
      m.add(r);
      this.scene.add(m);
      q.marker = m;
    }
    const tw = tileToWorld(t.x, t.y, this.flip);
    q.marker.position.set(tw.x, footY(tw.x, tw.z, this.flip), tw.z);
    q.marker.visible = true;
  }

  // ---------- fx ----------
  private pan(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return Math.max(-0.8, Math.min(0.8, v.x * 0.8));
  }
  private vol(p: THREE.Vector3) {
    return Math.max(0.05, Math.min(1, 1 - (this.camera.position.distanceTo(p) - 15) / 70));
  }

  private shoot(from: Soldier, at: THREE.Vector3) {
    const dir = new THREE.Vector3(Math.sin(from.face), 0, Math.cos(from.face));
    const muzzle = from.pos.clone().addScaledVector(dir, 0.95 * SCALE).setY(from.pos.y + 1.42 * SCALE);
    const target = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 0, (Math.random() - 0.5) * 2.2));
    target.y = footY(target.x, target.z, this.flip) + 0.8 + Math.random() * 1.2;
    const len = muzzle.distanceTo(target);
    const tr = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    tr.position.copy(muzzle).lerp(target, 0.5);
    tr.lookAt(target);
    tr.scale.z = len;
    this.scene.add(tr);
    this.fx.push({ obj: tr, life: 0.09, max: 0.09, kind: "tracer" });
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fl.position.copy(muzzle);
    fl.scale.setScalar(0.9 + Math.random() * 0.4);
    this.scene.add(fl);
    this.fx.push({ obj: fl, life: 0.06, max: 0.06, kind: "flash" });
    this.shotLight.position.copy(muzzle);
    this.shotLight.intensity = 30;
    if (Math.random() < 0.5) this.puff(target, 1, 0.5);
    sfx.shot(this.vol(muzzle), this.pan(muzzle));
  }

  private puff(at: THREE.Vector3, n = 2, size = 1) {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, opacity: 0.7 }));
      sp.position.copy(at);
      sp.scale.setScalar(0.5 * size);
      this.scene.add(sp);
      this.fx.push({ obj: sp, life: 0.9, max: 0.9, kind: "puff", vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8) });
    }
  }

  private damageNumber(q: Squad, d: number) {
    const el = document.createElement("div");
    el.className = `so-dmg ${q.team === "blue" ? "so-dmg-me" : ""}`;
    el.textContent = `-${d}`;
    const o = new CSS2DObject(el);
    o.position.copy(q.center).setY(footY(q.center.x, q.center.z, this.flip) + 3.4);
    o.position.x += (Math.random() - 0.5) * 1.5;
    this.scene.add(o);
    this.fx.push({ obj: o, life: 1.1, max: 1.1, kind: "dmg" });
  }

  // ---------- input ----------
  private bindInput() {
    const c = this.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(ev, fn as EventListener);
      this.cleanup.push(() => t.removeEventListener(ev, fn as EventListener));
    };
    on(c, "pointerdown", (e) => {
      sfx.unlock();
      sfx.ambience();
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.intro = null;
      this.focusAnim = null;
      this.controls.autoRotate = false;
    });
    on(c, "pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || performance.now() - d.t > 600) return;
      if (e.button === 2) return;
      this.click(e.clientX, e.clientY);
    });
    on(c, "pointermove", (e) => {
      if (e.buttons) return;
      this.hoverAt(e.clientX, e.clientY);
    });
    on(c, "pointerleave", () => (this.hover.visible = false));
    on(c, "contextmenu", (e) => e.preventDefault());
    on(window, "keydown", (e) => {
      const tg = e.target as HTMLElement;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        this.keys.add(k);
        this.intro = null;
      }
      if (this.opts.interactive && ["1", "2", "3"].includes(k)) this.selectSquad(Number(k) - 1);
      if (k === "escape") this.opts.onSelect?.(null);
    });
    on(window, "keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  private pick(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const proxies = [...this.squads.values()].filter((q) => q.present && q.hp > 0 && !q.ghost).map((q) => q.proxy);
    const hitQ = this.ray.intersectObjects(proxies, false)[0];
    const squad = hitQ ? this.squads.get(hitQ.object.userData.key as string) : undefined;
    const hitT = this.ray.intersectObject(this.terrain, false)[0];
    return { squad, ground: hitT?.point };
  }

  selectSquad(i: number | null) {
    if (!this.opts.interactive) return;
    if (i !== null) {
      const q = this.squads.get(`blue${i}`);
      if (!q || q.hp <= 0) return;
      sfx.select();
    }
    this.opts.onSelect?.(i);
  }

  private click(cx: number, cy: number) {
    const { squad, ground } = this.pick(cx, cy);
    const sel = this.state?.selected ?? null;
    if (squad && squad.team === "blue") {
      this.selectSquad(sel === squad.squad ? null : squad.squad);
      return;
    }
    if (!this.opts.interactive) return;
    if (squad && squad.team === "red" && sel !== null) {
      this.opts.onCommand?.(sel, "attack", squad.tile.x, squad.tile.y);
      return;
    }
    if (!ground) return;
    const t = worldToTile(ground.x, ground.z, this.flip);
    if (!t) return;
    const s = snapTile(t.x, t.y, ground.z, this.flip);
    if (sel !== null) this.opts.onCommand?.(sel, "move", s.x, s.y);
    else this.opts.onTile?.(s.x, s.y);
  }

  private hoverAt(cx: number, cy: number) {
    const { squad, ground } = this.pick(cx, cy);
    const sel = this.state?.selected ?? null;
    const c = this.renderer.domElement;
    if (squad) {
      c.style.cursor = squad.team === "blue" || sel !== null ? "pointer" : "default";
      this.hover.visible = false;
      return;
    }
    c.style.cursor = sel !== null ? "crosshair" : "grab";
    if (!ground || !this.opts.interactive) return (this.hover.visible = false), undefined;
    const t = worldToTile(ground.x, ground.z, this.flip);
    if (!t) return (this.hover.visible = false), undefined;
    const s = snapTile(t.x, t.y, ground.z, this.flip);
    const w = tileToWorld(s.x, s.y, this.flip);
    this.hover.position.set(w.x, Math.max(footY(w.x, w.z, this.flip), WATER_Y) + 0.15, w.z);
    (this.hover.material as THREE.MeshBasicMaterial).color.set(sel !== null ? "#7fb2ff" : "#ffffff");
    this.hover.visible = true;
  }

  focusTile(x: number, y: number) {
    const w = tileToWorld(x, y, this.flip);
    this.focusAnim = { from: this.controls.target.clone(), to: new THREE.Vector3(w.x, 0, w.z), t: 0 };
    this.intro = null;
  }
  focusSquad(i: number) {
    const q = this.squads.get(`blue${i}`);
    if (q) this.focusAnim = { from: this.controls.target.clone(), to: q.center.clone().setY(0), t: 0 };
  }
  celebrate() {
    this.controls.autoRotate = true;
  }

  // ---------- frame ----------
  private resize() {
    const w = this.el.clientWidth || 1;
    const h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < 640 ? 55 : 42;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.u.uTime.value = t;

    // fog fade
    let changed = false;
    for (let i = 0; i < W * H; i++) {
      const d = this.fogTarget[i] - this.fogData[i];
      if (Math.abs(d) > 0.002) {
        this.fogData[i] += d * Math.min(1, dt * 4);
        this.fogBytes[i * 4] = Math.round(this.fogData[i] * 255);
        changed = true;
      }
    }
    if (changed) this.u.uFog.value.needsUpdate = true;

    this.updateSquads(dt, t);
    this.updateFx(dt);
    this.updateFlags(dt, t);
    this.updateCamera(dt);

    this.controls.update();
    const base = this.camera.position.clone();
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.6;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a));
    }
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.camera.position.copy(base);
  };

  private updateSquads(dt: number, t: number) {
    const sel = this.state?.selected ?? null;
    for (const q of this.squads.values()) {
      const speed = (q.kind === 1 ? 6 : 3) * 1.15;
      if (q.present) {
        const d = q.goal.clone().sub(q.center).setY(0);
        const dist = d.length();
        if (dist > 0.02) {
          q.center.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
          q.heading = Math.atan2(d.x, d.z);
        }
      }
      const gy = footY(q.center.x, q.center.z, this.flip);
      q.ring.position.set(q.center.x, Math.max(gy, WATER_Y) + 0.1, q.center.z);
      q.ring.visible = q.present && q.hp > 0 && !q.ghost;
      const isSel = sel === q.squad && q.team === "blue" && !q.ghost;
      const rm = q.ring.material as THREE.MeshBasicMaterial;
      rm.opacity = isSel ? 0.75 + Math.sin(t * 6) * 0.2 : 0.4;
      q.ring.scale.setScalar(isSel ? 1.05 + Math.sin(t * 6) * 0.04 : 1);
      q.proxy.position.set(q.center.x, gy + 1.6, q.center.z);
      q.label.position.set(q.center.x, gy + 3.5, q.center.z);
      q.label.visible = q.present && q.hp > 0;
      if (q.marker?.visible) {
        const cone = q.marker.getObjectByName("cone")!;
        cone.position.y = 1.4 + Math.sin(t * 4) * 0.2;
        cone.rotation.y = t * 2;
      }

      const ch = Math.cos(q.heading);
      const sh = Math.sin(q.heading);
      for (const s of q.soldiers) {
        s.mixer.update(dt);
        if (!s.alive) {
          const since = t - s.diedAt;
          if (since > 14) {
            s.obj.position.y -= dt * 0.4;
            if (since > 18) s.obj.visible = false;
          }
          continue;
        }
        if (!q.present) continue;
        // formation slot rotated by heading
        const gx = q.center.x + s.off.x * ch + s.off.y * sh;
        const gz = q.center.z - s.off.x * sh + s.off.y * ch;
        const dx = gx - s.pos.x;
        const dz = gz - s.pos.z;
        const dd = Math.hypot(dx, dz);
        const step = Math.min(dd, speed * 1.25 * dt);
        if (dd > 0.001) {
          s.pos.x += (dx / dd) * step;
          s.pos.z += (dz / dd) * step;
        }
        s.speed = s.speed * 0.85 + (step / Math.max(dt, 1e-4)) * 0.15;
        s.pos.y = footY(s.pos.x, s.pos.z, this.flip);
        let want = s.face;
        if (q.firing && q.enemyPos) want = Math.atan2(q.enemyPos.x - s.pos.x, q.enemyPos.z - s.pos.z);
        else if (s.speed > 0.4) want = Math.atan2(dx, dz);
        else if (dd < 0.05 && !q.ghost) want = q.heading;
        let diff = want - s.face;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        s.face += diff * Math.min(1, dt * 8);
        s.obj.position.copy(s.pos);
        s.obj.rotation.y = s.face;
        if (q.ghost) continue;
        const anim = q.firing && s.speed < 1 ? "Shoot" : s.speed > 0.5 ? (q.kind === 1 ? "Run" : "Walk") : "Idle";
        this.play(s, anim);
        if (anim === "Shoot" && q.enemyPos) {
          const a = s.acts.Shoot;
          if (a.time < s.lastShootT && Math.random() < 0.8) this.shoot(s, q.enemyPos);
          s.lastShootT = a.time;
        }
      }
    }
  }

  private updateFx(dt: number) {
    this.shotLight.intensity = Math.max(0, this.shotLight.intensity - dt * 400);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      if (f.kind === "tracer" || f.kind === "flash") ((f.obj as THREE.Mesh).material as THREE.Material).opacity = k;
      if (f.kind === "puff") {
        f.obj.position.addScaledVector(f.vel!, dt);
        f.obj.scale.multiplyScalar(1 + dt * 1.6);
        ((f.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.6 * k;
      }
      if (f.kind === "dmg") {
        f.obj.position.y += dt * 1.6;
        (f.obj as CSS2DObject).element.style.opacity = String(Math.min(1, k * 2));
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        if (f.kind === "dmg") (f.obj as CSS2DObject).element.remove();
        else {
          const m = (f.obj as THREE.Mesh).material as THREE.Material;
          m.dispose();
        }
        this.fx.splice(i, 1);
      }
    }
  }

  private updateFlags(dt: number, t: number) {
    for (const f of this.flags) {
      if (!f.cloth) continue;
      f.raise = Math.min(1, f.raise + dt * 0.7);
      const e = 1 - Math.pow(1 - f.raise, 3);
      f.cloth.position.y = 0.8 + 2.8 * e;
      f.pulse = Math.max(0, f.pulse - dt * 0.6);
      f.zone.scale.setScalar(1 + f.pulse * 0.5 + Math.sin(t * 2) * 0.02);
      (f.zone.material as THREE.MeshBasicMaterial).opacity = 0.45 + f.pulse * 0.5;
    }
  }

  private updateCamera(dt: number) {
    const c = this.controls;
    if (this.intro) {
      this.intro.t += dt / 3.2;
      const k = Math.min(1, this.intro.t);
      const e = 1 - Math.pow(1 - k, 3);
      c.target.lerpVectors(new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, 6), e);
      this.camera.position.lerpVectors(new THREE.Vector3(0, 90, -70), new THREE.Vector3(0, 36, 44), e);
      if (k >= 1) this.intro = null;
      return;
    }
    if (this.focusAnim) {
      this.focusAnim.t = Math.min(1, this.focusAnim.t + dt * 2);
      const e = 1 - Math.pow(1 - this.focusAnim.t, 3);
      const next = this.focusAnim.from.clone().lerp(this.focusAnim.to, e);
      const delta = next.clone().sub(c.target);
      c.target.add(delta);
      this.camera.position.add(delta);
      if (this.focusAnim.t >= 1) this.focusAnim = null;
    }
    if (this.keys.size) {
      const fwd = c.target.clone().sub(this.camera.position).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const mv = new THREE.Vector3();
      const sp = 26 * dt;
      if (this.keys.has("w") || this.keys.has("arrowup")) mv.addScaledVector(fwd, sp);
      if (this.keys.has("s") || this.keys.has("arrowdown")) mv.addScaledVector(fwd, -sp);
      if (this.keys.has("d") || this.keys.has("arrowright")) mv.addScaledVector(right, sp);
      if (this.keys.has("a") || this.keys.has("arrowleft")) mv.addScaledVector(right, -sp);
      c.target.add(mv);
      this.camera.position.add(mv);
      const rot = (this.keys.has("q") ? 1 : 0) - (this.keys.has("e") ? 1 : 0);
      if (rot) {
        const off = this.camera.position.clone().sub(c.target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot * dt * 1.4);
        this.camera.position.copy(c.target).add(off);
      }
    }
    // keep the camera over the map
    const lim = MAP / 2 + 3;
    const cx = Math.max(-lim, Math.min(lim, c.target.x));
    const cz = Math.max(-lim, Math.min(lim, c.target.z));
    if (cx !== c.target.x || cz !== c.target.z || c.target.y !== 0) {
      const d = new THREE.Vector3(cx - c.target.x, -c.target.y, cz - c.target.z);
      c.target.add(d);
      this.camera.position.add(d);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { POINT_NAMES };
