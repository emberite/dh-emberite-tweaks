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

export function registerChatCards() {
    Hooks.on('renderChatMessageHTML', (message, html) => {
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
