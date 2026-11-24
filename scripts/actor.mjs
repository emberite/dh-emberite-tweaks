import {
    FEATURE_IDS,
    FEATURE_NAMES,
    MODULE_ID,
    STANCES,
    STANCE_EFFECT_PREFIX,
    compendiumId,
    lastId
} from './rules.mjs';

/** Localize under this module's prefix. */
export const L = (key, data) => (data ? game.i18n.format(`DHET.${key}`, data) : game.i18n.localize(`DHET.${key}`));

/** Whether a world feature toggle is on. */
export const enabled = key => game.settings.get(MODULE_ID, key);

/**
 * Whether the character can use a feature yet. Subclass features unlock with the subclass: specialization
 * features need the specialization, mastery features the mastery (the system's own rule, which also hides
 * them on the sheet and suppresses their effects).
 */
export function isAvailable(actor, item) {
    return actor.system?.isItemAvailable?.(item) ?? true;
}

/**
 * The actor's copy of one of the system's features, if the character can use it yet. Matched by compendium
 * source first, then by its English name, since features added through a class or subclass and hand-made
 * copies may lack the source.
 */
export function findFeature(actor, key) {
    if (!actor?.items) return null;
    const features = actor.items.filter(i => i.type === 'feature' && isAvailable(actor, i));
    const id = FEATURE_IDS[key];
    const name = FEATURE_NAMES[key]?.toLowerCase();
    return (
        features.find(i => compendiumId(i._stats?.compendiumSource) === id) ??
        features.find(i => i.name.toLowerCase() === name) ??
        null
    );
}

export function level(actor) {
    return actor.system.levelData?.level?.current ?? 1;
}

export function tier(actor) {
    return actor.system.tier ?? 1;
}

/** Value of the actor's Spellcast trait (0 without a spellcasting subclass). */
export function spellcast(actor) {
    return actor.system.spellcastModifier ?? 0;
}

/** An actor-level resource like hope, stress, focus or favor, or null if the actor doesn't have it. */
export function resource(actor, key) {
    const r = actor.system.resources?.[key];
    if (!r) return null;
    return { value: Number(r.value) || 0, max: Number(r.max) || 0 };
}

/**
 * Pay a cost through the system's own resource handling (it clamps, relays through the GM and turns Stress
 * overflow into Hit Points). Returns false, with a warning, if the actor can't pay.
 */
export async function pay(actor, key, amount = 1) {
    const r = resource(actor, key);
    if (!r) return false;
    if (key === 'stress') {
        if (r.value + amount > r.max) {
            ui.notifications.warn(L('Notify.NoStress'));
            return false;
        }
        await actor.modifyResource([{ key, value: amount }]);
        return true;
    }
    if (r.value < amount) {
        ui.notifications.warn(L('Notify.NotEnough', { resource: resourceLabel(actor, key) }));
        return false;
    }
    await actor.modifyResource([{ key, value: -amount }]);
    return true;
}

export function resourceLabel(actor, key) {
    const label = actor.system.resources?.[key]?.label;
    return label ? game.i18n.localize(label) : key;
}

/** Post a short message as the actor. */
export function chat(actor, html, extra = {}) {
    return ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
        content: `<div class="dhet-chat">${html}</div>`,
        ...extra
    });
}

/** Roll a formula and post it as the actor. */
export async function rollToChat(actor, formula, flavor) {
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor });
    return roll;
}

/** Results of every die in a roll, flattened. */
export function rollResults(roll) {
    return roll.dice.flatMap(d => d.results.filter(r => r.active !== false).map(r => r.result));
}

/* ---------- stances ---------- */

/** Effect a stance feature applies when entered, or null if the item isn't a stance. */
export function stanceSourceEffect(item) {
    return item.effects?.find(e => !e.transfer && e.name?.startsWith(STANCE_EFFECT_PREFIX)) ?? null;
}

export function isStance(item) {
    if (item.type !== 'feature' || (item.parent && !isAvailable(item.parent, item))) return false;
    return STANCES[compendiumId(item._stats?.compendiumSource)] != null || !!stanceSourceEffect(item);
}

export function stanceTier(item) {
    return STANCES[compendiumId(item._stats?.compendiumSource)] ?? null;
}

/** Stance effects currently on the actor, whether entered from the drawer or the feature's own action. */
export function activeStanceEffects(actor) {
    return actor.effects.filter(e => e.getFlag(MODULE_ID, 'stance') || e.name?.startsWith(STANCE_EFFECT_PREFIX));
}

