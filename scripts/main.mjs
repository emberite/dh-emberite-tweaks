import { MODULE_ID } from './rules.mjs';
import * as rules from './rules.mjs';
import { registerSocket } from './actor.mjs';
import { PANELS, refreshDrawers, registerDrawer, toggleDrawer } from './drawer.mjs';
import { preloadTemplates } from './view.mjs';
import { syncLunarEffects } from './panels/witch.mjs';

/**
 * Load the stylesheet with a version query. Foundry links module CSS by bare path, and a caching proxy would
 * otherwise keep serving last release's styles. Same cascade layer Foundry uses for module styles.
 */
function loadStyles() {
    const version = game.modules.get(MODULE_ID)?.version ?? Date.now();
    const style = document.createElement('style');
    style.id = `${MODULE_ID}-styles`;
    style.textContent = `@import url("modules/${MODULE_ID}/styles/emberite-tweaks.css?v=${encodeURIComponent(version)}") layer(modules);`;
    document.head.append(style);
}

/**
 * One world toggle per feature, so any of them can be switched off once the system automates it itself.
 * Order here is the order in Configure Settings.
 */
const FEATURE_SETTINGS = [
    'martialStances',
    'oneStance',
    'stanceDropOut',
    'favor',
    'lunarPhases',
    'hexes',
    'markedForDeath',
    'oneMark',
    'toxicConcoctions',
    'strangePatterns',
    'unstoppable'
];

const settingKey = key => key.charAt(0).toUpperCase() + key.slice(1);

function registerSettings() {
    game.settings.register(MODULE_ID, 'showDrawer', {
        name: 'DHET.Settings.ShowDrawer.Name',
        hint: 'DHET.Settings.ShowDrawer.Hint',
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: refreshDrawers
    });
    for (const key of FEATURE_SETTINGS) {
        game.settings.register(MODULE_ID, key, {
            name: `DHET.Settings.${settingKey(key)}.Name`,
            hint: `DHET.Settings.${settingKey(key)}.Hint`,
            scope: 'world',
            config: true,
            type: Boolean,
            default: true,
            onChange: refreshDrawers
        });
    }
    game.settings.register(MODULE_ID, 'drawerOpen', {
        scope: 'client',
        config: false,
        type: Boolean,
        default: true
    });
}

Hooks.once('init', () => {
    loadStyles();
    registerSettings();
    registerDrawer();
    preloadTemplates();

    game.modules.get(MODULE_ID).api = {
        panels: PANELS,
        toggleDrawer,
        refreshDrawers,
        syncLunarEffects,
        rules
    };
});

Hooks.once('ready', () => {
    registerSocket();
    if (game.system.id !== 'daggerheart') console.warn(`${MODULE_ID} | needs the Daggerheart system`);
});
