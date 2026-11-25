import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';

/**
 * A Spotlight button on the Token HUD. The GM gives or takes the spotlight with it (the system's own Spotlight
 * macro: the combat tracker's spotlight in combat, the token's turn marker outside it). Players ask for the
 * spotlight on their own tokens: in combat through the combatant's request (the same one the combat tracker's
 * hand button sets), outside combat through a flag on the actor. The GM sees a small hand on every token asking.
 */

const FLAG = 'requestingSpotlight';
const on = key => game.settings.get(MODULE_ID, key);

/** Whether this token is asking for the spotlight (its combatant in combat, its actor outside it). */
function requesting(token) {
    const combatant = token.combatant;
    if (combatant) return !!combatant.system.spotlight?.requesting;
    return !!token.actor?.getFlag(MODULE_ID, FLAG);
}

/** Whether the GM has the spotlight on this token. */
function spotlighted(token) {
    if (game.combat?.combatant) return game.combat.combatant.tokenId === token.id;
    const tracker = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.SpotlightTracker);
    return !!tracker?.spotlightedTokens?.has(token.document.uuid);
}

async function toggleRequest(token) {
    const combatant = token.combatant;
    if (combatant) {
        // Same as the combat tracker's request button: join the back of the queue, or leave it.
        const asking = !!combatant.system.spotlight?.requesting;
        const order = (game.combat.turns ?? []).filter(c => !c.isNPC).map(c => c.system.spotlight?.requestOrderIndex || 0);
        await combatant.update({
            'system.spotlight': { requesting: !asking, requestOrderIndex: asking ? 0 : Math.max(0, ...order) + 1 }
        });
    } else if (token.actor) {
        await token.actor.setFlag(MODULE_ID, FLAG, !token.actor.getFlag(MODULE_ID, FLAG));
    }
}

async function toggleSpotlight(token) {
    await game.system.api.macros.spotlightCombatant(token);
    // Answered: the request outside combat is done (the combat tracker clears its own).
    if (token.actor?.getFlag(MODULE_ID, FLAG)) await token.actor.setFlag(MODULE_ID, FLAG, false);
}

function addHudButton(hud, element) {
    if (!on('tokenHudSpotlight')) return;
    const token = hud.object;
    if (!token) return;
    const gm = game.user.isGM;
    if (!gm && !token.document.isOwner) return;
    const column = element.querySelector('.col.left');
    if (!column) return;

    const active = gm ? spotlighted(token) : requesting(token);
    const label = L(`Spotlight.${gm ? (active ? 'Take' : 'Give') : active ? 'Cancel' : 'Request'}`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `control-icon dhet-spotlight-hud${active ? ' active' : ''}`;
    button.dataset.tooltip = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<i class="fa-solid ${active ? 'fa-hand-sparkles' : 'fa-hand'}" inert></i>`;
    button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await (gm ? toggleSpotlight(token) : toggleRequest(token));
        if (hud.rendered) hud.render();
    });
    column.append(button);
}

/* -------------------------------------------- */
/*  The GM's request marker on the canvas       */
/* -------------------------------------------- */

const HAND_SPARKLES =
    'M320 0c17.7 0 32 14.3 32 32l0 208c0 8.8 7.2 16 16 16s16-7.2 16-16l0-176c0-17.7 14.3-32 32-32s32 14.3 32 32l0 176c0 8.8 7.2 16 16 16s16-7.2 16-16l0-112c0-17.7 14.3-32 32-32s32 14.3 32 32l0 178.2c-19.2 5.4-34.7 20.4-40.4 40.3l-6.5 22.7-22.7 6.5c-25.2 7.2-42.5 30.2-42.5 56.4 0 22.1 12.4 42 31.4 51.9-27.5 17.8-60.2 28.1-95.4 28.1l-19.2 0c-59.6 0-116.9-22.9-160-64L76.4 341c-16-15.2-16.6-40.6-1.4-56.6s40.6-16.6 56.6-1.4l60.5 57.6c0-1.5-.1-3.1-.1-4.6l0-272c0-17.7 14.3-32 32-32s32 14.3 32 32l0 176c0 8.8 7.2 16 16 16s16-7.2 16-16l0-208c0-17.7 14.3-32 32-32zm-7.3 326.6c-1.1-3.9-4.7-6.6-8.7-6.6s-7.6 2.7-8.7 6.6l-7.3 25.4-25.4 7.3c-3.9 1.1-6.6 4.7-6.6 8.7s2.7 7.6 6.6 8.7l25.4 7.3 7.3 25.4c1.1 3.9 4.7 6.6 8.7 6.6s7.6-2.7 8.7-6.6l7.3-25.4 25.4-7.3c3.9-1.1 6.6-4.7 6.6-8.7s-2.7-7.6-6.6-8.7l-25.4-7.3-7.3-25.4zM104 120l48.3 13.8c4.6 1.3 7.7 5.5 7.7 10.2s-3.1 8.9-7.7 10.2L104 168 90.2 216.3c-1.3 4.6-5.5 7.7-10.2 7.7s-8.9-3.1-10.2-7.7L56 168 7.7 154.2C3.1 152.9 0 148.7 0 144s3.1-8.9 7.7-10.2L56 120 69.8 71.7C71.1 67.1 75.3 64 80 64s8.9 3.1 10.2 7.7L104 120zM584 408l48.3 13.8c4.6 1.3 7.7 5.5 7.7 10.2s-3.1 8.9-7.7 10.2L584 456 570.2 504.3c-1.3 4.6-5.5 7.7-10.2 7.7s-8.9-3.1-10.2-7.7L536 456 487.7 442.2c-4.6-1.3-7.7-5.5-7.7-10.2s3.1-8.9 7.7-10.2L536 408 549.8 359.7c1.3-4.6 5.5-7.7 10.2-7.7s8.9 3.1 10.2 7.7L584 408z';

let handTexture = null;
function hand() {
    if (!handTexture) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="640" height="512"><path fill="#ffffff" d="${HAND_SPARKLES}"/></svg>`;
        handTexture = PIXI.Texture.from(`data:image/svg+xml;base64,${btoa(svg)}`);
    }
    return handTexture;
}

