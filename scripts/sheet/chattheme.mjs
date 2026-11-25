import { MODULE_ID } from '../rules.mjs';
import { coreActive } from '../wizard/art.mjs';
import { frameFor } from './frame.mjs';

/**
 * Chat themes in the Daggerheart Core Rulebook module's design: messages take the colours, fonts and cover art
 * of one of its sheet themes (the core theme or a campaign frame's). The theme's values are read from the core
 * module's own stylesheet through a hidden probe, so themes added by other modules (Hope & Fear's campaign
 * frames) work too, and copied onto the page as --dhet-chat-* variables that styles/chat.css uses.
 */

const BUILT_IN = {
    'daggerheart-core': 'Core Rulebook',
    witherwild: 'The Witherwild',
    'five-banners': 'Five Banners Burning',
    'beast-feast': 'Beast Feast',
    'age-of-umbra': 'The Age of Umbra',
    motherboard: 'Motherboard',
    colossus: 'Colossus of the Drylands'
};

const VARS = [
    'white',
    'black',
    'accent',
    'deep-accent',
    'bright-accent',
    'secondary',
    'sections-background',
    'cover-image',
    'cover-position',
    'cover-opacity',
    'font-title',
    'font-body'
];

/** The themes on offer: the core module's and any campaign frames other modules registered with it. */
export function chatThemes() {
    if (!coreActive()) return {};
    return { ...BUILT_IN, ...(globalThis.metamorphic?.additionalSheetThemes ?? {}) };
}

/** Read a sheet theme's --dh-c-* values (the core theme is the sheet without a theme class). */
export function readTheme(name) {
    const probe = document.createElement('div');
    const themed = name !== 'daggerheart-core' ? ` themed theme-${name}` : '';
    probe.className = `application sheet daggerheart dh-c-style theme-dark${themed}`;
    probe.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none; inset: auto;';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const values = Object.fromEntries(VARS.map(v => [v, style.getPropertyValue(`--dh-c-${v}`).trim()]));
    probe.remove();
    return values;
}

/**
 * The cover art comes back as the core stylesheet wrote it, relative to its own folder (url(../../../modules/…)).
 * Make it absolute from Foundry's root, so it doesn't depend on where the stylesheet using it lives.
 */
function absoluteUrl(value) {
    return value.replace(/url\((['"]?)(?:\.\.\/)+([^'")]+)\1\)/, (_, q, path) => `url("${foundry.utils.getRoute(path)}")`);
}

export function applyChatTheme() {
    // The campaign frame's theme when it drives the chat, otherwise the chat's own choice.
    const name = frameFor('chatTheme') ?? game.settings.get(MODULE_ID, 'chatTheme');
    const root = document.body;
    for (const v of VARS) root.style.removeProperty(`--dhet-chat-${v}`);
    const on = !!name && name !== 'none' && coreActive() && name in chatThemes();
    root.classList.toggle('dhet-chat-themed', on);
    root.classList.toggle('dhet-chat-glass', !!game.settings.get(MODULE_ID, 'chatGlass'));
    if (!on) return;
    for (const [v, value] of Object.entries(readTheme(name))) {
        if (value) root.style.setProperty(`--dhet-chat-${v}`, v === 'cover-image' ? absoluteUrl(value) : value);
    }
}

export function registerChatTheme() {
    Hooks.once('ready', () => applyChatTheme());
}
