import { MODULE_ID } from '../rules.mjs';
import { CreationWizard } from './wizard.mjs';
import { LevelUpWizard } from './levelup.mjs';

const open = new Map();

function openWizard(Cls, actor) {
    const key = `${Cls.name}.${actor.uuid}`;
    const existing = open.get(key);
    if (existing?.rendered) return existing;
    const wizard = new Cls(actor);
    open.set(key, wizard);
    wizard.render({ force: true });
    return wizard;
}

/** Open the full-screen character creation for an actor. */
export const openCreationWizard = actor => openWizard(CreationWizard, actor);

/** Open the full-screen level up for an actor (it asks for the target level if none is pending). */
export const openLevelUpWizard = actor => openWizard(LevelUpWizard, actor);

/**
 * The sheet's "Character Setup" and level up buttons both run the `levelManagement` action. With the settings on,
 * a character that still needs setup gets the creation wizard and everyone else the level up wizard; with them off
 * the system's own dialogs open as before.
 */
export function registerWizard() {
    const Character = game.system.api?.applications?.sheets?.actors?.Character;
    const actions = Character?.DEFAULT_OPTIONS?.actions;
    if (!actions?.levelManagement) {
        console.error(`${MODULE_ID} | character sheet's levelManagement action not found; the creation wizard is unavailable`);
        return;
    }
    const original = actions.levelManagement;
    actions.levelManagement = function (event, target) {
        const actor = this.document;
        if (game.settings.get(MODULE_ID, 'creationWizard') && actor?.system?.needsCharacterSetup) {
            return openCreationWizard(actor);
        }
        if (game.settings.get(MODULE_ID, 'levelUpWizard') && !actor?.system?.needsCharacterSetup) {
            if (!actor.system.class?.value || !actor.system.class?.subclass) {
                return ui.notifications.error(game.i18n.localize('DAGGERHEART.UI.Notifications.missingClassOrSubclass'));
            }
            return openLevelUpWizard(actor);
        }
        return original.call(this, event, target);
    };
}
