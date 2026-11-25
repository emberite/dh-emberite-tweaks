import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';
import { cardHtml, subclassStageCard } from '../wizard/art.mjs';

/**
 * Chat messages for domain cards, subclasses, ancestries and communities (the system's "ability use" message)
 * show the item as its real card, the same one the system's tooltips show. The message's action buttons stay
 * below it. Messages whose item no longer exists keep the system's look.
 */

const CARD_TYPES = new Set(['domainCard', 'subclass', 'ancestry', 'community']);

async function cardify(message, html) {
    if (!game.settings.get(MODULE_ID, 'chatCards') || message.type !== 'abilityUse') return;
    const root = html.querySelector('.daggerheart.chat.domain-card');
    const origin = message.system?.origin;
    if (!root || !origin || root.querySelector('.dhet-chat-card')) return;
    const item = await fromUuid(origin).catch(() => null);
    if (!item || !CARD_TYPES.has(item.type)) return;
    const card = await cardHtml(item);
    if (!card) return;
    const box = document.createElement('div');
    box.className = 'dhet-chat-card';
    box.innerHTML = card;
    root.querySelector('.card-img')?.remove();
    const details = root.querySelector('.domain-card-move');
    if (details) details.replaceWith(box);
    else root.prepend(box);
    root.classList.add('dhet-carded');
}

/** Post a subclass at a given stage (2 specialization, 3 mastery) as its card. */
async function postStageCard(item, stage) {
    const card = await subclassStageCard(item, stage);
    if (!card) return item.toChat(item.uuid);
    return ChatMessage.implementation.create({
        speaker: ChatMessage.implementation.getSpeaker({ actor: item.actor }),
        content: `<div class="daggerheart chat domain-card dhet-carded"><div class="dhet-chat-card">${card}</div></div>`,
        flags: { daggerheart: { cssClass: 'dh-chat-message dh-style' }, [MODULE_ID]: { stageCard: { uuid: item.uuid, stage } } }
    });
}

/** Ask which stage of a subclass to post (only the stages the character has reached). */
async function chooseStage(item) {
    const reached = Math.max(1, Math.min(3, item.system.featureState ?? 1));
    if (reached < 2) return 1;
    const labels = CONFIG.DH.ACTOR.subclassFeatureLabels ?? {};
    const buttons = [1, 2, 3]
        .filter(n => n <= reached)
        .map(n => ({ action: String(n), label: game.i18n.localize(labels[n] ?? String(n)), default: n === reached }));
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: item.name, icon: 'fa-solid fa-comment' },
        content: `<p>${L('Chat.WhichStage', { subclass: item.name })}</p>`,
        buttons,
        rejectClose: false
    });
    return choice ? Number(choice) : null;
}

/**
 * Right-click the subclass, ancestry or community name in the sheet header to post its card. A subclass that
 * has reached specialization or mastery asks which one.
 */
async function onHeaderContext(event) {
    if (!game.settings.get(MODULE_ID, 'headerToChat')) return;
    const span = event.target.closest('[data-action="editDoc"][data-item-uuid]');
    if (!span || !span.closest('.sheet-header, header, [data-application-part="header"]')) return;
    const item = await fromUuid(span.dataset.itemUuid);
    if (!item || !['subclass', 'ancestry', 'community'].includes(item.type)) return;
    if (item.type !== 'subclass') return item.toChat(item.uuid);
    const stage = await chooseStage(item);
    if (!stage) return;
    if (stage === 1) return item.toChat(item.uuid);
    return postStageCard(item, stage);
}

/* -------------------------------------------- */
/*  Critical roll effects                       */
/* -------------------------------------------- */

/** The effects a critical roll's chat card can get, see styles/chat.css. */
export const CRIT_EFFECTS = ['shine', 'embers', 'sparkles', 'glow'];

export function critEffectChoices() {
    return {
        none: L('CritEffect.None'),
        ...Object.fromEntries(CRIT_EFFECTS.map(e => [e, L(`CritEffect.${e[0].toUpperCase()}${e.slice(1)}`)]))
    };
}

/** A small random generator seeded from the message id, so a card's embers stay put when chat re-renders. */
function seeded(id) {
    let h = 2166136261;
    for (const c of id ?? '') h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

/** The particles for embers (rising sparks, as on the emberite website) and sparkles (twinkling stars). */
function particles(effect, id) {
    const rand = seeded(id);
    const fx = document.createElement('div');
    fx.className = 'dhet-crit-fx';
    fx.setAttribute('aria-hidden', 'true');
    const count = effect === 'embers' ? 14 : 12;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('i');
        const style =
            effect === 'embers'
                ? {
                      '--x': `${((i + rand()) / count) * 100}%`,
                      '--dx': `${Math.round(10 + rand() * 30) * (rand() < 0.3 ? -1 : 1)}px`,
                      '--s': `${2 + Math.floor(rand() * 3)}px`,
                      '--d': `${(4 + rand() * 5).toFixed(1)}s`,
                      '--delay': `${(-rand() * 9).toFixed(1)}s`
                  }
                : {
                      '--x': `${(4 + rand() * 92).toFixed(1)}%`,
                      '--y': `${(6 + rand() * 88).toFixed(1)}%`,
                      '--s': `${8 + Math.floor(rand() * 7)}px`,
                      '--d': `${(3 + rand() * 3).toFixed(1)}s`,
                      '--delay': `${(-rand() * 6).toFixed(1)}s`
                  };
        for (const [k, v] of Object.entries(style)) p.style.setProperty(k, v);
        fx.append(p);
    }
    return fx;
}

/**
 * Critical rolls (a duality roll's matching dice, an adversary's natural 20, critical damage) get the chosen
 * effect on their chat card, see styles/chat.css. Only when the roll is visible to this user.
 */
function markCritical(message, html) {
    const effect = game.settings.get(MODULE_ID, 'critEffect');
    const crit =
        CRIT_EFFECTS.includes(effect) &&
        message.isContentVisible &&
        (html.classList.contains('critical') || message.rolls.some(r => r?.isCritical));
    html.classList.remove('dhet-crit', ...CRIT_EFFECTS.map(e => `dhet-crit-${e}`));
    html.querySelector(':scope > .dhet-crit-fx')?.remove();
    if (!crit) return;
    html.classList.add('dhet-crit', `dhet-crit-${effect}`);
    if (effect === 'embers' || effect === 'sparkles') html.append(particles(effect, message.id));
}

export function registerChatCards() {
    Hooks.on('renderChatMessageHTML', (message, html) => {
        markCritical(message, html);
        cardify(message, html).catch(err => console.warn(`${MODULE_ID} | chat card failed`, err));
    });
    Hooks.on('renderCharacterSheet', app => {
        const el = app.element;
        if (!el || el.dataset.dhetHeaderChat) return;
        el.dataset.dhetHeaderChat = 'true';
        el.addEventListener('contextmenu', event => {
            const span = event.target.closest('[data-action="editDoc"][data-item-uuid]');
            if (!span || !game.settings.get(MODULE_ID, 'headerToChat')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onHeaderContext(event).catch(err => console.warn(`${MODULE_ID} | header card failed`, err));
        }, true); // capture: the sheet's own context menus would stop the event before it bubbles up here
    });
}

/** Re-render chat after the setting changes. */
export function rerenderChat() {
    ui.chat?.render?.();
}
