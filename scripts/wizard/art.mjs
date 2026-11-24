/**
 * Art for the character creation wizard. Card art (subclasses, ancestries, communities, domain cards) comes from
 * the compendium art mappings of the premium modules, which Foundry already applies to every document's `img`.
 * The rest (class portraits, domain banners, splash art) are files in those modules, used only while the
 * module that ships them is active.
 */

const CORE = 'daggerheart-core';
const HF = 'daggerheart-hope-and-fear';

const active = id => !!game.modules.get(id)?.active;
const coreArt = file => (active(CORE) ? `modules/${CORE}/assets/art/${file}` : null);
const hfArt = file => (active(HF) ? `modules/${HF}/assets/art/${file}` : null);

/** Transparent character cutouts, one per subclass (keyed by the subclass's English name, lower case). */
const SUBCLASS_CUTOUTS = {
    troubadour: () => coreArt('classes/troubadour.webp'),
    wordsmith: () => coreArt('classes/wordsmith.webp'),
    'warden of the elements': () => coreArt('classes/warden-elements.webp'),
    'warden of renewal': () => coreArt('classes/warden-renewal.webp'),
    stalwart: () => coreArt('classes/stalwart.webp'),
    vengeance: () => coreArt('classes/vengeance.webp'),
    beastbound: () => coreArt('classes/beastbound.webp'),
    wayfinder: () => coreArt('classes/wayfinder.webp'),
    nightwalker: () => coreArt('classes/nightwalker.webp'),
    syndicate: () => coreArt('classes/dagger.webp'),
    'divine wielder': () => coreArt('classes/divine-wielder.webp'),
    'winged sentinel': () => coreArt('classes/winged-sentinel.webp'),
    'elemental origin': () => coreArt('classes/elemental-origin.webp'),
    'primal origin': () => coreArt('classes/primal-origin.webp'),
    'call of the brave': () => coreArt('classes/brave.webp'),
    'call of the slayer': () => coreArt('classes/slayer.webp'),
    'school of knowledge': () => coreArt('classes/school-of-knowledge.webp'),
    'school of war': () => coreArt('classes/school-of-war.webp'),
    'executioners guild': () => hfArt('classes/executioner.webp'),
    'poisoners guild': () => hfArt('classes/poisoner.webp'),
    juggernaut: () => hfArt('classes/juggernaut.webp'),
    'martial artist': () => hfArt('classes/martial-artist.webp'),
    'pact of the endless': () => hfArt('classes/pact-of-the-endless.webp'),
    'pact of the wrathful': () => hfArt('classes/pact-of-the-wrathful.webp'),
    hedge: () => hfArt('classes/hedge.webp'),
    moon: () => hfArt('classes/moon.webp')
};

/** The character cutout for a subclass, or null. */
export function subclassCutout(subclass) {
    return SUBCLASS_CUTOUTS[subclass?.name?.toLowerCase()]?.() ?? null;
}

/** Domain banner ribbons with the domain's glyph. */
export function domainBanner(domain) {
    if (domain === 'dread') return hfArt('book/banner-dread.webp');
    const core = ['arcana', 'blade', 'bone', 'codex', 'grace', 'midnight', 'sage', 'splendor', 'valor'];
    return core.includes(domain) ? coreArt(`domainbanner-${domain}.webp`) : null;
}

/** Wide splash art behind each step when nothing is picked yet. */
export function stepBackdrop(step) {
    const pick = (...candidates) => candidates.find(Boolean) ?? null;
    switch (step) {
        case 'class':
            return pick(hfArt('book/ch1-splash-introduction-dh-hf-hfdh048.webp'), coreArt('daggerheart-core-book-cover.webp'));
        case 'ancestry':
            return pick(hfArt('book/ch2-splash-ancestry-dh-hf.webp'), coreArt('daggerheart-core-book-cover.webp'));
        case 'community':
            return pick(hfArt('book/ch1-splash-community-dh-hf.webp'), coreArt('dh062-community-wanderborne-paul-scott-canavan.webp'));
        case 'domains':
            return pick(coreArt('dh-domain-circle-d1.webp'));
        default:
            return pick(coreArt('daggerheart-core-book-cover.webp'), hfArt('book/ch1-splash-introduction-dh-hf-hfdh048.webp'));
    }
}

/** Whether an image is real art rather than the system's generic item icon. */
export function isArt(img) {
    return !!img && !img.startsWith('icons/') && !img.includes('/assets/icons/');
}

/** Whether the Core Rulebook module is active (its sheet design is used for the wizards). */
export const coreActive = () => active(CORE);

const THEME_VARS = [
    '--dh-c-white',
    '--dh-c-black',
    '--dh-c-accent',
    '--dh-c-deep-accent',
    '--dh-c-bright-accent',
    '--dh-c-secondary',
    '--dh-c-secondary-60',
    '--dh-c-sections-background',
    '--dh-c-font-title',
    '--dh-c-font-body'
];

/**
 * The Core Rulebook sheet theme as inline custom properties. Its variables only exist on themed sheets, so a
 * hidden probe with the sheet's classes reads them (or the actor's own open sheet, with its chosen theme).
 */
export function coreThemeStyle(actor) {
    if (!coreActive()) return '';
    let source = actor?.sheet?.rendered ? actor.sheet.element : null;
    let probe = null;
    if (!source?.classList.contains('dh-c-style')) {
        probe = document.createElement('div');
        probe.className = 'application sheet daggerheart dh-c-style theme-dark';
        probe.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none; inset: auto;';
        document.body.append(probe);
        source = probe;
    }
    const style = getComputedStyle(source);
    const css = THEME_VARS.map(v => [v, style.getPropertyValue(v).trim()])
        .filter(([, value]) => value)
        .map(([v, value]) => `${v}: ${value}`)
        .join('; ');
    probe?.remove();
    return css;
}

/** A document's card exactly as the system shows it in tooltips (`toEmbed`), as HTML. */
export async function cardHtml(doc) {
    try {
        const theme = game.system.settings?.appearance?.tooltipCardTheme;
        const embed = await doc.system.toEmbed?.({ theme });
        if (!embed) return null;
        const nodes = embed instanceof HTMLElement ? [embed] : [...embed];
        return nodes.map(n => n.outerHTML).join('');
    } catch (err) {
        console.warn(`dh-emberite-tweaks | no card for ${doc?.name}`, err);
        return null;
    }
}

/** Whether an image is one of Foundry's or the system's placeholders rather than a picture someone chose. */
function isPlaceholder(img) {
    if (!img) return true;
    const defaults = [CONST.DEFAULT_TOKEN, foundry.documents.BaseActor?.DEFAULT_ICON, CONFIG.Actor?.documentClass?.DEFAULT_ICON].filter(Boolean);
    return defaults.includes(img) || img.includes('mystery-man') || img.startsWith('icons/svg/') || img.includes('/assets/icons/');
}

/** The character's own portrait, or its token image, if one was set (else null). */
export function actorPortrait(actor) {
    if (!actor) return null;
    const candidates = [actor.img, actor.prototypeToken?.texture?.src];
    return candidates.find(img => !isPlaceholder(img)) ?? null;
}