/** The stance item an applied stance effect came from. */
export function stanceItemFor(actor, effect) {
    const flagged = effect.getFlag(MODULE_ID, 'stance');
    if (flagged) return actor.items.get(flagged) ?? null;
    const sourceId = lastId(effect.origin);
    return actor.items.find(i => isStance(i) && i.effects.has(sourceId)) ?? null;
}

/* ---------- effects placed on other creatures ---------- */

/**
 * The effect a feature places on its targets: the one with the system's id, else its first non-transfer effect
 * (a hand-made copy of the feature has new ids).
 */
export function sourceEffect(item, id) {
    return item?.effects.get(id) ?? item?.effects.find(e => !e.transfer) ?? null;
}

/** Whether an applied effect is a copy of `source` (the system sets `origin` to the source effect's uuid). */
export function cameFrom(effect, source) {
    return !!source && effect.origin === source.uuid;
}

/**
 * Creatures on the viewed scene carrying a copy of the `source` effect from `item`.
 * Linked actors appear once even with several tokens.
 */
export function placedEffects(item, source) {
    const scene = game.scenes?.viewed;
    if (!scene || !item || !source) return [];
    const seen = new Set();
    const found = [];
    for (const token of scene.tokens) {
        const actor = token.actor;
        if (!actor || seen.has(actor.uuid)) continue;
        seen.add(actor.uuid);
        for (const effect of actor.effects) {
            if (!effect.disabled && cameFrom(effect, source)) found.push({ token, actor, effect });
        }
    }
    return found;
}

/**
 * Delete effects, asking the active GM to do it for documents this user doesn't own (a player removing a Hex
 * from an adversary). The GM checks the requester owns the actor the effect came from.
 */
export async function deleteEffects(effects) {
    const own = effects.filter(e => e.isOwner);
    const others = effects.filter(e => !e.isOwner);
    for (const effect of own) await effect.delete();
    if (!others.length) return;
    if (!game.users.activeGM) {
        ui.notifications.warn(L('Notify.NoGM'));
        return;
    }
    game.socket.emit(`module.${MODULE_ID}`, { type: 'deleteEffects', uuids: others.map(e => e.uuid), userId: game.user.id });
}

/** GM side of deleteEffects. */
export function registerSocket() {
    game.socket.on(`module.${MODULE_ID}`, async message => {
        if (message?.type !== 'deleteEffects' || !game.user.isActiveGM) return;
        const user = game.users.get(message.userId);
        if (!user) return;
        for (const uuid of message.uuids ?? []) {
            const effect = await fromUuid(uuid);
            if (!effect || effect.documentName !== 'ActiveEffect') continue;
            const origin = effect.origin ? await fromUuid(effect.origin) : null;
            const sourceActor = origin?.parent?.parent ?? origin?.actor;
            if (!sourceActor?.testUserPermission?.(user, 'OWNER')) continue;
            await effect.delete();
        }
    });
}

/* ---------- effects this module puts on the character ---------- */

/** Effects on the actor tagged with this module's `kind` flag. */
export function ownEffects(actor, kind) {
    return actor.effects.filter(e => e.getFlag(MODULE_ID, 'kind') === kind);
}

/**
 * Put a module effect on the actor, replacing any earlier one of the same kind.
 * `changes` are system changes ({ key, type, value }); `duration` is a Daggerheart duration type.
 */
export async function setOwnEffect(actor, kind, { name, img, changes = [], duration = 'temporary', description = '', origin }) {
    const old = ownEffects(actor, kind).map(e => e.id);
    if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old);
    const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [
        {
            name,
            img: img ?? 'icons/svg/aura.svg',
            type: 'base',
            origin: origin ?? actor.uuid,
            description,
            system: {
                changes: changes.map(c => ({ phase: 'initial', priority: null, ...c })),
                duration: { type: duration, description: '' }
            },
            flags: { [MODULE_ID]: { kind } }
        }
    ]);
    return effect;
}

export async function clearOwnEffect(actor, kind) {
    const ids = ownEffects(actor, kind).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    return ids.length;
}

/** Hit Points an applied damage update marked (the system flips signs per resource, so take the size). */
export function hitPointsMarked(updates) {
    const hp = updates?.find?.(u => u.key === 'hitPoints');
    return Math.abs(Number(hp?.value) || 0);
}
