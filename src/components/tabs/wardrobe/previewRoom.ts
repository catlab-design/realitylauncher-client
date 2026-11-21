import * as THREE from "three";

/**
 * A clean white tiled room with white light tubes around the skin preview, drawn the
 * MineDevice way (F:\Skill\minedevice-pixel-art): code-generated textures, no noise,
 * shaded ramps (1 px highlight / falloff / 1 px edge), 2 texels per unit (one 32 px tile
 * per block with a 1 px groove on the block grid), vanilla face shading baked per face,
 * light tubes full-bright.
 *
 * Units follow skinview3d: 1 unit = 1 skin pixel, a block is 16 units, the player's feet
 * are at y = -24 and the orbit camera stays within ~70 units of the origin.
 */

const B = 16;
const TPU = 2; // texels per unit
const FLOOR = -24;
const HALF_X = 88;
const HALF_Z = 88;
const HEIGHT = 96;

export interface PreviewRoomOptions {
    /** Night mood: dimmer faces, dusk sky. */
    dark: boolean;
    /** Theme accent (kept for API stability; the room has its own palette). */
    accent: string;
}

// ---- colour helpers (mix / ramps) -------------------------------------------

type RGB = [number, number, number];
const hex = (h: string): RGB => {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

interface Ramp { hl: RGB; base: RGB; sh: RGB; edge: RGB }
const ramp = (hl: string, base: string, sh: string, edge: string): Ramp => ({ hl: hex(hl), base: hex(base), sh: hex(sh), edge: hex(edge) });

/** Named material ramps (warm highlights, slightly cooler shadows). */
const R = {
    white: ramp("#ffffff", "#f3f5f8", "#e8ebf0", "#d6dae2"),
    cream: ramp("#f7ecd7", "#efe2c8", "#e4d5b9", "#d6c4a5"),
    quartz: ramp("#fcf7ef", "#f4ede2", "#e9e0d2", "#dacdbb"),
    floor: ramp("#f2e5cc", "#eadbbf", "#dfcfb2", "#d0bea0"),
    pink: ramp("#f7a99f", "#ec8f86", "#de7f78", "#c96d67"),
    pinkDeep: ramp("#e5837b", "#d9706a", "#ca6461", "#b45856"),
    pinkLight: ramp("#fac9c2", "#f4b3aa", "#eaa49c", "#da928b"),
    oak: ramp("#cb9866", "#b98756", "#a8794c", "#8c6139"),
    oakDark: ramp("#9c6e43", "#8a5f37", "#795230", "#604127"),
    rug: ramp("#d5c3aa", "#c8b59c", "#bba88f", "#aa977f"),
    brick: ramp("#b35a4c", "#a34a3e", "#934237", "#7c372e"),
    mortar: ramp("#f1e7dc", "#e6dbcf", "#dacfc3", "#cdc1b4"),
    whiteBrick: ramp("#fbf7f1", "#f2ece4", "#e8e0d6", "#dbd1c4"),
    pot: ramp("#b9644a", "#a6553a", "#964b33", "#7e3f2b"),
    iron: ramp("#3a3b40", "#2a2a2e", "#232327", "#18181b"),
};
type Mat = keyof typeof R;

/** MineDevice `side()`: t = 0..1 down the face; first row HL, last row EDGE, between mix(BASE, SH, t*0.6). */
function sideRow(r: Ramp, row: number, rows: number): RGB {
    if (row === 0) return r.hl;
    if (row === rows - 1) return r.edge;
    return mix(r.base, r.sh, (row / Math.max(1, rows - 1)) * 0.6);
}

// ---- face painters ----------------------------------------------------------

type Dir = "top" | "bottom" | "side";
type FacePainter = (ctx: CanvasRenderingContext2D, w: number, h: number, dir: Dir) => void;

/** Smooth shaded face (the default for every solid material). */
const smoothFace = (r: Ramp): FacePainter => (ctx, w, h, dir) => {
    if (dir === "top" || dir === "bottom") {
        // flat faces: base with a 1 px highlight rim on the near edges, soft shadow rim far
        ctx.fillStyle = css(r.base);
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = css(mix(r.base, r.hl, 0.7));
        ctx.fillRect(0, 0, w, 1);
        ctx.fillRect(0, 0, 1, h);
        ctx.fillStyle = css(mix(r.base, r.sh, 0.8));
        ctx.fillRect(0, h - 1, w, 1);
        ctx.fillRect(w - 1, 0, 1, h);
        return;
    }
    for (let y = 0; y < h; y++) {
        ctx.fillStyle = css(sideRow(r, y, h));
        ctx.fillRect(0, y, w, 1);
    }
};

/** Oak furniture: 3 boards per face with 1 px seams, light top / shadow bottom, no grain. */
const plankFace = (r: Ramp): FacePainter => (ctx, w, h, dir) => {
    smoothFace(r)(ctx, w, h, dir);
    ctx.fillStyle = css(r.edge);
    const horizontal = dir !== "side" ? w >= h : true;
    if (horizontal) {
        for (let i = 1; i < 3; i++) ctx.fillRect(0, Math.round((h * i) / 3), w, 1);
    } else {
        for (let i = 1; i < 3; i++) ctx.fillRect(Math.round((w * i) / 3), 0, 1, h);
    }
};

/** Bricks on a block-aligned grid: 8x4 texel bricks, 1 px mortar, every brick shaded. */
const brickFace = (brick: Ramp, mortar: Ramp): FacePainter => (ctx, w, h) => {
    ctx.fillStyle = css(mortar.base);
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row * 4 < h; row++) {
        const y = row * 4;
        const off = row % 2 === 0 ? 0 : 4;
        for (let x = -off; x < w; x += 8) {
            for (let yy = 0; yy < 3; yy++) {
                ctx.fillStyle = css(sideRow(brick, yy, 3));
                ctx.fillRect(Math.max(0, x + 1), y + 1 + yy, Math.min(7, w - Math.max(0, x + 1)), 1);
            }
        }
    }
};

