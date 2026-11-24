/**
 * Rules and constants with no Foundry globals, so tests/rules.test.mjs can run them under plain Node.
 */

export const MODULE_ID = 'dh-emberite-tweaks';

/** Compendium ids of the system's feature items this module recognises (daggerheart.classes / .subclasses). */
export const FEATURE_IDS = {
    stanceFighter: 'EVEP9G6lNF8nR5f3',
    flowState: 'iuqAzugTIf7Ipcmb',
    lunarPhases: '6HGlS2CvR9NBsVg5',
    hex: 'EFgQVcDiADsKxG3T',
    favor: 'OGPn7DUJoJwAXh8o',
    patronsPact: 'IOWBzweDFPoAHtQW',
    patronsFury: 'K6dQzaeZJHfRu87I',
    markedForDeath: 'XxS0Li1P6SqIho7T',
    ambush: 'WkrwX3w8K4wLpaY8',
    backstab: '1x1EBrNOPdlWhIAZ',
    toxicConcoctions: 'UNn0fdVUezD9rRJu',
    poisonCompendium: 'RrYxuotaN5JAjHdT',
    venomancer: 'WAkxLnKbtic1O6pC',
    twinFang: 'i4iY1IBTBWEI01QU',
    strangePatterns: '6YsfFjmCGuFYVhT4',
    unstoppable: 'PnD2UCgzIlwX6cY3'
};

/** English item names, the fallback for features created by hand or copied without a compendium source. */
export const FEATURE_NAMES = {
    stanceFighter: 'Stance Fighter',
    flowState: 'Flow State',
    lunarPhases: 'Lunar Phases',
    hex: 'Hex',
    favor: 'Favor',
    patronsPact: "Patron's Pact",
    patronsFury: "Patron's Fury",
    markedForDeath: 'Marked for Death',
    ambush: 'Ambush',
    backstab: 'Backstab',
    toxicConcoctions: 'Toxic Concoctions',
    poisonCompendium: 'Poison Compendium',
    venomancer: 'Venomancer',
    twinFang: 'Twin Fang',
    strangePatterns: 'Strange Patterns',
    unstoppable: 'Unstoppable'
};

/** The sixteen martial stances in daggerheart.subclasses, by compendium id → stance tier. */
export const STANCES = {
    W95PSU4iXjg2v5B5: 1, // Favored
    ewgpPblJAcHCHPUO: 1, // Invigorating
    bGXfEQV5TLujvgp7: 1, // Quick
    zNyqL7wzm1W4dUjN: 1, // Reliable
    RoG3RZWVnTK6TYFI: 2, // Aggressive
    uLRkOyvk0n9QpZSi: 2, // Anchored
    YGQ7hhRGrYm8BFDP: 2, // Defensive
    K2R2i8dhtNnY9MYR: 2, // Otherworldly
    aN9OhwIJXTCDc11u: 3, // Grappling
    b16QLSE6UYZExF76: 3, // Scary
    mfuYkv8RpcSh8SfG: 3, // Stable
    '4bLcpljjJylzM5xg': 3, // Vigilant
    '3IT4w3WExpGFD3Mm': 4, // Crushing
    hzDDTkBp1cqMOq7z: 4, // Exacting
    aJKTuq1Ja5o9lB16: 4, // Honed
    QVKgnF8eUwbX8K9H: 4 // Isolating
};
export const FAVORED_STANCE = 'W95PSU4iXjg2v5B5';
export const STANCE_PACK = 'daggerheart.subclasses';
/** Prefix of the effect each stance applies ("Stance: Favored"). */
export const STANCE_EFFECT_PREFIX = 'Stance:';

/** Transfer effects on the Lunar Phases feature, by phase. New Moon has no effect, only a reaction. */
export const LUNAR_EFFECTS = { waxing: 'K7xu1KI8zehJ8kkY', full: '7V75lzCjChYmZaZ5', waning: 'b60bHY67KMfRJOrU' };
export const LUNAR_PHASES = ['new', 'waxing', 'full', 'waning'];

