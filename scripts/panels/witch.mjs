import { HEX_EFFECT, LUNAR_EFFECTS, LUNAR_PHASES, MODULE_ID, lunarPhase, nextLunarValue } from '../rules.mjs';
import {
    L,
    chat,
    deleteEffects,
    enabled,
    findFeature,
    pay,
    placedEffects,
    rollToChat,
    sourceEffect,
    spellcast,
    tier
} from '../actor.mjs';

/* ---------- Lunar Phases (Moon) ---------- */

/** The phase effect on the Lunar Phases feature: by source id, else by name. */
function phaseEffect(item, phase) {
    const id = LUNAR_EFFECTS[phase];
    if (!id) return null;
    return item.effects.get(id) ?? item.effects.find(e => e.name.toLowerCase() === phase) ?? null;
}

/** Turn on only the effect that matches the die, so the sheet never carries a stale (or default-on) phase. */
export async function syncLunarEffects(item) {
    const phase = lunarPhase(item.system.resource?.value ?? 0);
    const updates = [];
    for (const key of Object.keys(LUNAR_EFFECTS)) {
        const effect = phaseEffect(item, key);
        if (!effect) continue;
        const disabled = key !== phase;
        if (effect.disabled !== disabled) updates.push({ _id: effect.id, disabled });
    }
    if (updates.length) await item.updateEmbeddedDocuments('ActiveEffect', updates);
}

async function setMoon(item, value) {
    await item.update({ 'system.resource.value': value });
    await syncLunarEffects(item);
}

export const lunarPanel = {
    id: 'lunar',
    setting: 'lunarPhases',
    icon: 'fa-solid fa-moon',
    template: `modules/${MODULE_ID}/templates/lunar.hbs`,

    applies: actor => !!findFeature(actor, 'lunarPhases'),

    prepare(actor) {
        const item = findFeature(actor, 'lunarPhases');
        const value = item.system.resource?.value ?? 0;
        const phase = lunarPhase(value);
        return {
            itemId: item.id,
            value,
            phase,
            phaseLabel: phase ? L(`Lunar.Phase.${phase}`) : L('Lunar.Unrolled'),
            phaseEffect: phase ? L(`Lunar.Effect.${phase}`) : L('Lunar.RollHint'),
            phases: LUNAR_PHASES.map(p => ({ key: p, label: L(`Lunar.Phase.${p}`), effect: L(`Lunar.Effect.${p}`), active: p === phase })),
            next: phase ? L(`Lunar.Phase.${lunarPhase(nextLunarValue(value))}`) : null
        };
    },

    actions: {
        async rollMoon({ actor }) {
            const item = findFeature(actor, 'lunarPhases');
            const roll = await rollToChat(actor, '1d6', L('Lunar.RollFlavor'));
            await setMoon(item, roll.total);
        },
        async advanceMoon({ actor }) {
            const item = findFeature(actor, 'lunarPhases');
            const value = item.system.resource?.value ?? 0;
            if (!value) return ui.notifications.warn(L('Lunar.RollFirst'));
            if (!(await pay(actor, 'hope', 1))) return;
            const next = nextLunarValue(value);
            await setMoon(item, next);
            await chat(actor, `<p>${L('Lunar.AdvanceChat', { actor: actor.name, phase: L(`Lunar.Phase.${lunarPhase(next)}`) })}</p>`);
        }
    }
};

/** Keep effects in step when the die is changed on the sheet itself (click / right-click on the die). */
Hooks.on('updateItem', async (item, changes, options, userId) => {
    if (userId !== game.user.id || !enabled('lunarPhases')) return;
    if (foundry.utils.getProperty(changes, 'system.resource.value') === undefined) return;
    if (item.parent?.documentName !== 'Actor' || findFeature(item.parent, 'lunarPhases')?.id !== item.id) return;
    await syncLunarEffects(item);
});

/* ---------- Hex ---------- */

export const hexPanel = {
    id: 'hex',
    setting: 'hexes',
    icon: 'fa-solid fa-eye',
    template: `modules/${MODULE_ID}/templates/hex.hbs`,

    applies: actor => !!findFeature(actor, 'hex'),

    prepare(actor) {
        const item = findFeature(actor, 'hex');
        const hexed = placedEffects(item, sourceEffect(item, HEX_EFFECT)).map(({ token, effect }) => ({
            uuid: effect.uuid,
            tokenUuid: token.uuid,
            name: token.name,
            img: token.texture?.src ?? token.actor?.img
        }));
        const cap = Math.max(0, spellcast(actor));
        return {
            itemId: item.id,
            hexed,
            count: hexed.length,
            cap,
            full: hexed.length >= cap,
            over: hexed.length > cap,
            penalty: tier(actor),
            hasScene: !!game.scenes?.viewed
        };
    },

    actions: {
        async unhex({ target }) {
            const effect = await fromUuid(target.closest('[data-effect-uuid]')?.dataset.effectUuid);
            if (effect) await deleteEffects([effect]);
        },
        async ping({ target }) {
            const token = await fromUuid(target.closest('[data-token-uuid]')?.dataset.tokenUuid);
            if (token?.object && canvas.ready) canvas.ping(token.object.center);
        },
        /** The feature's own action: it marks the Stress and applies Hex to the user's targets. */
        async hex({ actor, event }) {
            await findFeature(actor, 'hex')?.use(event);
        },
        async clearAll({ actor }) {
            const item = findFeature(actor, 'hex');
            const effects = placedEffects(item, sourceEffect(item, HEX_EFFECT)).map(p => p.effect);
            if (effects.length) await deleteEffects(effects);
        }
    }
};

/** Warn whoever placed a Hex past the witch's Spellcast limit (the hex itself still lands). */
Hooks.on('createActiveEffect', (effect, options, userId) => {
    if (userId !== game.user.id || !enabled('hexes') || !effect.origin) return;
    const source = fromUuidSync(effect.origin, { strict: false });
    const item = source?.parent;
    const witch = item?.parent;
    if (witch?.documentName !== 'Actor' || findFeature(witch, 'hex')?.id !== item.id) return;
    const cap = Math.max(0, spellcast(witch));
    const count = placedEffects(item, source).length;
    if (count > cap) ui.notifications.warn(L('Hex.OverCap', { actor: witch.name, count, cap }));
});
