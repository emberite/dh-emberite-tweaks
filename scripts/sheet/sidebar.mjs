import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';

/**
 * Character sheet sidebar layout (its own toggle): Hit Points, Stress and Armor Slots as full-width rows with a
 * heart, bolt and shield instead of text labels; the current/max numbers optional; Evasion and Proficiency as
 * shield badges on the portrait. A second toggle shows the domain card loadout as a list of rows in the Core
 * Rulebook look instead of a strip of card tiles.
 *
 * The sheet re-renders its sidebar part from the system's template, so this re-arranges the fresh DOM after
 * every render; inputs and actions keep their listeners because elements are moved, not copied.
 */

const ICONS = { hp: 'fa-solid fa-heart', stress: 'fa-solid fa-bolt', armor: 'fa-solid fa-shield' };

function restyle(app) {
    const aside = app.element?.querySelector('.character-sidebar-sheet');
    if (!aside) return;
    const layout = game.settings.get(MODULE_ID, 'sheetSidebar');
    aside.classList.toggle('dhet-sidebar', layout);
    aside.classList.toggle('dhet-sidebar-numbers', layout && game.settings.get(MODULE_ID, 'sheetSidebarNumbers'));
    aside.classList.toggle('dhet-loadout-rows', game.settings.get(MODULE_ID, 'loadoutRows'));
    // Loadout rows draw the card art as a band behind the name (the system pins the image itself to a thumbnail).
    for (const li of aside.querySelectorAll('.loadout-section li.inventory-item')) {
        const src = li.querySelector('.img-portrait img.item-img, .img-portrait img')?.getAttribute('src');
        // Absolute: a url() inside a custom property resolves against the stylesheet that uses it.
        if (src) li.style.setProperty('--dhet-card-art', `url("${new URL(src, document.baseURI).href.replace(/"/g, '%22')}")`);
    }
    if (!layout || aside.dataset.dhetDone) return;
    aside.dataset.dhetDone = 'true';

    const resources = aside.querySelector('.resources-section');
    const status = aside.querySelector('.status-section');
    if (!resources || !status) return;

    // Armor joins Hit Points and Stress as a full-width row.
    const armor = status.querySelector('.armor-slots');
    const rows = [...resources.children];
    if (armor) {
        resources.append(armor);
        rows.push(armor);
    }
    ['hp', 'stress', 'armor'].forEach((key, i) => {
        const row = rows[i];
        if (!row) return;
        row.classList.add('dhet-res', `dhet-res-${key}`);
        const icon = document.createElement('i');
        icon.className = `dhet-res-icon ${ICONS[key]}`;
        icon.dataset.tooltip = L(`Sheet.${key}`);
        row.prepend(icon);
    });

    // Evasion and Proficiency become badges on the portrait (first and last number in the status row).
    const numbers = [...status.querySelectorAll('.status-number')].filter(n => !n.classList.contains('armor-slots'));
    const portrait = aside.querySelector('.portrait');
    if (portrait && numbers.length >= 2) {
        const value = n => n.querySelector('.status-value')?.textContent.trim() ?? '';
        const badges = document.createElement('div');
        badges.className = 'dhet-badges';
        badges.innerHTML = [
            ['evasion', value(numbers[0]), L('Sheet.evasion')],
            ['proficiency', value(numbers[numbers.length - 1]), L('Sheet.proficiency')]
        ]
            .map(([key, v, label]) => `<div class="dhet-badge dhet-badge-${key}" data-tooltip="${label}"><span class="dhet-badge-shield"><strong>${v}</strong></span><small>${label}</small></div>`)
            .join('');
        portrait.append(badges);
        status.classList.add('dhet-moved');
    }
}

/** Re-render open character sheets after a setting change. */
export function rerenderSheets() {
    const Character = game.system.api?.applications?.sheets?.actors?.Character;
    for (const app of foundry.applications.instances.values()) {
        if (Character && app instanceof Character && app.rendered) app.render();
    }
}

export function registerSidebar() {
    Hooks.on('renderCharacterSheet', app => {
        try {
            restyle(app);
        } catch (err) {
            console.error(`${MODULE_ID} | sidebar layout failed`, err);
        }
    });
}
