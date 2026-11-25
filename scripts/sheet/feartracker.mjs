import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';
import { chatThemes, readTheme } from './chattheme.mjs';
import { frameFor } from './frame.mjs';

/**
 * Appearance overrides for the system's Fear tracker (ui.resources): token colours, icon and shape, and a glow at
 * maximum Fear. Each one is "system" by default, which leaves the tracker exactly as the system draws it.
 *
 * Colours come as plain palettes or from a sheet theme of the Core Rulebook module (its core theme or a campaign
 * frame's, including those Hope & Fear adds), read from the theme's own --dh-c-* values. Icons come as plain
 * Font Awesome icons or one picked for each campaign frame.
 */

export const SYSTEM = 'system';

/** Plain palettes as [start, end]: tokens step from start to end across the row, the bar fades into end. */
const PALETTES = {
    crimson: ['#7f0a1a', '#e11d48'],
    ember: ['#a3170f', '#f59e0b'],
    gold: ['#8a4b08', '#facc15'],
    emerald: ['#065f46', '#84cc16'],
    frost: ['#1e3a8a', '#67e8f9'],
    violet: ['#3b0a8f', '#e040fb'],
    rose: ['#9d174d', '#fda4af'],
    shadow: ['#18181b', '#71717a']
};

const ICONS = {
    skullCrossbones: 'fa-skull-crossbones',
    ghost: 'fa-ghost',
    eye: 'fa-eye',
    spider: 'fa-spider',
    dragon: 'fa-dragon',
    fire: 'fa-fire',
    bolt: 'fa-bolt',
    moon: 'fa-moon',
    heartCrack: 'fa-heart-crack',
    hourglass: 'fa-hourglass-half',
    crow: 'fa-crow',
    masks: 'fa-masks-theater',
    star: 'fa-star',
    circle: 'fa-circle'
};

/** One icon per campaign frame. Frames other modules add without an entry here just have no icon on offer. */
const FRAME_ICONS = {
    witherwild: 'fa-leaf',
    'five-banners': 'fa-flag',
    'beast-feast': 'fa-drumstick-bite',
    'age-of-umbra': 'fa-ghost',
    motherboard: 'fa-microchip',
    colossus: 'fa-mountain-sun',
    'castle-high': 'fa-chess-rook',
    weredragon: 'fa-dragon',
    andaluria: 'fa-heart',
    'journey-to-horizon': 'fa-compass'
};

const SHAPES = ['squircle', 'square', 'diamond'];

/** Whole-tracker styles. The banner is a dark hexagonal bar with a gold rim and diamond pips (no icons). */
const STYLES = ['banner'];

const FRAME = 'frame:';

const setting = key => game.settings.get(MODULE_ID, key);

/* -------------------------------------------- */
/*  Choices for the settings window             */
/* -------------------------------------------- */

/** Grouped choices: a nested object becomes an <optgroup> in the settings window. */
export function colorChoices() {
    const frames = Object.fromEntries(Object.entries(chatThemes()).map(([id, name]) => [`${FRAME}${id}`, name]));
    return {
        [SYSTEM]: L('Fear.System'),
        [L('Fear.Group.Palettes')]: Object.fromEntries(Object.keys(PALETTES).map(id => [id, L(`Fear.Color.${id}`)])),
        ...(Object.keys(frames).length ? { [L('Fear.Group.Frames')]: frames } : {})
    };
}

export function iconChoices() {
    const themes = chatThemes();
    const frames = Object.fromEntries(
        Object.entries(themes)
            .filter(([id]) => id in FRAME_ICONS)
            .map(([id, name]) => [`${FRAME}${id}`, name])
    );
    return {
        [SYSTEM]: L('Fear.System'),
        [L('Fear.Group.Icons')]: Object.fromEntries(Object.keys(ICONS).map(id => [id, L(`Fear.Icon.${id}`)])),
        ...(Object.keys(frames).length ? { [L('Fear.Group.Frames')]: frames } : {})
    };
}

export function styleChoices() {
    return { [SYSTEM]: L('Fear.System'), ...Object.fromEntries(STYLES.map(id => [id, L(`Fear.Style.${id}`)])) };
}

export function shapeChoices() {
    return { [SYSTEM]: L('Fear.System'), ...Object.fromEntries(SHAPES.map(id => [id, L(`Fear.Shape.${id}`)])) };
}

/* -------------------------------------------- */
/*  Resolving a choice                          */
/* -------------------------------------------- */

