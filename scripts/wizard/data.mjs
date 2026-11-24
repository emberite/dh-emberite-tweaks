/**
 * Candidates for the character creation wizard: every class, subclass, ancestry, community and level 1 domain
 * card in the world and its compendiums, minus what the GM excluded in the system's compendium browser settings
 * (the same filter the system's own browser uses).
 */

const TYPES = ['class', 'subclass', 'ancestry', 'community', 'domainCard'];

function exclusionFilter() {
    try {
        const settings = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.CompendiumBrowserSettings);
        return item => {
            try {
                return !!settings?.isEntryExcluded?.(item);
            } catch {
                return false;
            }
        };
    } catch {
        return () => false;
    }
}

/** Load every candidate document, grouped by type and sorted by name. */
export async function loadCandidates() {
    const excluded = exclusionFilter();
    const found = Object.fromEntries(TYPES.map(t => [t, []]));
    const seen = new Set();
    const add = doc => {
        if (seen.has(doc.uuid) || excluded(doc)) return;
        if (doc.type === 'domainCard' && (doc.system.level ?? 1) > 1) return;
        seen.add(doc.uuid);
        found[doc.type].push(doc);
    };

    for (const pack of game.packs) {
        if (pack.documentName !== 'Item') continue;
        const index = await pack.getIndex();
        if (!index.some(e => TYPES.includes(e.type))) continue;
        const docs = await pack.getDocuments({ type__in: TYPES });
        docs.forEach(add);
    }
    for (const item of game.items) if (TYPES.includes(item.type)) add(item);

    for (const list of Object.values(found)) list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    return found;
}

/** Subclasses of a class (they point back at the class's source uuid). */
export function subclassesOf(cls, candidates) {
    const source = cls?.sourceUuid ?? cls?.uuid;
    return candidates.subclass.filter(s => s.system.linkedClass === source);
}

/** Level 1 domain cards of a domain. */
export function domainCards(domain, candidates) {
    return candidates.domainCard
        .filter(c => c.system.domain === domain)
        .sort((a, b) => (a.system.level ?? 0) - (b.system.level ?? 0) || a.name.localeCompare(b.name));
}

/** The values a character assigns to their traits (homebrew can change the default +2 +1 +1 +0 +0 −1). */
export function traitArray() {
    try {
        const homebrew = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew);
        if (homebrew?.traitArray?.length) return [...homebrew.traitArray];
    } catch {
        /* fall through */
    }
    return [2, 1, 1, 0, 0, -1];
}

/** Tier 1 weapons and armor for the custom equipment gallery, split into primary/secondary weapons and armor. */
export async function loadGear() {
    const excluded = exclusionFilter();
    const gear = { primaryWeapon: [], secondaryWeapon: [], armor: [] };
    const seen = new Set();
    const add = doc => {
        if (seen.has(doc.uuid) || excluded(doc) || (doc.system.tier ?? 1) > 1) return;
        seen.add(doc.uuid);
        if (doc.type === 'armor') gear.armor.push(doc);
        else gear[doc.system.secondary ? 'secondaryWeapon' : 'primaryWeapon'].push(doc);
    };
    for (const pack of game.packs) {
        if (pack.documentName !== 'Item') continue;
        const index = await pack.getIndex();
        if (!index.some(e => e.type === 'weapon' || e.type === 'armor')) continue;
        (await pack.getDocuments({ type__in: ['weapon', 'armor'] })).forEach(add);
    }
    for (const item of game.items) if (item.type === 'weapon' || item.type === 'armor') add(item);
    for (const list of Object.values(gear)) list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    return gear;
}
