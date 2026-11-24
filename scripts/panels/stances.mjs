import {
    FAVORED_STANCE,
    MODULE_ID,
    STANCES,
    STANCE_PACK,
    TRAITS,
    compendiumId,
    dropsStance,
    knownStanceLimit,
    pips,
    refocusResult
} from '../rules.mjs';
import {
    L,
    activeStanceEffects,
    chat,
    enabled,
    findFeature,
    isStance,
    level,
    pay,
    resource,
    rollResults,
    rollToChat,
    stanceItemFor,
    stanceSourceEffect,
    stanceTier,
    tier
} from '../actor.mjs';
import { plainText } from '../view.mjs';

/**
 * Brawler (Martial Artist): Focus track, known stances, one-click shifting that keeps a single active stance,
 * Refocus, a trait picker for Favored, and learning stances from the system compendium.
 */

const knownStances = actor =>
    actor.items
        .filter(isStance)
        .sort((a, b) => (stanceTier(a) ?? 9) - (stanceTier(b) ?? 9) || a.name.localeCompare(b.name));

/** The trait Favored adds to damage; stored on the actor, Instinct until chosen. */
const favoredTrait = actor => actor.getFlag(MODULE_ID, 'favoredTrait') ?? 'instinct';

const isFavored = item => compendiumId(item._stats?.compendiumSource) === FAVORED_STANCE || item.name === 'Favored';

/** Point Favored's damage change at the chosen trait. */
function favoredChanges(changes, trait) {
    return changes.map(c =>
        c.key === 'system.bonuses.damage.bonus' ? { ...c, value: `@system.traits.${trait}.value` } : c
    );
}

/** Leave the active stance (all of them, if the sheet ever ended up with several). */
async function dropStances(actor, except = null) {
    const ids = activeStanceEffects(actor)
        .filter(e => e.id !== except)
        .map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    return ids.length;
}

