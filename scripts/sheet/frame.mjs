import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';
import { chatThemes } from './chattheme.mjs';

/**
 * One campaign frame for the whole world, picked by the GM. It drives every option that has a frame-specific
 * look, each behind its own switch: the default sheet theme (copied into every user's own sheet theme defaults,
 * since Foundry keeps those per user), the chat theme, and the Fear tokens' colours and icon. While the frame
 * drives an option, that option's own choice is kept but not used.
 */

export const NONE = 'none';

/** Which switch hands each option over to the frame. */
export const FRAME_PARTS = {
    sheets: 'frameSheets',
    chatTheme: 'frameChat',
    fearColor: 'frameFearColor',
    fearIcon: 'frameFearIcon'
};

const get = key => game.settings.get(MODULE_ID, key);

export function frameChoices() {
    return { [NONE]: L('Frame.None'), ...chatThemes() };
}

/** The world's campaign frame, or null (none chosen, or its module is gone). */
export function currentFrame() {
    const frame = get('campaignFrame');
    return frame && frame !== NONE && frame in chatThemes() ? frame : null;
}

/** The frame driving this option (a key of FRAME_PARTS), or null when the option uses its own choice. */
export function frameFor(part) {
    const frame = currentFrame();
    return frame && get(FRAME_PARTS[part]) ? frame : null;
}

/* -------------------------------------------- */
/*  Sheet themes                                */
/* -------------------------------------------- */

/** Every document type ([documentName, type]) with a registered sheet that offers this theme. */
function themedTypes(theme) {
    const out = [];
    for (const documentName of ['Actor', 'Item']) {
        for (const [type, sheets] of Object.entries(CONFIG[documentName]?.sheetClasses ?? {})) {
            if (Object.values(sheets).some(s => s.themes && theme in s.themes)) out.push([documentName, type]);
        }
    }
    return out;
}

/**
 * Copy the frame into this user's default sheet themes. Runs on every client, as Foundry keeps the defaults per
 * user. A theme picked for one particular sheet still wins, as it does in Foundry.
 */
export async function applySheetFrame() {
    const frame = frameFor('sheets');
    if (!frame) return;
    const types = themedTypes(frame);
    if (!types.length) return;
    const setting = foundry.utils.deepClone(game.settings.get('core', 'sheetThemes') ?? {});
    setting.defaults ??= {};
    let changed = false;
    for (const [documentName, type] of types) {
        setting.defaults[documentName] ??= {};
        if (setting.defaults[documentName][type] === frame) continue;
        setting.defaults[documentName][type] = frame;
        changed = true;
    }
    if (!changed) return;
    await game.settings.set('core', 'sheetThemes', setting);
    // Themes are fixed when a sheet opens, so reopen the open ones.
    for (const app of foundry.applications.instances.values()) {
        const doc = app.document;
        if (app.rendered && (doc instanceof Actor || doc instanceof Item)) doc._onSheetChange?.({ sheetOpen: true });
    }
}

export function registerFrame() {
    Hooks.once('ready', () => applySheetFrame().catch(err => console.warn(`${MODULE_ID} | sheet theme`, err)));
}