/** Relative luminance of a #rgb/#rrggbb colour, or null if it isn't one. */
function luminance(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map(i => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const frameColors = new Map();

/**
 * A colour choice as { from, to, border, ink }, or null for the system's own look. A frame steps from its accent
 * towards its bright accent with its secondary colour as the rim. The icon is light or dark, whichever reads on it.
 */
export function resolveColors(choice) {
    if (!choice || choice === SYSTEM) return null;
    if (choice in PALETTES) {
        const [from, to] = PALETTES[choice];
        return { from, to, border: null, ink: null };
    }
    if (!choice.startsWith(FRAME)) return null;
    const id = choice.slice(FRAME.length);
    if (!(id in chatThemes())) return null;
    if (!frameColors.has(id)) {
        const t = readTheme(id);
        if (!t.accent || !t['bright-accent']) return null;
        const to = `color-mix(in oklab, ${t.accent}, ${t['bright-accent']} 55%)`;
        // Light frames (Age of Umbra, Castle High…) get their deep accent as the icon colour instead of white.
        const la = luminance(t.accent);
        const lb = luminance(t['bright-accent']);
        const light = la !== null && lb !== null && (la + lb) / 2 > 0.35;
        frameColors.set(id, {
            from: t.accent,
            to,
            border: t.secondary || null,
            ink: light ? t['deep-accent'] || '#111' : t.white || '#fff'
        });
    }
    return frameColors.get(id);
}

/** The Font Awesome classes for an icon choice, or null for the system's skull. */
export function resolveIcon(choice) {
    if (!choice || choice === SYSTEM) return null;
    if (choice in ICONS) return `fa-solid ${ICONS[choice]}`;
    if (choice.startsWith(FRAME)) {
        const icon = FRAME_ICONS[choice.slice(FRAME.length)];
        return icon ? `fa-solid ${icon}` : null;
    }
    return null;
}

/* -------------------------------------------- */
/*  Applying it                                 */
/* -------------------------------------------- */

const VARS = ['--dhet-fear-from', '--dhet-fear-to', '--dhet-fear-border', '--dhet-fear-ink'];
const SKULL = 'fas fa-skull';

/**
 * Restyle a tracker (the real one or the settings window's preview). `root` holds a .fear-tokens row and/or a
 * .progress-bar; `look` is { color, icon, shape, glow, atMax }.
 */
export function styleTracker(root, { style, color, icon, shape, glow, atMax }) {
    const colors = resolveColors(color);
    const tokens = [...root.querySelectorAll('.fear-tokens a.fear-token')];

    root.classList.toggle('dhet-fear-colored', !!colors);
    root.classList.toggle('dhet-fear-rim', !!colors?.border);
    for (const v of VARS) root.style.removeProperty(v);
    if (colors) {
        root.style.setProperty('--dhet-fear-from', colors.from);
        root.style.setProperty('--dhet-fear-to', colors.to);
        if (colors.border) root.style.setProperty('--dhet-fear-border', colors.border);
        if (colors.ink) root.style.setProperty('--dhet-fear-ink', colors.ink);
    }
    const steps = Math.max(1, tokens.length - 1);
    tokens.forEach((token, i) => {
        if (!colors) return token.style.removeProperty('--dhet-fear-token');
        const pct = Math.round((Number(token.dataset.index ?? i) / steps) * 100);
        token.style.setProperty('--dhet-fear-token', `color-mix(in oklab, ${colors.from}, ${colors.to} ${pct}%)`);
    });

    for (const s of STYLES) root.classList.toggle(`dhet-fear-${s}`, s === style);
    for (const s of SHAPES) root.classList.toggle(`dhet-fear-${s}`, s === shape && !STYLES.includes(style));
    root.classList.toggle('dhet-fear-glow', !!glow && !!atMax);

    const classes = resolveIcon(icon) ?? SKULL;
    for (const i of root.querySelectorAll('.fear-tokens i.fear-token')) i.className = `fear-token ${classes}`;
}

/** Whether a campaign frame has an icon of its own (the core theme doesn't). */
export const hasFrameIcon = id => id in FRAME_ICONS;

/** The world's current choices, with the campaign frame's colours and icon where it drives them. */
export function currentLook() {
    const colorFrame = frameFor('fearColor');
    const iconFrame = frameFor('fearIcon');
    return {
        style: setting('fearStyle'),
        color: colorFrame ? `${FRAME}${colorFrame}` : setting('fearColor'),
        icon: iconFrame && hasFrameIcon(iconFrame) ? `${FRAME}${iconFrame}` : setting('fearIcon'),
        shape: setting('fearShape'),
        glow: setting('fearMaxGlow')
    };
}

export function rerenderFearTracker() {
    frameColors.clear();
    if (ui.resources?.rendered) ui.resources.render();
}

export function registerFearTracker() {
    Hooks.on('renderFearTracker', (app, element) => {
        const root = element ?? app.element;
        if (!root) return;
        const atMax = app.maxFear > 0 && app.currentFear >= app.maxFear;
        styleTracker(root, { ...currentLook(), atMax });
    });
    // The frame colours are read from the core module's stylesheet, which may not have applied on the first render.
    Hooks.once('ready', () => rerenderFearTracker());
}
