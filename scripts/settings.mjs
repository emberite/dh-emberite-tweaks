import { MODULE_ID } from './rules.mjs';
import { L } from './actor.mjs';
import { refreshDrawers } from './drawer.mjs';
import { rerenderSheets } from './sheet/sidebar.mjs';
import { rerenderChat } from './sheet/chatcards.mjs';
import { applyChatTheme, chatThemes } from './sheet/chattheme.mjs';
import { syncRangeLabels } from './sheet/rangelabels.mjs';
import { SYSTEM, colorChoices, iconChoices, rerenderFearTracker, shapeChoices, styleChoices, styleTracker } from './sheet/feartracker.mjs';

/**
 * Every option is a Boolean switch, kept out of Foundry's flat Configure Settings list and shown instead in one
 * "Emberite Tweaks" window with tabs. `parent` makes a setting depend on another (indented, disabled while the
 * parent is off). All are world settings except `showDrawer`, which each player sets for themselves.
 */
export const LAYOUT = [
    {
        id: 'wizards',
        icon: 'fa-solid fa-hat-wizard',
        groups: [{ id: 'wizards', settings: [{ key: 'creationWizard' }, { key: 'levelUpWizard' }] }]
    },
    {
        id: 'sheet',
        icon: 'fa-solid fa-id-card',
        groups: [
            {
                id: 'sidebar',
                settings: [
                    { key: 'sheetSidebar', refresh: rerenderSheets },
                    { key: 'sheetSidebarNumbers', parent: 'sheetSidebar', refresh: rerenderSheets },
                    { key: 'loadoutRows', refresh: rerenderSheets }
                ]
            },
            {
                id: 'chat',
                settings: [
                    {
                        key: 'chatTheme',
                        // A choice instead of a switch: off, or one of the Core Rulebook module's sheet themes.
                        choices: () => ({ none: L('ChatTheme.Off'), ...chatThemes() }),
                        default: 'none',
                        refresh: applyChatTheme
                    },
                    // Layers over the chosen theme (or Foundry's chat) and takes its tint from it.
                    { key: 'chatGlass', default: false, refresh: applyChatTheme },
                    { key: 'chatCards', refresh: rerenderChat },
                    { key: 'headerToChat', refresh: () => {} }
                ]
            }
        ]
    },
    {
        id: 'fear',
        icon: 'fa-solid fa-skull',
        groups: [
            {
                id: 'fear',
                // A sample row of tokens in the window that follows the choices below before they are saved.
                preview: 'fear',
                settings: [
                    { key: 'fearStyle', choices: styleChoices, default: SYSTEM, refresh: rerenderFearTracker },
                    { key: 'fearColor', choices: colorChoices, default: SYSTEM, refresh: rerenderFearTracker },
                    { key: 'fearIcon', choices: iconChoices, default: SYSTEM, refresh: rerenderFearTracker },
                    { key: 'fearShape', choices: shapeChoices, default: SYSTEM, refresh: rerenderFearTracker },
                    { key: 'fearMaxGlow', default: false, refresh: rerenderFearTracker }
                ]
            },
            { id: 'rangeBands', settings: [{ key: 'rangeLabels', refresh: syncRangeLabels }] }
        ]
    },
    {
        id: 'classes',
        icon: 'fa-solid fa-book-open',
        groups: [
            { id: 'drawer', settings: [{ key: 'showDrawer', client: true }] },
            {
                id: 'brawler',
                settings: [
                    { key: 'martialStances' },
                    { key: 'oneStance', parent: 'martialStances' },
                    { key: 'stanceDropOut', parent: 'martialStances' }
                ]
            },
            { id: 'warlock', settings: [{ key: 'favor' }] },
            { id: 'witch', settings: [{ key: 'lunarPhases' }, { key: 'hexes' }] },
            {
                id: 'assassin',
                settings: [{ key: 'markedForDeath' }, { key: 'oneMark', parent: 'markedForDeath' }, { key: 'toxicConcoctions' }]
            },
            { id: 'guardian', settings: [{ key: 'unstoppable' }] },
            { id: 'wizard', settings: [{ key: 'strangePatterns' }] }
        ]
    }
];

const ALL = LAYOUT.flatMap(tab => tab.groups.flatMap(g => g.settings));
const settingKey = key => key.charAt(0).toUpperCase() + key.slice(1);

/** Choices as options; a nested object is an <optgroup> of them. */
function prepareChoices(choices, value) {
    return Object.entries(choices).map(([id, label]) =>
        typeof label === 'object'
            ? { group: id, options: prepareChoices(label, value) }
            : { id, label, selected: id === value }
    );
}

