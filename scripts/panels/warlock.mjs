import { FURY_EFFECT, MODULE_ID, patronDieFaces, pips } from '../rules.mjs';
import {
    L,
    chat,
    clearOwnEffect,
    enabled,
    findFeature,
    hitPointsMarked,
    level,
    ownEffects,
    pay,
    resource,
    setOwnEffect,
    sourceEffect,
    spellcast,
    tier
} from '../actor.mjs';

/**
 * Warlock: Favor track, Patron Die sized by level, calling on the patron for the next action roll, the
 * Tribute downtime move, and Patron's Fury with its dice actually added to damage.
 */

const AID = 'patronAid';
const FURY = 'patronsFury';

const patron = actor => actor.getFlag(MODULE_ID, 'patron') ?? {};

export default {
    id: 'warlock',
    setting: 'favor',
    icon: 'fa-solid fa-spaghetti-monster-flying',
    template: `modules/${MODULE_ID}/templates/warlock.hbs`,

    applies: actor => !!findFeature(actor, 'favor') || !!findFeature(actor, 'patronsPact'),

    prepare(actor) {
        const favor = resource(actor, 'favor');
        const faces = patronDieFaces(level(actor));
        const fury = findFeature(actor, 'patronsFury');
        const { name = '', sphere = '' } = patron(actor);
        return {
            favor: favor ? { ...favor, pips: pips(favor.value, favor.max || 6) } : null,
            die: `d${faces}`,
            patronName: name,
            patronSphere: sphere,
            aidActive: ownEffects(actor, AID).length > 0,
            tribute: Math.max(0, spellcast(actor)),
            fury: fury
                ? { active: ownEffects(actor, FURY).length > 0, dice: `${tier(actor)}d${faces}` }
                : null
        };
    },

    actions: {
        async favor({ actor, target }) {
            const favor = resource(actor, 'favor');
            if (!favor) return;
            const clicked = Number(target.dataset.value);
            await actor.update({ 'system.resources.favor.value': Math.max(0, clicked === favor.value ? clicked - 1 : clicked) });
        },
        async patron({ actor, target }) {
            const field = target.dataset.field;
            if (!['name', 'sphere'].includes(field)) return;
            await actor.setFlag(MODULE_ID, 'patron', { ...patron(actor), [field]: target.value.trim() });
        },
        /** Spend a Favor: the Patron Die joins the next action roll (removed once that roll is made). */
        async aid({ actor }) {
            if (ownEffects(actor, AID).length) return clearOwnEffect(actor, AID);
            if (!(await pay(actor, 'favor', 1))) return;
            const die = `1d${patronDieFaces(level(actor))}`;
            const { name } = patron(actor);
            await setOwnEffect(actor, AID, {
                name: L('Warlock.AidEffect'),
                img: 'icons/magic/symbols/runes-star-pentagon-orange.webp',
                changes: [{ key: 'system.bonuses.roll.dice', type: 'add', value: die }]
            });
            await chat(actor, `<p>${L('Warlock.AidChat', { actor: actor.name, patron: name || L('Warlock.ThePatron'), die })}</p>`);
        },
        async tribute({ actor }) {
            const amount = Math.max(0, spellcast(actor));
            if (!amount) return ui.notifications.warn(L('Warlock.NoTribute'));
            await actor.modifyResource([{ key: 'favor', value: amount }]);
            await chat(actor, `<p>${L('Warlock.TributeChat', { actor: actor.name, amount })}</p>`);
        },
        async fury({ actor }) {
            if (ownEffects(actor, FURY).length) {
                await clearOwnEffect(actor, FURY);
                return;
            }
            if (!(await pay(actor, 'favor', 1))) return;
            await startFury(actor);
        }
    }
};

async function startFury(actor) {
    const item = findFeature(actor, 'patronsFury');
    const source = sourceEffect(item, FURY_EFFECT);
    const dice = `${tier(actor)}d${patronDieFaces(level(actor))}`;
    await setOwnEffect(actor, FURY, {
        name: item?.name ?? L('Warlock.Fury'),
        img: source?.img ?? item?.img,
        origin: source?.uuid,
        changes: [{ key: 'system.bonuses.damage.dice', type: 'add', value: dice }],
        duration: 'scene'
    });
    await chat(actor, `<p>${L('Warlock.FuryChat', { actor: actor.name, dice })}</p>`);
}

/** The Patron Die was for one roll: remove it once that duality roll is made. */
Hooks.on('daggerheart.postRollDuality', config => {
    if (!enabled('favor')) return;
    const actor = config.actor ?? (config.source?.actor ? fromUuidSync(config.source.actor) : null);
    if (!actor?.isOwner) return;
    const ids = ownEffects(actor, AID).map(e => e.id);
    if (ids.length) actor.deleteEmbeddedDocuments('ActiveEffect', ids);
});

/** Patron's Fury lasts "until you deal Severe damage or the scene ends". */
Hooks.on('daggerheart.postTakeDamage', async (target, updates, action) => {
    if (!enabled('favor') || hitPointsMarked(updates) < 3) return;
    const attacker = action?.actor;
    if (!attacker?.isOwner || !ownEffects(attacker, FURY).length) return;
    await clearOwnEffect(attacker, FURY);
    await chat(attacker, `<p>${L('Warlock.FuryEndChat', { actor: attacker.name })}</p>`);
});

/**
 * The system's own "Spend Favor" action on Patron's Fury applies an effect with no changes; swap it for one that
 * adds the Patron Dice to damage.
 */
Hooks.on('createActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id || !enabled('favor') || effect.getFlag(MODULE_ID, 'kind')) return;
    const actor = effect.parent;
    if (actor?.documentName !== 'Actor') return;
    const item = findFeature(actor, 'patronsFury');
    const source = sourceEffect(item, FURY_EFFECT);
    if (!source || effect.origin !== source.uuid) return;
    await effect.delete();
    await startFury(actor);
});