async function shift(actor, item, cost) {
    const source = stanceSourceEffect(item);
    if (!source) return;
    const current = activeStanceEffects(actor).map(e => stanceItemFor(actor, e));
    if (current.some(i => i?.id === item.id)) return ui.notifications.info(L('Stances.AlreadyIn', { stance: item.name }));
    if (!(await pay(actor, cost, 1))) return;

    await dropStances(actor);
    const data = source.toObject();
    delete data._id;
    Object.assign(data, { disabled: false, transfer: false, origin: source.uuid });
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.stance`, item.id);
    if (isFavored(item) && data.system?.changes) data.system.changes = favoredChanges(data.system.changes, favoredTrait(actor));
    await actor.createEmbeddedDocuments('ActiveEffect', [data]);

    await chat(
        actor,
        `<p>${L('Stances.ShiftChat', { actor: actor.name, stance: item.name })}</p>${await enriched(item)}`
    );
}

async function enriched(item) {
    const html = item.system.description ?? '';
    if (!html) return '';
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo: item });
}

/** Once per rest: clear Focus, roll Instinct d6s, keep the highest. */
async function refocus(actor) {
    const focus = resource(actor, 'focus');
    if (!focus) return;
    const dice = actor.system.traits?.instinct?.value ?? 0;
    if (dice < 1) {
        await actor.update({ 'system.resources.focus.value': 0 });
        return chat(actor, `<p>${L('Stances.RefocusNone', { actor: actor.name })}</p>`);
    }
    const roll = await rollToChat(actor, `${dice}d6`, L('Stances.RefocusFlavor'));
    const value = refocusResult(rollResults(roll), focus.max || 6);
    await actor.update({ 'system.resources.focus.value': value });
}

/** Stances from the compendium this character could learn now: their tier or lower, not yet known. */
async function learnable(actor) {
    const pack = game.packs.get(STANCE_PACK);
    if (!pack) return [];
    const known = new Set(knownStances(actor).map(i => compendiumId(i._stats?.compendiumSource) ?? i.name));
    const index = await pack.getIndex({ fields: ['img'] });
    return Object.entries(STANCES)
        .filter(([id, t]) => t <= tier(actor) && !known.has(id) && index.has(id))
        .map(([id, t]) => {
            const entry = index.get(id);
            return { id, tier: t, name: entry.name, img: entry.img };
        })
        .filter(e => !known.has(e.name))
        .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
}

async function learn(actor, id) {
    const pack = game.packs.get(STANCE_PACK);
    const doc = await pack?.getDocument(id);
    if (!doc) return;
    const data = game.items.fromCompendium(doc, { keepId: false });
    foundry.utils.setProperty(data, '_stats.compendiumSource', doc.uuid);
    await actor.createEmbeddedDocuments('Item', [data]);
}

export default {
    id: 'stances',
    setting: 'martialStances',
    icon: 'fa-solid fa-hand-fist',
    template: `modules/${MODULE_ID}/templates/stances.hbs`,

    applies: actor => !!findFeature(actor, 'stanceFighter') || knownStances(actor).length > 0,

    async prepare(actor, state) {
        const focus = resource(actor, 'focus');
        const flow = !!findFeature(actor, 'flowState');
        const activeEffects = activeStanceEffects(actor);
        const activeIds = new Set(activeEffects.map(e => stanceItemFor(actor, e)?.id).filter(Boolean));
        const trait = favoredTrait(actor);
        const known = knownStances(actor).map(item => ({
            id: item.id,
            name: item.name,
            img: item.img,
            tier: stanceTier(item),
            active: activeIds.has(item.id),
            favored: isFavored(item),
            tooltip: plainText(item.system.description, 400)
        }));
        const limit = knownStanceLimit(level(actor));
        return {
            focus: focus ? { ...focus, pips: pips(focus.value, focus.max || 6) } : null,
            flow,
            known,
            active: known.find(k => k.active) ?? null,
            stacked: activeEffects.length > 1,
            count: known.length,
            limit,
            overLimit: known.length > limit,
            learning: state.learning ? await learnable(actor) : null,
            canLearn: known.length < limit,
            traits: TRAITS.map(t => ({
                key: t,
                label: game.i18n.localize(CONFIG.DH?.ACTOR?.abilities?.[t]?.label ?? t),
                selected: t === trait
            })),
            hasFavored: known.some(k => k.favored)
        };
    },

    actions: {
        async shift({ actor, target }) {
            const item = actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
            if (item) await shift(actor, item, target.dataset.cost === 'stress' ? 'stress' : 'focus');
        },
        async drop({ actor }) {
            if (await dropStances(actor)) await chat(actor, `<p>${L('Stances.DropChat', { actor: actor.name })}</p>`);
        },
        async focus({ actor, target }) {
            const focus = resource(actor, 'focus');
            if (!focus) return;
            const clicked = Number(target.dataset.value);
            const value = clicked === focus.value ? clicked - 1 : clicked;
            await actor.update({ 'system.resources.focus.value': Math.max(0, value) });
        },
        refocus: ({ actor }) => refocus(actor),
        open({ actor, target }) {
            actor.items.get(target.closest('[data-item-id]')?.dataset.itemId)?.sheet.render({ force: true });
        },
        toggleLearn({ state, drawer }) {
            state.learning = !state.learning;
            drawer.refresh();
        },
        async learn({ actor, target, state }) {
            await learn(actor, target.dataset.stanceId);
            state.learning = false;
        },
        async forget({ actor, target }) {
            const item = actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
            if (!item) return;
            const ok = await foundry.applications.api.DialogV2.confirm({
                window: { title: L('Stances.Forget') },
                content: `<p>${L('Stances.ForgetConfirm', { stance: item.name })}</p>`
            });
            if (!ok) return;
            const effects = activeStanceEffects(actor).filter(e => stanceItemFor(actor, e)?.id === item.id);
            if (effects.length) await actor.deleteEmbeddedDocuments('ActiveEffect', effects.map(e => e.id));
            await item.delete();
        },
        async favoredTrait({ actor, target }) {
            const trait = target.value;
            if (!TRAITS.includes(trait)) return;
            await actor.setFlag(MODULE_ID, 'favoredTrait', trait);
            // Already in Favored: retarget the running effect too.
            for (const effect of activeStanceEffects(actor)) {
                const item = stanceItemFor(actor, effect);
                if (!item || !isFavored(item) || !effect.system?.changes) continue;
                await effect.update({ 'system.changes': favoredChanges(effect.system.changes.map(c => ({ ...c })), trait) });
            }
        }
    }
};

/* ---------- rules enforced outside the drawer ---------- */

/**
 * One active stance: shifting through the stance feature's own "Enter Stance" action drops the previous one.
 * Runs on the client that created the effect.
 */
Hooks.on('createActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id) return;
    const actor = effect.parent;
    if (actor?.documentName !== 'Actor' || actor.type !== 'character') return;
    if (!activeStanceEffects(actor).some(e => e.id === effect.id)) return;
    if (enabled('oneStance')) await dropStances(actor, effect.id);

    // Favored entered through its own action still uses the trait picked in the drawer.
    const item = stanceItemFor(actor, effect);
    const trait = favoredTrait(actor);
    if (enabled('martialStances') && item && isFavored(item) && effect.system?.changes && trait !== 'instinct') {
        await effect.update({ 'system.changes': favoredChanges(effect.system.changes.map(c => ({ ...c })), trait) });
    }
});

/** Remember Hit Points before an update, so updateActor can tell how many were marked at once. */
Hooks.on('preUpdateActor', (actor, changes, options) => {
    const hp = foundry.utils.getProperty(changes, 'system.resources.hitPoints.value');
    if (hp === undefined || actor.type !== 'character') return;
    options[MODULE_ID] ??= {};
    options[MODULE_ID].hpBefore = actor.system.resources.hitPoints.value;
});

/** Drop out of the stance on Severe damage (3+ Hit Points at once) or on marking the last Hit Point. */
Hooks.on('updateActor', async (actor, changes, options, userId) => {
    if (userId !== game.user.id || !enabled('martialStances') || !enabled('stanceDropOut')) return;
    const before = options[MODULE_ID]?.hpBefore;
    if (before === undefined) return;
    const hp = actor.system.resources.hitPoints;
    if (!dropsStance(before, hp.value, hp.max)) return;
    if (await dropStances(actor)) {
        await chat(actor, `<p>${L('Stances.DropDamageChat', { actor: actor.name })}</p>`);
    }
});
