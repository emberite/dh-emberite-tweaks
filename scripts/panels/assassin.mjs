import { MARK_EFFECT, MODULE_ID, POISONS, markDieFaces } from '../rules.mjs';
import {
    L,
    chat,
    clearOwnEffect,
    deleteEffects,
    enabled,
    findFeature,
    ownEffects,
    pay,
    placedEffects,
    rollResults,
    rollToChat,
    setOwnEffect,
    sourceEffect,
    tier
} from '../actor.mjs';

/* ---------- Marked for Death ---------- */

const BONUS = 'markBonus';

const markDice = actor =>
    `${tier(actor)}d${markDieFaces({ ambush: !!findFeature(actor, 'ambush'), backstab: !!findFeature(actor, 'backstab') })}`;

const marks = actor => {
    const item = findFeature(actor, 'markedForDeath');
    return placedEffects(item, sourceEffect(item, MARK_EFFECT));
};

export const markPanel = {
    id: 'mark',
    setting: 'markedForDeath',
    icon: 'fa-solid fa-crosshairs',
    template: `modules/${MODULE_ID}/templates/mark.hbs`,

    applies: actor => !!findFeature(actor, 'markedForDeath'),

    prepare(actor) {
        const marked = marks(actor).map(({ token, effect }) => ({
            uuid: effect.uuid,
            tokenUuid: token.uuid,
            name: token.name,
            img: token.texture?.src ?? token.actor?.img
        }));
        return {
            marked,
            dice: markDice(actor),
            bonusActive: ownEffects(actor, BONUS).length > 0,
            hasScene: !!game.scenes?.viewed
        };
    },

    actions: {
        async mark({ actor, event }) {
            await findFeature(actor, 'markedForDeath')?.use(event);
        },
        async unmark({ target }) {
            const effect = await fromUuid(target.closest('[data-effect-uuid]')?.dataset.effectUuid);
            if (effect) await deleteEffects([effect]);
        },
        async ping({ target }) {
            const token = await fromUuid(target.closest('[data-token-uuid]')?.dataset.tokenUuid);
            if (token?.object && canvas.ready) canvas.ping(token.object.center);
        },
        /** "Striking my mark": the tier × d4/d6/d8 joins damage rolls while on. */
        async bonus({ actor }) {
            if (await clearOwnEffect(actor, BONUS)) return;
            const item = findFeature(actor, 'markedForDeath');
            await setOwnEffect(actor, BONUS, {
                name: L('Mark.BonusEffect'),
                img: item?.img,
                changes: [{ key: 'system.bonuses.damage.dice', type: 'add', value: markDice(actor) }]
            });
        }
    }
};

/** "You can have only one adversary Marked for Death at a time": a new mark clears the old one. */
Hooks.on('createActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id || !enabled('markedForDeath') || !enabled('oneMark') || !effect.origin) return;
    const source = fromUuidSync(effect.origin, { strict: false });
    const item = source?.parent;
    const assassin = item?.parent;
    if (assassin?.documentName !== 'Actor' || findFeature(assassin, 'markedForDeath')?.id !== item.id) return;
    if (source.id !== sourceEffect(item, MARK_EFFECT)?.id) return;
    const older = placedEffects(item, source)
        .map(p => p.effect)
        .filter(e => e.uuid !== effect.uuid);
    if (older.length) await deleteEffects(older);
});

/** Turn the mark bonus off once no creature on the scene carries the mark any more. */
Hooks.on('deleteActiveEffect', async (effect, options, userId) => {
    if (userId !== game.user.id || !enabled('markedForDeath') || !effect.origin) return;
    const source = fromUuidSync(effect.origin, { strict: false });
    const assassin = source?.parent?.parent;
    if (assassin?.documentName !== 'Actor' || !assassin.isOwner) return;
    if (!ownEffects(assassin, BONUS).length || marks(assassin).length) return;
    await clearOwnEffect(assassin, BONUS);
});