/** Smooth tiles for floor/walls: one tile per block (32 px), 1 px groove at the block edge. */
const tileFace = (r: Ramp): FacePainter => (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
        ctx.fillStyle = css(sideRow(r, y, h));
        ctx.fillRect(0, y, w, 1);
    }
    ctx.fillStyle = css(mix(r.sh, r.edge, 0.5));
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(w - 1, 0, 1, h);
};

const PAINTERS: Record<string, FacePainter> = {
    white: smoothFace(R.white),
    cream: smoothFace(R.cream),
    quartz: smoothFace(R.quartz),
    pink: smoothFace(R.pink),
    pinkDeep: smoothFace(R.pinkDeep),
    pinkLight: smoothFace(R.pinkLight),
    oak: plankFace(R.oak),
    oakDark: smoothFace(R.oakDark),
    rug: smoothFace(R.rug),
    pot: smoothFace(R.pot),
    iron: smoothFace(R.iron),
    brickRed: brickFace(R.brick, R.mortar),
    brickWhite: brickFace(R.whiteBrick, ramp("#ecc0b8", "#e7a9a1", "#dd9c94", "#cf8d86")),
    blanket: plankFace(R.pink), // quilted rows read like the reference's pink wool
};

// ---- texture / material factory -----------------------------------------------

/** Vanilla directional shading: +x, -x, +y, -y, +z, -z (BoxGeometry face order). */
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
const FACE_DIR: Dir[] = ["side", "side", "top", "bottom", "side", "side"];

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, w);
    canvas.height = Math.max(2, h);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    paint(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return tex;
}

const texels = (units: number) => Math.max(2, Math.round(units * TPU));

// ---- scene pieces -------------------------------------------------------------

// ---- builder --------------------------------------------------------------------

