import { MODULE_ID } from '../rules.mjs';
import { frameFor } from './frame.mjs';

/**
 * Dynamic token rings for the campaign frame. The Core Rulebook module registers a ring for its core theme
 * ("daggerheart-core") and each of its campaign frames, and Hope & Fear does the same for its frames. With the
 * frame's Token ring switch on, the world's ring (Foundry's own "Dynamic Token Ring" setting) follows the frame:
 * the ring whose id or spritesheet names the frame, or the core ring when no ring does. Foundry only loads a ring
 * when the world loads, so the GM is asked to reload everyone after a change.
 */

const CORE = 'daggerheart-core';

/** Lower case letters and digits only, so "five-banners" is found in "daggerheart-five-banners-burning". */
const squash = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The ring this frame uses: one that names it, else the Core Rulebook's, else none. */
export function ringFor(frame) {
    const ring = CONFIG.Token.ring;
    const ids = ring?.configIDs ?? [];
    if (frame !== CORE) {
        const name = squash(frame);
        const own = ids.find(id => id !== CORE && [id, ring.getConfig(id)?.spritesheet].some(t => squash(t).includes(name)));
        if (own) return own;
    }
    return ids.includes(CORE) ? CORE : null;
}

let applying = null;

/** The GM points the world's token ring at the frame's ring and offers to reload everyone. */
export function applyRingFrame() {
    if (!game.user.isGM) return Promise.resolve();
    applying ??= (async () => {
        const frame = frameFor('rings');
        const ring = frame && ringFor(frame);
        if (!ring || game.settings.get('core', 'dynamicTokenRing') === ring) return;
        await game.settings.set('core', 'dynamicTokenRing', ring);
        await foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
    })().finally(() => (applying = null));
    return applying;
}

export function registerRings() {
    Hooks.once('ready', () => applyRingFrame().catch(err => console.warn(`${MODULE_ID} | token ring`, err)));
}