export function registerSettings() {
    for (const s of ALL) {
        game.settings.register(MODULE_ID, s.key, {
            name: `DHET.Settings.${settingKey(s.key)}.Name`,
            hint: `DHET.Settings.${settingKey(s.key)}.Hint`,
            scope: s.client ? 'client' : 'world',
            config: false,
            type: s.choices ? String : Boolean,
            default: s.default ?? true,
            onChange: s.refresh ?? refreshDrawers
        });
    }
    game.settings.register(MODULE_ID, 'drawerOpen', { scope: 'client', config: false, type: Boolean, default: true });

    game.settings.registerMenu(MODULE_ID, 'menu', {
        name: 'DHET.SettingsMenu.Name',
        label: 'DHET.SettingsMenu.Label',
        hint: 'DHET.SettingsMenu.Hint',
        icon: 'fa-solid fa-sliders',
        type: SettingsMenu,
        restricted: false
    });
}

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** The settings window: one tab per area, a switch per setting with its explanation. */
export class SettingsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'dhet-settings',
        tag: 'form',
        classes: ['dhet-settings'],
        window: { title: 'DHET.SettingsMenu.Title', icon: 'fa-solid fa-sliders', contentClasses: ['standard-form'] },
        position: { width: 620, height: 'auto' },
        form: { handler: SettingsMenu.#onSubmit, closeOnSubmit: true },
        actions: { reset: SettingsMenu.#onReset }
    };

    static PARTS = {
        tabs: { template: 'templates/generic/tab-navigation.hbs' },
        body: { template: `modules/${MODULE_ID}/templates/settings.hbs`, scrollable: [''] },
        footer: { template: 'templates/generic/form-footer.hbs' }
    };

    static TABS = {
        primary: {
            tabs: LAYOUT.map(t => ({ id: t.id, icon: t.icon, label: `DHET.SettingsMenu.Tab.${t.id}` })),
            initial: 'wizards'
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const gm = game.user.isGM;
        const value = key => game.settings.get(MODULE_ID, key);
        return {
            ...context,
            gm,
            tabs: this._prepareTabs('primary'),
            panes: LAYOUT.map(tab => ({
                id: tab.id,
                groups: tab.groups.map(g => ({
                    label: L(`SettingsMenu.Group.${g.id}`),
                    preview: g.preview ?? null,
                    // Sample tokens for the preview: six of eight Fear marked.
                    tokens: g.preview ? Array.from({ length: 8 }, (_, i) => ({ index: i, inactive: i >= 6 })) : null,
                    settings: g.settings.map(s => ({
                        key: s.key,
                        name: L(`Settings.${settingKey(s.key)}.Name`),
                        hint: L(`Settings.${settingKey(s.key)}.Hint`),
                        checked: s.choices ? false : value(s.key),
                        choices: s.choices ? prepareChoices(s.choices(), value(s.key)) : null,
                        parent: s.parent ?? null,
                        child: !!s.parent,
                        // Players can only change their own (client) settings.
                        locked: !s.client && !gm,
                        client: !!s.client
                    }))
                }))
            })),
            buttons: [
                { type: 'button', action: 'reset', icon: 'fa-solid fa-rotate-left', label: 'DHET.SettingsMenu.Reset' },
                { type: 'submit', icon: 'fa-solid fa-floppy-disk', label: 'DHET.SettingsMenu.Save' }
            ]
        };
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (partId === 'body') {
            for (const pane of context.panes) pane.tab = context.tabs[pane.id];
        }
        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        // Dependent switches follow their parent live.
        const sync = () => {
            for (const row of this.element.querySelectorAll('[data-parent]')) {
                const parent = this.element.querySelector(`input[name="${row.dataset.parent}"]`);
                row.classList.toggle('dhet-off', parent && !parent.checked);
            }
        };
        this.element.addEventListener('change', sync);
        sync();

        // The Fear tracker preview follows the unsaved choices.
        const preview = this.element.querySelector('[data-preview="fear"]');
        if (preview) {
            const field = name => this.element.querySelector(`[name="${name}"]`);
            const update = () =>
                styleTracker(preview, {
                    style: field('fearStyle')?.value,
                    color: field('fearColor')?.value,
                    icon: field('fearIcon')?.value,
                    shape: field('fearShape')?.value,
                    glow: field('fearMaxGlow')?.checked,
                    atMax: true
                });
            this.element.addEventListener('change', update);
            update();
        }
    }

    static async #onSubmit(event, form, formData) {
        const data = formData.object;
        const gm = game.user.isGM;
        for (const s of ALL) {
            if (!s.client && !gm) continue;
            const next = s.choices ? String(data[s.key] ?? s.default) : !!data[s.key];
            if (game.settings.get(MODULE_ID, s.key) !== next) await game.settings.set(MODULE_ID, s.key, next);
        }
        ui.notifications.info(L('SettingsMenu.Saved'));
    }

    /** Back to the defaults, in the form only: Save applies it. */
    static #onReset() {
        for (const input of this.element.querySelectorAll('input[type="checkbox"]:not(:disabled)')) {
            input.checked = ALL.find(x => x.key === input.name)?.default ?? true;
        }
        for (const select of this.element.querySelectorAll('select:not(:disabled)')) {
            const entry = ALL.find(x => x.key === select.name);
            if (entry) select.value = entry.default;
        }
        this.element.dispatchEvent(new Event('change', { bubbles: true }));
    }
}