export function addPreviewRoom(scene: THREE.Scene, { dark }: PreviewRoomOptions): () => void {
    const group = new THREE.Group();
    group.name = "preview-room";
    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

    /** Night mood dims every non-emissive face a little (cool tint). */
    const night = dark ? new THREE.Color(0.62, 0.6, 0.72) : new THREE.Color(1, 1, 1);
    const shadeColor = (k: number) => new THREE.Color(k, k, k).multiply(night);

    const faceMaterial = (painter: FacePainter, pw: number, ph: number, dir: Dir, shade: number) =>
        track(new THREE.MeshBasicMaterial({
            map: track(canvasTexture(pw, ph, (ctx) => painter(ctx, ctx.canvas.width, ctx.canvas.height, dir))),
            color: shadeColor(shade),
        }));

    /** Box with per-face textures sized to the face (2 texels/unit) + vanilla face shading. */
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: Mat | keyof typeof PAINTERS) => {
        const painter = PAINTERS[mat];
        const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
        const mats = sizes.map(([fw, fh], i) => faceMaterial(painter, texels(fw), texels(fh), FACE_DIR[i], FACE_SHADE[i]));
        const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mats);
        mesh.position.set(x, FLOOR + y + h / 2, z);
        group.add(mesh);
        return mesh;
    };
    /** Full-bright part (end rods, lantern, screens). */
    const glowBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
        const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), track(new THREE.MeshBasicMaterial({ color })));
        mesh.position.set(x, FLOOR + y + h / 2, z);
        group.add(mesh);
    };
    /** Large tiled surface: one 32 px tile per block, grooves on the block grid. */
    const surface = (w: number, h: number, ramp: Ramp, shade: number) =>
        new THREE.Mesh(
            track(new THREE.PlaneGeometry(w, h)),
            track(new THREE.MeshBasicMaterial({
                map: track(canvasTexture(B * TPU, B * TPU, (ctx) => tileFace(ramp)(ctx, B * TPU, B * TPU, "side"), w / B, h / B)),
                color: shadeColor(shade),
            })),
        );
    // ---- white tiled box: floor, ceiling, walls -----------------------------------
    const floor = surface(HALF_X * 2, HALF_Z * 2, R.white, 1.0);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR;
    group.add(floor);
    const ceiling = surface(HALF_X * 2, HALF_Z * 2, R.white, 0.82);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = FLOOR + HEIGHT;
    group.add(ceiling);
    const walls: [number, number, number, number, number][] = [
        // rotY, x, z, width, shade (vanilla N/S 0.8, E/W 0.6, lifted so the room stays bright)
        [0, 0, -HALF_Z, HALF_X * 2, 0.94],
        [Math.PI, 0, HALF_Z, HALF_X * 2, 0.94],
        [Math.PI / 2, -HALF_X, 0, HALF_Z * 2, 0.86],
        [-Math.PI / 2, HALF_X, 0, HALF_Z * 2, 0.86],
    ];
    for (const [rotY, x, z, width, shade] of walls) {
        const wall = surface(width, HEIGHT, R.white, shade);
        wall.rotation.y = rotY;
        wall.position.set(x, FLOOR + HEIGHT / 2, z);
        group.add(wall);
    }

    // ---- white light tubes ------------------------------------------------------------
    // Ceiling: parallel tubes running front-to-back, each in a thin white housing.
    const tubeLen = HALF_Z * 2 - 3 * B;
    for (const x of [-3 * B, -B, B, 3 * B]) {
        box(5, 2, tubeLen + 4, x, HEIGHT - 2, 0, "white");
        glowBox(2.5, 1.5, tubeLen, x, HEIGHT - 3.5, 0, "#ffffff");
    }
    // Back wall: two vertical tubes framing the player.
    for (const x of [-2.5 * B, 2.5 * B]) {
        box(4, HEIGHT - 2 * B, 2, x, B, -HALF_Z + 1, "white");
        glowBox(2, HEIGHT - 2 * B - 4, 1.5, x, B + 2, -HALF_Z + 2, "#ffffff");
    }

    scene.add(group);
    return () => {
        scene.remove(group);
        for (const d of disposables) d.dispose();
    };
}

/** Keeps the orbit camera inside the room and above the floor. */
export const PREVIEW_ROOM_LIMITS = {
    maxDistance: Math.min(HALF_X, HALF_Z) - 8,
    minDistance: 10,
    maxPolarAngle: Math.PI * 0.6,
};
