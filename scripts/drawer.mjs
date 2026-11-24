import { MODULE_ID } from './rules.mjs';
import { L, enabled } from './actor.mjs';
import stances from './panels/stances.mjs';
import warlock from './panels/warlock.mjs';
import { hexPanel, lunarPanel } from './panels/witch.mjs';
import { markPanel, poisonPanel } from './panels/assassin.mjs';
import { patternsPanel, unstoppablePanel } from './panels/core.mjs';

/**
 * The class-features drawer: a folder tab on the edge of the character sheet that pulls out a panel for each
 * automated feature the character has.
 *
 * It lives next to the sheet's window element instead of inside it. The sheet's root clips overflow (and the
 * Daggerheart Core Rulebook theme scrolls it horizontally), so anything hanging off its edge would be cut off.
 * The drawer follows the window by watching its style attribute, which Foundry rewrites on every move, resize,
 * minimise and bring-to-front.
 */

export const PANELS = [stances, lunarPanel, hexPanel, warlock, markPanel, poisonPanel, patternsPanel, unstoppablePanel];
const BY_ID = Object.fromEntries(PANELS.map(p => [p.id, p]));

const PANEL_WIDTH = 300;
const HANDLE_WIDTH = 30;
const INSET = 36;

/** Sheet theme colours the drawer borrows, so it matches whichever sheet theme is in use. */
const THEME_VARS = [
    '--dh-c-white',
    '--dh-c-black',
    '--dh-c-accent',
    '--dh-c-deep-accent',
    '--dh-c-bright-accent',
    '--dh-c-secondary',
    '--dh-c-sections-background',
    '--dh-c-resources-label-color',
    '--dh-c-font-title',
    '--dh-c-font-body'
];

const drawers = new Map();

