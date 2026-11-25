import { MODULE_ID } from '../rules.mjs';
import { cardHtml } from '../wizard/art.mjs';

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

export function registerChatCards() {
    Hooks.on('renderChatMessageHTML', (message, html) => {
        cardify(message, html).catch(err => console.warn(`${MODULE_ID} | chat card failed`, err));
    });
}

/** Re-render chat after the setting changes. */
export function rerenderChat() {
    ui.chat?.render?.();
}
