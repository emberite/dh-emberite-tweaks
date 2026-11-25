import { MODULE_ID } from '../rules.mjs';

/**
 * Names on the Daggerheart Core Rulebook module's range bands. That module draws its rings (Very Close, Close and
 * Far) as a private graphic on the selected token, so this draws a separate layer of labels on the token with the
 * same geometry, shown and hidden under the same rules as its "Show Range Bands" setting. Each ring is named just
 * inside its edge, in curved text at the top, bottom and sides, and Very Far just outside the Far ring.
 */

const CORE = 'daggerheart-core';
const GOLD = 0xf3c267;
const BANDS = ['veryClose', 'close', 'far'];

/** Labels per token document UUID. */
const labels = new Map();

const coreActive = () => !!game.modules.get(CORE)?.active;

/** Whether the core module is showing range bands on this token right now (its own rules, repeated). */
function bandsShown(token) {
    if (!coreActive() || !game.settings.get(MODULE_ID, 'rangeLabels')) return false;
    if (!canvas.scene?.rangeSettings?.enabled || !token.controlled) return false;
    const mode = game.settings.get(CORE, 'rangeBands');
    if (mode === 'never') return false;
    return mode === 'always' || !!canvas.tokens.highlightObjects;
}

/** The core module's bounds: tokens smaller than a grid space count as filling the space they sit in. */
function mechanicalBounds(token) {
    const b = token.bounds;
    if (!(b.width < canvas.grid.sizeX && b.height < canvas.grid.sizeY)) return b;
    const p = canvas.grid.getTopLeftPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    return { x: p.x, y: p.y, width: Math.max(canvas.grid.sizeX, b.width), height: Math.max(canvas.grid.sizeY, b.height) };
}

const bandName = band => game.i18n.localize(`DAGGERHEART.CONFIG.Range.${band}.name`);

function textStyle(size) {
    return new PIXI.TextStyle({
        fontFamily: ['Lexend', 'Overpass', 'Signika', 'sans-serif'],
        fontSize: size,
        fontWeight: '700',
        fill: GOLD,
        letterSpacing: Math.round(size * 0.12),
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowAlpha: 0.75,
        dropShadowBlur: Math.max(2, size / 6),
        dropShadowDistance: 0
    });
}

/**
 * Lay `text` along a circle of `radius` around (cx, cy), centred on `angle` (radians, 0 = right, y down), with
 * letters upright as far as the curve allows: left to right over the top half, mirrored along the bottom half.
 */
function curvedText(text, { cx, cy, radius, angle, style }) {
    const group = new PIXI.Container();
    const chars = [...text.toUpperCase()];
    const widths = chars.map(ch => PIXI.TextMetrics.measureText(ch, style).width + style.letterSpacing);
    const total = widths.reduce((a, b) => a + b, 0) / radius;
    // Along the bottom the angle runs backwards, so the text still reads left to right.
    const bottom = Math.sin(angle) > 0.01;
    const dir = bottom ? -1 : 1;
    let a = angle - (dir * total) / 2;
    chars.forEach((ch, i) => {
        const step = widths[i] / radius;
        const mid = a + (dir * step) / 2;
        const letter = new PIXI.Text(ch, style);
        letter.anchor.set(0.5);
        letter.position.set(cx + radius * Math.cos(mid), cy + radius * Math.sin(mid));
        letter.rotation = mid + (bottom ? -Math.PI / 2 : Math.PI / 2);
        group.addChild(letter);
        a += dir * step;
    });
    return group;
}

/** Straight text on the edges of a rounded square (the core module's shape for large tokens on square grids). */
function edgeText(text, { x, y, rotation, style }) {
    const t = new PIXI.Text(text.toUpperCase(), style);
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.rotation = rotation;
    return t;
}

function drawLabels(token) {
    const group = new PIXI.Container();
    group.eventMode = 'none';
    const settings = canvas.scene.rangeSettings;
    const size = canvas.grid.size;
    const gap = Math.floor(size / 20);
    const fontSize = Math.max(10, Math.round(size * 0.26));
    const style = textStyle(fontSize);

    // The core module's geometry: the token's bounds, a circle (or a rounded square for a large token on a
    // square grid) at each band's distance from its edge.
    const bounds = mechanicalBounds(token);
    const fits = bounds.width <= canvas.grid.sizeX && bounds.height <= canvas.grid.sizeY;
    const cx = bounds.width / 2 + (bounds.x - token.x);
    const cy = bounds.height / 2 + (bounds.y - token.y);
    const square = canvas.grid.type === CONST.GRID_TYPES.SQUARE;
    const circle = !square || fits;
    const pad = square ? size / 8 : 0;
    const reach = band => settings[band] / (canvas.grid.distance / size);

    const rings = BANDS.map(band => ({ band, d: reach(band), inside: true }));
    rings.push({ band: 'veryFar', d: reach('far'), inside: false });

    for (const { band, d, inside } of rings) {
        const name = bandName(band);
        // Inside the ring's inner line, or outside its outer one.
        const offset = inside ? -fontSize * 0.75 : gap + fontSize * 0.8;
        if (circle) {
            const radius = d + Math.max(bounds.width, bounds.height) / 2 + pad + offset;
            if (radius < fontSize * 2) continue;
            for (const angle of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
                group.addChild(curvedText(name, { cx, cy, radius, angle, style }));
            }
        } else {
            const left = -d - offset,
                top = -d - offset;
            const right = bounds.width + d + offset,
                bottomEdge = bounds.height + d + offset;
            const midX = bounds.width / 2,
                midY = bounds.height / 2;
            group.addChild(edgeText(name, { x: midX, y: bottomEdge, rotation: 0, style }));
            group.addChild(edgeText(name, { x: midX, y: top, rotation: 0, style }));
            group.addChild(edgeText(name, { x: left, y: midY, rotation: -Math.PI / 2, style }));
            group.addChild(edgeText(name, { x: right, y: midY, rotation: Math.PI / 2, style }));
        }
    }
    group.alpha = 0.85;
    return group;
}

function removeLabels(uuid) {
    const entry = labels.get(uuid);
    if (!entry) return;
    if (!entry.group.destroyed) {
        entry.group.parent?.removeChild(entry.group);
        entry.group.destroy({ children: true });
    }
    labels.delete(uuid);
}

/** Match the labels to the bands: add them where bands are showing, remove them where not. */
export function syncRangeLabels() {
    if (!canvas.ready) return;
    for (const [uuid, entry] of [...labels]) {
        if (entry.token.destroyed || !bandsShown(entry.token)) removeLabels(uuid);
    }
    for (const token of canvas.tokens.controlled) {
        if (!bandsShown(token)) continue;
        const uuid = token.document.uuid;
        // Redrawn each time the core module redraws, so changed range settings or token size show up.
        removeLabels(uuid);
        const group = drawLabels(token);
        token.addChild(group);
        labels.set(uuid, { token, group });
    }
}

export function registerRangeLabels() {
    // The core module adds or removes its bands on the same hooks; wait a tick so its state has settled.
    const later = () => setTimeout(syncRangeLabels, 0);
    Hooks.on('highlightObjects', later);
    Hooks.on('controlToken', later);
    Hooks.on('canvasTearDown', () => {
        for (const uuid of [...labels.keys()]) removeLabels(uuid);
    });
}