class Drawer {
    constructor(app) {
        this.app = app;
        /** UI state per panel (e.g. the stance picker being open), kept for the life of the sheet. */
        this.state = {};
        this.open = game.settings.get(MODULE_ID, 'drawerOpen');

        const el = document.createElement('aside');
        el.className = 'dhet-drawer';
        el.dataset.appId = app.id;
        el.innerHTML = `
            <div class="dhet-panel">
                <header class="dhet-head">
                    <span class="dhet-head-title"></span>
                </header>
                <div class="dhet-body"></div>
            </div>
            <button type="button" class="dhet-handle" data-dhet-action="toggle">
                <i class="dhet-handle-icon fa-solid fa-book-open"></i>
                <span class="dhet-handle-label">${L('Drawer.Tab')}</span>
            </button>`;
        this.element = el;
        this.body = el.querySelector('.dhet-body');

        el.addEventListener('click', ev => this.#onClick(ev));
        el.addEventListener('change', ev => this.#onChange(ev));
        el.addEventListener('pointerdown', () => this.app.bringToFront?.());

        this.observed = app.element;
        this.observer = new MutationObserver(() => this.sync());
        this.observer.observe(app.element, { attributes: true, attributeFilter: ['style', 'class'] });
        this.onResize = () => this.sync();
        window.addEventListener('resize', this.onResize);

        app.element.after(el);
        this.refresh = foundry.utils.debounce(() => this.#render(), 40);
    }

    get actor() {
        return this.app.document;
    }

    /** Dock to the sheet's right edge, or its left when the screen has no room on the right. */
    sync() {
        const app = this.app;
        const el = this.element;
        if (!app.element?.isConnected) return destroyDrawer(app);
        el.classList.toggle('dhet-open', this.open);
        el.classList.toggle('dhet-minimized', !!app.minimized);
        if (el.hidden || app.minimized) return;

        const rect = app.element.getBoundingClientRect();
        const needed = PANEL_WIDTH + HANDLE_WIDTH;
        const roomRight = window.innerWidth - rect.right;
        const left = roomRight < needed && rect.left > roomRight;
        el.classList.toggle('dhet-left', left);
        el.style.top = `${rect.top + INSET}px`;
        el.style.height = `${Math.max(220, rect.height - INSET * 2)}px`;
        if (left) {
            el.style.left = 'auto';
            el.style.right = `${window.innerWidth - rect.left - 1}px`;
        } else {
            el.style.right = 'auto';
            el.style.left = `${rect.right - 1}px`;
        }
        el.style.zIndex = getComputedStyle(app.element).zIndex;
    }

    /** Copy the sheet's theme so the drawer matches it, including themes added by other modules. */
    #theme() {
        const style = getComputedStyle(this.app.element);
        for (const name of THEME_VARS) {
            const value = style.getPropertyValue(name).trim();
            if (value) this.element.style.setProperty(name, value);
            else this.element.style.removeProperty(name);
        }
        const classes = this.app.element.classList;
        this.element.classList.toggle('dhet-themed', classes.contains('dh-c-style'));
        this.element.classList.toggle('theme-light', classes.contains('theme-light'));
        this.element.classList.toggle('theme-dark', !classes.contains('theme-light'));
    }

    async #render() {
        const actor = this.actor;
        if (!this.app.rendered || !actor) return;
        const active =
            game.settings.get(MODULE_ID, 'showDrawer') && actor.isOwner && actor.type === 'character'
                ? PANELS.filter(p => enabled(p.setting) && safeApplies(p, actor))
                : [];
        this.element.hidden = active.length === 0;
        if (!active.length) return;

        this.#theme();
        const sections = await Promise.all(active.map(p => this.#section(p, actor)));
        const scroll = this.body.scrollTop;
        this.body.innerHTML = sections.join('');
        this.body.scrollTop = scroll;

        const handle = this.element.querySelector('.dhet-handle-icon');
        handle.className = `dhet-handle-icon ${active.length === 1 ? active[0].icon : 'fa-solid fa-book-open'}`;
        this.element.querySelector('.dhet-head-title').textContent = L('Drawer.Title', { actor: actor.name });
        this.sync();
    }

    async #section(panel, actor) {
        try {
            const state = (this.state[panel.id] ??= {});
            const context = await panel.prepare(actor, state);
            const html = await foundry.applications.handlebars.renderTemplate(panel.template, { ...context, state });
            return `<section class="dhet-section dhet-${panel.id}" data-panel="${panel.id}">
                <h3 class="dhet-section-title"><i class="${panel.icon}"></i> ${L(`Panel.${panel.id}`)}</h3>
                ${html}
            </section>`;
        } catch (err) {
            console.error(`${MODULE_ID} | panel ${panel.id} failed for ${actor.name}`, err);
            return '';
        }
    }

    async #run(target, event) {
        const action = target.dataset.dhetAction;
        const panel = BY_ID[target.closest('[data-panel]')?.dataset.panel];
        const fn = panel?.actions?.[action];
        if (!fn) return;
        const busy = target.tagName === 'BUTTON';
        if (busy) target.disabled = true;
        try {
            await fn.call(panel, { actor: this.actor, target, event, state: (this.state[panel.id] ??= {}), drawer: this });
        } catch (err) {
            console.error(`${MODULE_ID} | ${panel.id}.${action} failed`, err);
            ui.notifications.error(L('Notify.ActionFailed'));
        } finally {
            if (busy && target.isConnected) target.disabled = false;
            this.refresh();
        }
    }

    #onClick(event) {
        const target = event.target.closest('[data-dhet-action]');
        if (!target || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
        event.preventDefault();
        if (target.dataset.dhetAction === 'toggle') return this.toggle();
        this.#run(target, event);
    }

    #onChange(event) {
        const target = event.target.closest('[data-dhet-action]');
        if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) this.#run(target, event);
    }

    toggle(force) {
        this.open = force ?? !this.open;
        game.settings.set(MODULE_ID, 'drawerOpen', this.open);
        this.sync();
    }

    destroy() {
        this.observer.disconnect();
        window.removeEventListener('resize', this.onResize);
        this.element.remove();
    }
}

function safeApplies(panel, actor) {
    try {
        return panel.applies(actor);
    } catch (err) {
        console.error(`${MODULE_ID} | panel ${panel.id} check failed`, err);
        return false;
    }
}

function drawerFor(app) {
    let drawer = drawers.get(app.id);
    if (drawer && drawer.element.isConnected && drawer.app === app && drawer.observed === app.element) return drawer;
    drawer?.destroy();
    drawer = new Drawer(app);
    drawers.set(app.id, drawer);
    return drawer;
}

function destroyDrawer(app) {
    drawers.get(app.id)?.destroy();
    drawers.delete(app.id);
}

/** Re-render every open drawer (setting changes, effects placed on other creatures, scene changes). */
export const refreshDrawers = foundry.utils.debounce(() => {
    for (const drawer of drawers.values()) drawer.refresh();
}, 60);

export function registerDrawer() {
    Hooks.on('renderCharacterSheet', app => {
        if (!app.document || app.document.type !== 'character') return;
        drawerFor(app).refresh();
    });
    Hooks.on('closeCharacterSheet', app => destroyDrawer(app));

    // Hex and mark lists show effects on other creatures, which don't re-render this sheet.
    for (const hook of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect', 'createToken', 'deleteToken', 'canvasReady']) {
        Hooks.on(hook, () => drawers.size && refreshDrawers());
    }
}

/** For the API: open or close the drawer on an actor's open sheet. */
export function toggleDrawer(actor, force) {
    for (const drawer of drawers.values()) if (drawer.actor === actor) drawer.toggle(force);
}
