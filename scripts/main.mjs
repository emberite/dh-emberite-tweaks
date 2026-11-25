import { MODULE_ID } from './rules.mjs';
import * as rules from './rules.mjs';
import { registerSocket } from './actor.mjs';
import { PANELS, refreshDrawers, registerDrawer, toggleDrawer } from './drawer.mjs';
import { preloadTemplates } from './view.mjs';
import { syncLunarEffects } from './panels/witch.mjs';
import { openCreationWizard, openLevelUpWizard, registerWizard } from './wizard/register.mjs';
import { registerSidebar } from './sheet/sidebar.mjs';
import { registerChatCards } from './sheet/chatcards.mjs';
import { registerSettings } from './settings.mjs';
import { registerChatTheme } from './sheet/chattheme.mjs';
import { registerFearTracker } from './sheet/feartracker.mjs';
import { registerRangeLabels } from './sheet/rangelabels.mjs';
import { registerSpotlight } from './sheet/spotlight.mjs';
import { registerCountdowns } from './sheet/countdowns.mjs';
import { registerFrame } from './sheet/frame.mjs';
import { registerRings } from './sheet/rings.mjs';

/**
 * Load the stylesheet with a version query. Foundry links module CSS by bare path, and a caching proxy would
 * otherwise keep serving last release's styles. Same cascade layer Foundry uses for module styles.
 */
function loadStyles() {
    const version = game.modules.get(MODULE_ID)?.version ?? Date.now();
    const style = document.createElement('style');
    style.id = `${MODULE_ID}-styles`;
    style.textContent = ['emberite-tweaks', 'wizard', 'sheet', 'settings', 'chat', 'fear', 'table']
        .map(file => `@import url("modules/${MODULE_ID}/styles/${file}.css?v=${encodeURIComponent(version)}") layer(modules);`)
        .join('\n');
    document.head.append(style);
}

Hooks.once('init', () => {
    loadStyles();
    registerSettings();
    registerDrawer();
    registerWizard();
    registerSidebar();
    registerChatCards();
    registerChatTheme();
    registerFearTracker();
    registerRangeLabels();
    registerSpotlight();
    registerCountdowns();
    registerFrame();
    registerRings();
    preloadTemplates();

    game.modules.get(MODULE_ID).api = {
        panels: PANELS,
        toggleDrawer,
        refreshDrawers,
        syncLunarEffects,
        openCreationWizard,
        openLevelUpWizard,
        rules
    };
});

Hooks.once('ready', () => {
    registerSocket();
    if (game.system.id !== 'daggerheart') console.warn(`${MODULE_ID} | needs the Daggerheart system`);
});