/** Source effects features place on targets. Applied copies carry `origin` = the source effect's uuid. */
export const HEX_EFFECT = 'Pl35ZLKEWDU5nlUj';
export const MARK_EFFECT = 'JLvo5LKRfs0mMHAj';
export const UNSTOPPABLE_EFFECT = 'xzQtFSuDS48kUdAZ';
export const FURY_EFFECT = 'A8okI37ZgcpYTIL6';

/**
 * Poisons, by the feature that teaches them. `action` names the system action that applies it (run through the
 * system so targets, statuses and damage work as usual); the others only need a chat note.
 */
export const POISONS = [
    { key: 'ghostPetal', feature: 'toxicConcoctions', action: 'Ghost Petal' },
    { key: 'graveSpore', feature: 'toxicConcoctions', action: 'Grave Spore' },
    { key: 'leechWeed', feature: 'toxicConcoctions', roll: '1d6' },
    { key: 'midnightVine', feature: 'poisonCompendium', action: 'Midnight Vine' },
    { key: 'gorgonRoot', feature: 'poisonCompendium', action: 'Gorgon Root' },
    { key: 'blightSeed', feature: 'venomancer', action: 'Blight Seed' },
    { key: 'fearLeaf', feature: 'venomancer' },
    { key: 'corpseThorn', feature: 'venomancer', action: 'Corpse Thorn' }
];

export const TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];

/** Compendium id at the end of an item's `_stats.compendiumSource`, or null. */
export function compendiumId(uuid) {
    const match = /\.Item\.([A-Za-z0-9]{16})$/.exec(uuid ?? '');
    return match?.[1] ?? null;
}

/** Last document id of an uuid like "Actor.x.Item.y.ActiveEffect.z" → "z". */
export function lastId(uuid) {
    return (uuid ?? '').split('.').pop() || null;
}

/** Lunar phase for a d6 result: 1 New, 2–3 Waxing, 4 Full, 5–6 Waning. */
export function lunarPhase(value) {
    if (value === 1) return 'new';
    if (value === 2 || value === 3) return 'waxing';
    if (value === 4) return 'full';
    if (value === 5 || value === 6) return 'waning';
    return null;
}

/** "If you increase the value of a 6, it becomes a 1." */
export function nextLunarValue(value) {
    return value >= 6 || value < 1 ? 1 : value + 1;
}

/** Warlock Patron Die: d6, d8 from level 5. */
export function patronDieFaces(level) {
    return level >= 5 ? 8 : 6;
}

/** Guardian Unstoppable Die: d4, d6 from level 5. */
export function unstoppableFaces(level) {
    return level >= 5 ? 6 : 4;
}

/** Raise the Unstoppable Die by one; past its maximum the die is removed and Unstoppable ends. */
export function advanceUnstoppable(value, faces) {
    const next = Math.max(0, value) + 1;
    return next > faces ? { value: 0, ended: true } : { value: next, ended: false };
}

/** Assassin Marked for Death dice: d4, d6 with Ambush, d8 with Backstab. */
export function markDieFaces({ ambush = false, backstab = false } = {}) {
    if (backstab) return 8;
    return ambush ? 6 : 4;
}

/** Two Tier 1 stances at level 1, one more each level after. */
export function knownStanceLimit(level) {
    return Math.max(1, level) + 1;
}

/** Refocus: Focus becomes the highest d6 rolled, capped at the track's maximum. */
export function refocusResult(rolls, max = 6) {
    if (!rolls.length) return 0;
    return Math.min(max, Math.max(0, ...rolls));
}

/**
 * Whether a Hit Point change knocks a Martial Artist out of their stance: Severe damage (3 or more
 * Hit Points marked at once) or marking the last Hit Point.
 */
export function dropsStance(before, after, max) {
    const marked = after - before;
    if (!(marked > 0)) return false;
    return marked >= 3 || (max > 0 && after >= max);
}

/** Clamp a resource value into [0, max]. */
export function clamp(value, max) {
    return Math.max(0, Math.min(max, value));
}

/** Pips for a track of `max` boxes with `value` filled, for templates. */
export function pips(value, max) {
    return Array.from({ length: Math.max(0, max) }, (_, i) => ({ value: i + 1, filled: i < value }));
}
