import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    STANCES,
    advanceUnstoppable,
    compendiumId,
    dropsStance,
    knownStanceLimit,
    lastId,
    lunarPhase,
    moonLitPath,
    markDieFaces,
    nextLunarValue,
    patronDieFaces,
    pips,
    refocusResult,
    unstoppableFaces
} from '../scripts/rules.mjs';

test('lunar phases follow the d6 table', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(lunarPhase), ['new', 'waxing', 'waxing', 'full', 'waning', 'waning']);
    assert.equal(lunarPhase(0), null);
});

test('the moon is lit on the right while waxing and on the left while waning', () => {
    assert.equal(moonLitPath(1), null, 'new moon');
    assert.equal(moonLitPath(0), null, 'not rolled');
    assert.match(moonLitPath(2), /^M20 2 A18 18 0 0 1 20 38 A10 18 0 0 0/, 'waxing crescent: right arc, thin');
    assert.match(moonLitPath(3), /^M20 2 A18 18 0 0 1 20 38 A10 18 0 0 1/, 'waxing gibbous: right arc, fat');
    assert.match(moonLitPath(5), /^M20 2 A18 18 0 0 0 20 38 A10 18 0 0 0/, 'waning gibbous: left arc, fat');
    assert.match(moonLitPath(6), /^M20 2 A18 18 0 0 0 20 38 A10 18 0 0 1/, 'waning crescent: left arc, thin');
    assert.match(moonLitPath(4), /A18 18 0 1 1/, 'full disc');
});

test('advancing the moon wraps a 6 to a 1', () => {
    assert.equal(nextLunarValue(1), 2);
    assert.equal(nextLunarValue(5), 6);
    assert.equal(nextLunarValue(6), 1);
    assert.equal(nextLunarValue(0), 1);
});

test('patron and unstoppable dice grow at level 5', () => {
    assert.equal(patronDieFaces(4), 6);
    assert.equal(patronDieFaces(5), 8);
    assert.equal(unstoppableFaces(1), 4);
    assert.equal(unstoppableFaces(5), 6);
});

test('the unstoppable die ends once it would pass its maximum', () => {
    assert.deepEqual(advanceUnstoppable(1, 4), { value: 2, ended: false });
    assert.deepEqual(advanceUnstoppable(4, 4), { value: 0, ended: true });
    // The book's tip: a d6 that shows 4 turns to 5.
    assert.deepEqual(advanceUnstoppable(4, 6), { value: 5, ended: false });
    assert.deepEqual(advanceUnstoppable(6, 6), { value: 0, ended: true });
});

test('marked for death dice: d4, d6 with Ambush, d8 with Backstab', () => {
    assert.equal(markDieFaces(), 4);
    assert.equal(markDieFaces({ ambush: true }), 6);
    assert.equal(markDieFaces({ ambush: true, backstab: true }), 8);
});

test('two stances at level 1, one more each level', () => {
    assert.equal(knownStanceLimit(1), 2);
    assert.equal(knownStanceLimit(4), 5);
    assert.equal(knownStanceLimit(10), 11);
});

test('refocus keeps the highest die, capped at the track', () => {
    assert.equal(refocusResult([2, 5, 3]), 5);
    assert.equal(refocusResult([]), 0);
    assert.equal(refocusResult([6, 6], 4), 4);
});

test('severe damage or the last hit point drops a stance', () => {
    assert.equal(dropsStance(0, 1, 6), false, 'minor');
    assert.equal(dropsStance(0, 2, 6), false, 'major');
    assert.equal(dropsStance(0, 3, 6), true, 'severe');
    assert.equal(dropsStance(4, 6, 6), true, 'last hit point');
    assert.equal(dropsStance(3, 2, 6), false, 'healing');
    assert.equal(dropsStance(6, 6, 6), false, 'no change');
});

test('ids and pips', () => {
    assert.equal(compendiumId('Compendium.daggerheart.subclasses.Item.W95PSU4iXjg2v5B5'), 'W95PSU4iXjg2v5B5');
    assert.equal(compendiumId(null), null);
    assert.equal(lastId('Actor.a.Item.b.ActiveEffect.c'), 'c');
    assert.deepEqual(pips(2, 3).map(p => p.filled), [true, true, false]);
});

test('sixteen stances, four per tier', () => {
    const tiers = Object.values(STANCES);
    assert.equal(tiers.length, 16);
    for (const t of [1, 2, 3, 4]) assert.equal(tiers.filter(x => x === t).length, 4);
});
