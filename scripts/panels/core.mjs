import { MODULE_ID, UNSTOPPABLE_EFFECT, advanceUnstoppable, unstoppableFaces } from '../rules.mjs';
import { L, chat, enabled, findFeature, hitPointsMarked, level, sourceEffect } from '../actor.mjs';

/* ---------- Wizard: Strange Patterns ----------
 * The system already offers the Hope/Stress choice when the number comes up (a duality-roll trigger on the
 * feature). The sheet only lets you set the number by rerolling the d12, so the drawer lets you pick it. */

/** The chosen number lives in the feature's single d12 die slot. */
const patternNumber = item => Number(Object.values(item.system.resource?.diceStates ?? {})[0]?.value) || 0;

export const patternsPanel = {
    id: 'patterns',
    setting: 'strangePatterns',
    icon: 'fa-solid fa-hashtag',
    template: `modules/${MODULE_ID}/templates/patterns.hbs`,

    applies: actor => !!findFeature(actor, 'strangePatterns'),

    prepare(actor) {
        const item = findFeature(actor, 'strangePatterns');
        const number = patternNumber(item);
        return {
            number,
            numbers: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, selected: i + 1 === number }))
        };
    },

    actions: {
        async pattern({ actor, target }) {
            const item = findFeature(actor, 'strangePatterns');
            const value = Number(target.value);
            if (!(value >= 1 && value <= 12)) return;
            const key = Object.keys(item.system.resource?.diceStates ?? {})[0] ?? '0';
            await item.update({ [`system.resource.diceStates.${key}`]: { value, used: false } });
        }
    }
};

/* ---------- Guardian: Unstoppable ---------- */

const unstoppableEffects = actor => {
    const item = findFeature(actor, 'unstoppable');
    const source = sourceEffect(item, UNSTOPPABLE_EFFECT);
    return source ? actor.effects.filter(e => e.origin === source.uuid) : [];
};

export const unstoppablePanel = {
    id: 'unstoppable',
    setting: 'unstoppable',
    icon: 'fa-solid fa-shield-halved',
    template: `modules/${MODULE_ID}/templates/unstoppable.hbs`,

    applies: actor => !!findFeature(actor, 'unstoppable'),

    prepare(actor) {
        const item = findFeature(actor, 'unstoppable');
        const faces = unstoppableFaces(level(actor));
        const active = unstoppableEffects(actor).length > 0;
        const value = active ? item.system.resource?.value ?? 0 : 0;
        return {
            active,
            value,
            faces,
            faceList: Array.from({ length: faces }, (_, i) => ({ value: i + 1, reached: i + 1 <= value }))
        };
    },

    actions: {
        async become({ actor, event }) {
            await findFeature(actor, 'unstoppable')?.use(event);
        },
        async end({ actor }) {
            await endUnstoppable(actor);
        }
    }
};

async function endUnstoppable(actor) {
    const item = findFeature(actor, 'unstoppable');
    const ids = unstoppableEffects(actor).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    if (item?.system.resource) await item.update({ 'system.resource.value': 0 });
}

/** Becoming Unstoppable puts the die on 1, sized for the guardian's level. */
Hooks.on('createActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id || !enabled('unstoppable')) return;
    const actor = effect.parent;
    if (actor?.documentName !== 'Actor') return;
    const item = findFeature(actor, 'unstoppable');
    const source = sourceEffect(item, UNSTOPPABLE_EFFECT);
    if (!source || effect.origin !== source.uuid) return;
    await item.update({
        'system.resource.value': 1,
        'system.resource.dieFaces': `d${unstoppableFaces(level(actor))}`
    });
});

/** Last die raise per guardian, so one damage roll applied to several targets raises the die once. */
const lastRaise = new Map();
const SAME_ROLL_MS = 3000;

/** After a damage roll that deals Hit Points, the die goes up; past its maximum, Unstoppable ends. */
Hooks.on('daggerheart.postTakeDamage', async (target, updates, action) => {
    if (!enabled('unstoppable') || hitPointsMarked(updates) < 1) return;
    const guardian = action?.actor;
    if (!guardian?.isOwner || guardian.type !== 'character' || !unstoppableEffects(guardian).length) return;
    const previous = lastRaise.get(guardian.uuid);
    const now = Date.now();
    if (previous && previous.action === action.uuid && now - previous.at < SAME_ROLL_MS) return;
    lastRaise.set(guardian.uuid, { action: action.uuid, at: now });
    const item = findFeature(guardian, 'unstoppable');
    const { value, ended } = advanceUnstoppable(item.system.resource?.value ?? 0, unstoppableFaces(level(guardian)));
    if (ended) {
        await endUnstoppable(guardian);
        await chat(guardian, `<p>${L('Unstoppable.EndChat', { actor: guardian.name })}</p>`);
    } else {
        await item.update({ 'system.resource.value': value });
    }
});