const markers = new WeakMap();

function marker(token) {
    let m = markers.get(token);
    if (m && !m.destroyed && m.parent === token) return m;
    m = new PIXI.Container();
    m.eventMode = 'none';
    const disc = new PIXI.Graphics();
    disc.beginFill(0xc5a45e, 0.95).lineStyle(1.5, 0xffffff, 1).drawCircle(0, 0, 11).endFill();
    const sprite = new PIXI.Sprite(hand());
    sprite.anchor.set(0.5);
    sprite.width = 13;
    sprite.height = 13 * (512 / 640);
    sprite.y = -0.5;
    m.addChild(disc, sprite);
    token.addChild(m);
    markers.set(token, m);
    return m;
}

function refreshMarker(token) {
    const show = game.user.isGM && on('tokenHudSpotlight') && on('spotlightIndicator') && requesting(token);
    const existing = markers.get(token);
    if (!show) {
        if (existing && !existing.destroyed) existing.visible = false;
        return;
    }
    const m = marker(token);
    // Top right corner, scaled with the grid so it reads the same on any map.
    const scale = Math.max(0.6, canvas.grid.size / 100);
    m.scale.set(scale);
    m.position.set(token.w - 10 * scale, 10 * scale);
    m.visible = true;
}

const refresh = token => token?.renderFlags?.set({ refreshState: true });

/** Redraw markers and the open HUD, after a setting changes. */
export function refreshSpotlight() {
    if (!canvas.ready) return;
    for (const token of canvas.tokens.placeables) refresh(token);
    if (canvas.tokens.hud?.rendered) canvas.tokens.hud.render();
}

export function registerSpotlight() {
    Hooks.on('renderTokenHUD', addHudButton);
    Hooks.on('refreshToken', refreshMarker);

    // A request or the spotlight changed: update the tokens involved and the open HUD.
    const hudFor = test => {
        const hud = canvas.tokens?.hud;
        if (hud?.rendered && hud.object && test(hud.object)) hud.render();
    };
    Hooks.on('updateCombatant', (combatant, change) => {
        if (!foundry.utils.hasProperty(change, 'system.spotlight')) return;
        refresh(combatant.token?.object);
        hudFor(t => t.id === combatant.tokenId);
    });
    Hooks.on('updateActor', (actor, change) => {
        if (!foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${FLAG}`)) return;
        for (const token of actor.getActiveTokens()) refresh(token);
        hudFor(t => t.actor === actor);
    });
    Hooks.on('updateCombat', () => hudFor(() => true));
    Hooks.on('updateSetting', setting => {
        if (setting.key === `${CONFIG.DH.id}.${CONFIG.DH.SETTINGS.gameSettings.SpotlightTracker}`) hudFor(() => true);
    });
}