/* ---------- Toxic Concoctions ---------- */

/** Poisons this assassin knows, with the system action that applies each one (if the system has it). */
function knownPoisons(actor) {
    return POISONS.flatMap(p => {
        const feature = findFeature(actor, p.feature);
        if (!feature) return [];
        const action = p.action ? feature.system.actions?.find?.(a => a.name === p.action) : null;
        return [{ ...p, feature, action }];
    });
}

/** What clicking a poison does: the system applies it, the module rolls its die, or it's a chat reminder. */
const poisonKind = p => (p.action ? 'apply' : p.roll ? 'roll' : 'note');
const KIND_ICONS = { apply: 'fa-solid fa-crosshairs', roll: 'fa-solid fa-dice-d6', note: 'fa-solid fa-comment' };

/** Poison name, its rule, what a click does and the feature that teaches it. */
function poisonTooltip(poison) {
    const esc = foundry.utils.escapeHTML;
    const kind = poisonKind(poison);
    return `<div class="dhet-tip"><strong>${esc(L(`Poison.${poison.key}.Name`))}</strong><p>${esc(L(`Poison.${poison.key}.Text`))}</p><p class="dhet-tip-source"><i class="${KIND_ICONS[kind]}"></i> ${esc(L(`Poison.Kind.${kind}`, { die: poison.roll ?? '' }))} · ${esc(poison.feature.name)}</p></div>`;
}

const tokens = item => item.system.resource?.value ?? 0;

export const poisonPanel = {
    id: 'poison',
    setting: 'toxicConcoctions',
    icon: 'fa-solid fa-bottle-droplet',
    template: `modules/${MODULE_ID}/templates/poison.hbs`,

    applies: actor => !!findFeature(actor, 'toxicConcoctions'),

    prepare(actor) {
        const item = findFeature(actor, 'toxicConcoctions');
        const count = tokens(item);
        return {
            tokens: count,
            empty: count < 1,
            twinFang: !!findFeature(actor, 'twinFang'),
            poisons: knownPoisons(actor).map(p => ({
                key: p.key,
                name: L(`Poison.${p.key}.Name`),
                icon: KIND_ICONS[poisonKind(p)],
                tooltip: poisonTooltip(p)
            }))
        };
    },

    actions: {
        /** Mark a Stress to place 1d4+1 tokens. */
        async brew({ actor }) {
            const item = findFeature(actor, 'toxicConcoctions');
            if (!(await pay(actor, 'stress', 1))) return;
            const roll = await rollToChat(actor, '1d4+1', L('Poison.BrewFlavor'));
            await item.update({ 'system.resource.value': tokens(item) + roll.total });
        },
        async poison({ actor, target, event }) {
            const item = findFeature(actor, 'toxicConcoctions');
            if (tokens(item) < 1) return ui.notifications.warn(L('Poison.NoTokens'));
            const poison = knownPoisons(actor).find(p => p.key === target.dataset.poison);
            if (!poison) return;
            if (poison.action) {
                // Let the system apply it to the user's targets; only spend the token if the action went through.
                const done = await poison.action.use(event);
                if (!done) return;
            } else {
                const name = L(`Poison.${poison.key}.Name`);
                let extra = '';
                if (poison.roll) {
                    const roll = await rollToChat(actor, poison.roll, name);
                    extra = ` (${rollResults(roll).join(', ')})`;
                }
                await chat(actor, `<p>${L('Poison.UsedChat', { actor: actor.name, poison: name })}${extra}</p><p>${L(`Poison.${poison.key}.Text`)}</p>`);
            }
            await item.update({ 'system.resource.value': Math.max(0, tokens(item) - 1) });
        },
        async adjust({ actor, target }) {
            const item = findFeature(actor, 'toxicConcoctions');
            const delta = Number(target.dataset.delta) || 0;
            await item.update({ 'system.resource.value': Math.max(0, tokens(item) + delta) });
        }
    }
};
