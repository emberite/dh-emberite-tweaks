import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';

/**
 * Minimal countdowns: while the world has no countdowns, the GM's countdown panel shrinks to a small "+" that
 * widens to "Add Countdown" on hover and opens the system's countdown editor. Players already don't see the
 * panel when there's nothing to show.
 */

function shrink(app, element) {
    const root = element ?? app.element;
    if (!root) return;
    const countdowns = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Countdowns)?.countdowns ?? {};
    const minimal = game.user.isGM && game.settings.get(MODULE_ID, 'minimalCountdowns') && !Object.keys(countdowns).length;
    root.classList.toggle('dhet-countdowns-minimal', minimal);
    root.querySelector('.dhet-add-countdown')?.remove();
    if (!minimal) return;

    const header = root.querySelector('header.countdowns-header');
    if (!header) return;
    const label = L('Countdown.Add');
    const add = document.createElement('a');
    add.className = 'dhet-add-countdown';
    add.setAttribute('aria-label', label);
    add.innerHTML = `<i class="fa-solid fa-plus" inert></i><span>${label}</span>`;
    add.addEventListener('click', event => {
        event.preventDefault();
        new game.system.api.applications.ui.CountdownEdit().render({ force: true });
    });
    header.append(add);
}

export function rerenderCountdowns() {
    if (ui.countdowns?.rendered) ui.countdowns.render();
}

export function registerCountdowns() {
    Hooks.on('renderDhCountdowns', shrink);
}
