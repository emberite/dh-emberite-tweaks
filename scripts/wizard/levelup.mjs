import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';
import { describe } from '../view.mjs';
import { domainBanner, isArt, stepBackdrop, subclassCutout } from './art.mjs';
import { loadCandidates, subclassesOf } from './data.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const T = key => `modules/${MODULE_ID}/templates/wizard/${key}.hbs`;

/** Icons for the system's advancement options. */
const OPTION_ICONS = {
    trait: 'fa-solid fa-dumbbell',
    hitPoint: 'fa-solid fa-heart',
    stress: 'fa-solid fa-bolt',
    experience: 'fa-solid fa-book-open',
    domainCard: 'fa-solid fa-layer-group',
    evasion: 'fa-solid fa-person-running',
    subclass: 'fa-solid fa-star',
    proficiency: 'fa-solid fa-hand-fist',
    multiclass: 'fa-solid fa-code-branch'
};

/**
 * Full-screen level up. It drives the system's own level-up data (`DhLevelup`, built exactly as the system's
 * dialog builds it) with the same updates the dialog makes, and finishes with `actor.levelUp`, so the result is
 * identical. Choices are made by clicking advancement and card tiles instead of checkboxes and drag & drop.
 */
export class LevelUpWizard extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.levelup = null;
        this.candidates = null;
        this.descriptions = new Map();
        this.review = false;
    }

    static DEFAULT_OPTIONS = {
        id: 'dhet-levelup-{id}',
        classes: ['dhet-wizard', 'dhet-levelup'],
        tag: 'div',
        window: { frame: false, positioned: false },
        actions: {
            close: LevelUpWizard.#onClose,
            cancelClose: LevelUpWizard.#onCancelClose,
            target: LevelUpWizard.#onTarget,
            gotoLevel: LevelUpWizard.#onGotoLevel,
            next: LevelUpWizard.#onNext,
            back: LevelUpWizard.#onBack,
            option: LevelUpWizard.#onOption,
            unoption: LevelUpWizard.#onUnoption,
            pickTrait: LevelUpWizard.#onPickTrait,
            pickExperience: LevelUpWizard.#onPickExperience,
            pickCard: LevelUpWizard.#onPickCard,
            pickUpgrade: LevelUpWizard.#onPickUpgrade,
            pickMulticlass: LevelUpWizard.#onPickMulticlass,
            pickMultiDomain: LevelUpWizard.#onPickMultiDomain,
            pickMultiSubclass: LevelUpWizard.#onPickMultiSubclass,
            finish: LevelUpWizard.#onFinish
        }
    };

    static PARTS = {
        main: { template: T('levelup'), scrollable: ['.dhet-wz-body'] }
    };

    get title() {
        return L('LevelUp.Title', { actor: this.actor.name });
    }

    /* ---------- state ---------- */

    get level() {
        return this.levelup?.levels[this.levelup.currentLevel];
    }

    get path() {
        return `levels.${this.levelup.currentLevel}`;
    }

    /** Build the system's level-up state, exactly as its own dialog does. */
    #build() {
        const { current, changed } = this.actor.system.levelData.level;
        this.levelup = changed > current
            ? new game.system.api.applications.levelup.CharacterLevelup(this.actor).levelup
            : null;
    }

    async #load() {
        if (!this.candidates) this.candidates = await loadCandidates();
        if (this.levelup === null && this.actor.system.levelData.level.changed > this.actor.system.levelData.level.current) {
            this.#build();
        }
    }

    async #update(changes) {
        await this.levelup.updateSource(changes);
        return this.refresh();
    }

    refresh() {
        this._keepScroll = true;
        return this.render();
    }

    async _preRender(context, options) {
        await super._preRender(context, options);
        this._scroll = this._keepScroll ? this.element?.querySelector('.dhet-wz-body')?.scrollTop ?? 0 : 0;
        this._keepScroll = false;
    }

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        document.body.classList.add('dhet-wizard-open');
    }

    _onRender(context, options) {
        super._onRender(context, options);
        for (const input of this.element.querySelectorAll('[data-dhet-input]')) {
            input.addEventListener('change', ev => this.#onInput(ev));
        }
        this.element.querySelector('.dhet-wz-body')?.scrollTo?.({ top: this._scroll ?? 0 });
    }

    async close(options = {}) {
        document.body.classList.remove('dhet-wizard-open');
        return super.close(options);
    }

    async #describe(doc) {
        if (!this.descriptions.has(doc.uuid)) this.descriptions.set(doc.uuid, await describe(doc.name, doc.system.description, doc));
        return this.descriptions.get(doc.uuid);
    }

    /** The tier the current level belongs to. */
    #tierKey() {
        const lu = this.levelup;
        return Object.keys(lu.tiers).find(k => lu.tiers[k].belongingLevels.includes(lu.currentLevel));
    }

    /** This level's choices as a flat list: { option, nr, path, ...checkbox }. */
    #choices() {
        const out = [];
        for (const [option, boxes] of Object.entries(this.level.choices)) {
            for (const [nr, box] of Object.entries(boxes)) {
                out.push({ ...box, option, nr, path: `${this.path}.choices.${option}.${nr}` });
            }
        }
        return out;
    }

    /* ---------- domain cards ---------- */

    /** Cards that may fill a slot: legal domain, level within limit, not owned or already picked. */
    #eligibleCards(limit) {
        const lu = this.levelup;
        const multi = lu.classUpgradeChoices.multiclass;
        const owned = new Set(this.actor.items.filter(i => i.type === 'domainCard').map(i => i.name));
        const picked = new Set();
        for (const level of Object.values(lu.levels)) {
            Object.values(level.achievements.domainCards).forEach(c => c.uuid && picked.add(c.uuid));
            Object.values(level.choices.domainCard ?? {}).forEach(c => c.data.forEach(u => picked.add(u)));
        }
        const domains = new Set(this.actor.system.domains);
        return (this._allCards ?? []).filter(card => {
            const isMulti = multi?.domain === card.system.domain;
            if (!domains.has(card.system.domain) && !isMulti) return false;
            const base = isMulti ? Math.ceil(lu.currentLevel / 2) : lu.currentLevel;
            const max = limit ? Math.min(limit, base) : base;
            if ((card.system.level ?? 1) > max) return false;
            return !owned.has(card.name) && !picked.has(card.uuid);
        });
    }

    /** Domain cards of every level (creation only needs level 1), minus what the GM excluded from the browser. */
    async #loadAllCards() {
        if (this._allCards) return;
        const cards = [];
        const seen = new Set();
        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;
            const index = await pack.getIndex();
            if (!index.some(e => e.type === 'domainCard')) continue;
            for (const doc of await pack.getDocuments({ type: 'domainCard' })) {
                if (!seen.has(doc.uuid)) cards.push(doc), seen.add(doc.uuid);
            }
        }
        for (const item of game.items) if (item.type === 'domainCard' && !seen.has(item.uuid)) cards.push(item);
        cards.sort((a, b) => (a.system.level ?? 0) - (b.system.level ?? 0) || a.name.localeCompare(b.name));
        this._allCards = cards;
    }

    async #cardGallery(slot, limit, selectedUuid) {
        const domainsConfig = CONFIG.DH.DOMAIN.allDomains?.() ?? {};
        const eligible = this.#eligibleCards(limit);
        const selected = selectedUuid ? await fromUuid(selectedUuid) : null;
        const cards = selected ? [selected, ...eligible] : eligible;
        const byDomain = new Map();
        for (const card of cards) {
            const d = card.system.domain;
            if (!byDomain.has(d)) byDomain.set(d, []);
            byDomain.get(d).push(card);
        }
        return Promise.all(
            [...byDomain.entries()].map(async ([domain, list]) => ({
                id: domain,
                label: game.i18n.localize(domainsConfig[domain]?.label ?? domain),
                banner: domainBanner(domain),
                icon: domainsConfig[domain]?.src,
                cards: await Promise.all(
                    list.map(async card => ({
                        uuid: card.uuid,
                        name: card.name,
                        img: card.img,
                        hasArt: isArt(card.img),
                        level: card.system.level,
                        selected: card.uuid === selectedUuid,
                        slot,
                        tooltip: await this.#describe(card)
                    }))
                )
            }))
        );
    }

    /* ---------- context ---------- */

    async _prepareContext(options) {
        await this.#load();
        const context = await super._prepareContext(options);
        const actor = this.actor;
        const subclass = actor.system.class?.subclass;
        const base = {
            ...context,
            actorName: actor.name,
            backdrop: isArt(subclass?.img) ? subclass.img : stepBackdrop('levelup'),
            cutout: subclassCutout(subclass),
            className: actor.system.class?.value?.name,
            subclassName: subclass?.name,
            currentLevel: actor.system.levelData.level.current
        };

        // No target yet: choose how far to level.
        if (!this.levelup) {
            const tiers = Object.values(game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.LevelTiers).tiers);
            const max = tiers.reduce((acc, t) => Math.max(acc, t.levels.end), 0);
            const from = actor.system.levelData.level.current;
            return {
                ...base,
                choosing: true,
                targets: Array.from({ length: Math.max(0, max - from) }, (_, i) => {
                    const level = from + i + 1;
                    const tier = tiers.find(t => level >= t.levels.start && level <= t.levels.end);
                    return { level, tier: tier ? game.i18n.localize(tier.name) : '', newTier: tier?.levels.start === level };
                })
            };
        }

        await this.#loadAllCards();
        const lu = this.levelup;
        const levels = Object.keys(lu.levels)
            .map(Number)
            .filter(n => n >= lu.startLevel)
            .sort((a, b) => a - b);

        if (this.review) {
            return { ...base, levels: this.#rail(levels), reviewing: true, summary: await this.#summary(levels), canFinish: lu.allLevelsFinished };
        }

        const level = this.level;
        const { selections, available } = level.nrSelections;
        const tierKey = this.#tierKey();
        const tierRender = lu.tiersForRendering[Object.keys(lu.tiers).indexOf(tierKey)];
        const tier = lu.tiers[tierKey];

        // Advancement tiles for this tier.
        const advancements = tierRender.groups.map(group => {
            const boxes = group.checkboxGroups.flatMap(g => g.checkboxes.length ? [{ ...g.checkboxes[0], multi: g.multi }] : []);
            const key = boxes[0]?.option;
            const mine = boxes.filter(b => b.selected && b.level === lu.currentLevel);
            const free = boxes.filter(b => !b.selected && !b.disabled);
            const cost = boxes[0]?.minCost ?? 1;
            return {
                key,
                label: group.label,
                icon: OPTION_ICONS[key] ?? 'fa-solid fa-circle-plus',
                cost,
                pips: boxes.map(b => ({ selected: b.selected, mine: b.selected && b.level === lu.currentLevel, locked: b.disabled && !b.selected })),
                taken: mine.length,
                canTake: free.length > 0 && available >= cost,
                nextNr: free[0]?.checkboxNr,
                lastNr: mine[mine.length - 1]?.checkboxNr
            };
        });

        return {
            ...base,
            levels: this.#rail(levels),
            level: lu.currentLevel,
            tierName: game.i18n.localize(tier.name),
            maxSelections: level.maxSelections,
            selections,
            available,
            options: advancements,
            achievements: await this.#achievements(),
            details: await this.#details(),
            canNext: lu.currentLevelFinished,
            isLastLevel: lu.currentLevel >= lu.endLevel,
            canBack: lu.currentLevel > lu.startLevel
        };
    }

    #rail(levels) {
        const lu = this.levelup;
        return levels.map(n => ({
            level: n,
            current: !this.review && n === lu.currentLevel,
            done: this.review || n < lu.currentLevel,
            locked: !this.review && n > lu.currentLevel
        }));
    }

    async #achievements() {
        const level = this.level;
        const experiences = Object.entries(level.achievements.experiences ?? {}).map(([id, e]) => ({
            id,
            name: e.name,
            modifier: e.modifier
        }));
        const cards = await Promise.all(
            Object.entries(level.achievements.domainCards ?? {})
                .filter(([, c]) => c.level <= this.levelup.endLevel)
                .map(async ([key, c]) => ({
                    key,
                    filled: !!c.uuid,
                    domains: await this.#cardGallery(`${this.path}.achievements.domainCards.${key}.uuid`, null, c.uuid)
                }))
        );
        return { experiences, proficiency: level.achievements.proficiency, cards };
    }

    async #details() {
        const lu = this.levelup;
        const actor = this.actor;
        const out = [];
        for (const choice of this.#choices()) {
            const base = { option: choice.option, path: choice.path, label: L(`LevelUp.Detail.${choice.option}`), icon: OPTION_ICONS[choice.option] };
            switch (choice.option) {
                case 'trait': {
                    const free = lu.unmarkedTraits;
                    out.push({
                        ...base,
                        traits: Object.keys(CONFIG.DH.ACTOR.abilities).map(key => ({
                            key,
                            label: game.i18n.localize(CONFIG.DH.ACTOR.abilities[key].label),
                            value: actor.system.traits[key]?.value ?? 0,
                            selected: choice.data.includes(key),
                            disabled: !(key in free) && !choice.data.includes(key)
                        })),
                        count: choice.data.length,
                        amount: choice.amount
                    });
                    break;
                }
                case 'experience': {
                    const pending = Object.values(lu.levels)
                        .flatMap(l => Object.entries(l.achievements.experiences ?? {}))
                        .filter(([, e]) => e.name)
                        .map(([id, e]) => ({ id, name: e.name, value: e.modifier }));
                    const existing = Object.entries(actor.system.experiences ?? {}).map(([id, e]) => ({ id, name: e.name, value: e.value }));
                    out.push({
                        ...base,
                        experiences: [...existing, ...pending].map(e => ({ ...e, selected: choice.data.includes(e.id) })),
                        count: choice.data.length,
                        amount: choice.amount
                    });
                    break;
                }
                case 'domainCard':
                    out.push({
                        ...base,
                        cards: true,
                        domains: await this.#cardGallery(`${choice.path}.data`, choice.secondaryData?.limit ?? null, choice.data[0])
                    });
                    break;
                case 'subclass': {
                    const increase = Object.values(lu.levels).reduce(
                        (acc, l) => acc + Object.values(l.choices).filter(c => Object.values(c).every(b => b.type === 'subclass')).length,
                        0
                    );
                    const subs = [actor.system.class.subclass, actor.system.multiclass?.subclass].filter(Boolean);
                    out.push({
                        ...base,
                        upgrades: subs.map(sub => {
                            const state = sub.system.featureState + increase;
                            return {
                                uuid: sub.uuid,
                                name: sub.name,
                                img: sub.img,
                                hasArt: isArt(sub.img),
                                cutout: subclassCutout(sub),
                                state,
                                stateLabel: game.i18n.localize(CONFIG.DH.ACTOR.subclassFeatureLabels?.[state] ?? ''),
                                isMulticlass: sub.system.isMulticlass ? 'true' : 'false',
                                selected: choice.data.includes(sub.uuid)
                            };
                        })
                    });
                    break;
                }
                case 'multiclass': {
                    const chosen = choice.data[0] ? await fromUuid(choice.data[0]) : null;
                    const own = actor.system.class.value;
                    const domainsConfig = CONFIG.DH.DOMAIN.allDomains?.() ?? {};
                    out.push({
                        ...base,
                        multiclass: true,
                        classes: chosen
                            ? null
                            : await Promise.all(
                                  this.candidates.class
                                      .filter(c => c.name !== own?.name)
                                      .map(async c => {
                                          const subs = subclassesOf(c, this.candidates);
                                          return {
                                              uuid: c.uuid,
                                              name: c.name,
                                              cutouts: subs.map(subclassCutout).filter(Boolean).slice(0, 2),
                                              fallbackArt: subs.map(x => x.img).find(isArt) ?? null,
                                              img: c.img,
                                              tooltip: await this.#describe(c)
                                          };
                                      })
                              ),
                        chosen: chosen && { uuid: chosen.uuid, name: chosen.name },
                        domains: chosen
                            ? chosen.system.domains.map(d => ({
                                  id: d,
                                  label: game.i18n.localize(domainsConfig[d]?.label ?? d),
                                  banner: domainBanner(d),
                                  icon: domainsConfig[d]?.src,
                                  selected: choice.secondaryData?.domain === d,
                                  disabled: own?.system.domains.includes(d)
                              }))
                            : null,
                        subclasses: chosen
                            ? await Promise.all(
                                  subclassesOf(chosen, this.candidates).map(async s => ({
                                      uuid: s.uuid,
                                      name: s.name,
                                      img: s.img,
                                      hasArt: isArt(s.img),
                                      selected: choice.secondaryData?.subclass === s.uuid,
                                      tooltip: await this.#describe(s)
                                  }))
                              )
                            : null
                    });
                    break;
                }
            }
        }
        return out;
    }

    async #summary(levels) {
        const lu = this.levelup;
        return Promise.all(
            levels.map(async n => {
                const level = lu.levels[n];
                const lines = [];
                for (const e of Object.values(level.achievements.experiences ?? {})) lines.push(L('LevelUp.Summary.NewExperience', { name: e.name }));
                if (level.achievements.proficiency) lines.push(L('LevelUp.Summary.Proficiency'));
                for (const c of Object.values(level.achievements.domainCards ?? {})) {
                    if (c.uuid) lines.push(L('LevelUp.Summary.Card', { name: (await fromUuid(c.uuid))?.name ?? '?' }));
                }
                for (const [option, boxes] of Object.entries(level.choices)) {
                    for (const box of Object.values(boxes)) {
                        let detail = '';
                        if (option === 'trait') detail = box.data.map(k => game.i18n.localize(CONFIG.DH.ACTOR.abilities[k]?.label ?? k)).join(', ');
                        else if (['domainCard', 'subclass', 'multiclass'].includes(option) && box.data[0]) detail = (await fromUuid(box.data[0]))?.name ?? '';
                        lines.push(`${L(`LevelUp.Detail.${option}`)}${detail ? `: ${detail}` : ''}`);
                    }
                }
                return { level: n, lines };
            })
        );
    }

    /* ---------- actions ---------- */

    static #onClose(event, target) {
        if (!this.levelup || target.dataset.confirmed) return this.close();
        this.element.querySelector('.dhet-wz-confirm')?.classList.add('open');
    }

    static #onCancelClose() {
        this.element.querySelector('.dhet-wz-confirm')?.classList.remove('open');
    }

    /** Pick the level to reach; the system keeps it as the actor's pending level (`levelData.level.changed`). */
    static async #onTarget(event, target) {
        await this.actor.updateLevel(Number(target.dataset.level));
        this.#build();
        this.render();
    }

    static async #onGotoLevel(event, target) {
        const n = Number(target.dataset.level);
        if (this.review) {
            this.review = false;
            await this.levelup.updateSource({ currentLevel: n });
            return this.render();
        }
        if (n < this.levelup.currentLevel) {
            await this.levelup.updateSource({ currentLevel: n });
            this.render();
        }
    }

    static async #onNext() {
        const lu = this.levelup;
        if (!lu.currentLevelFinished) return;
        if (lu.currentLevel >= lu.endLevel) this.review = true;
        else await lu.updateSource({ currentLevel: lu.currentLevel + 1 });
        this.render();
    }

    static async #onBack() {
        const lu = this.levelup;
        if (this.review) this.review = false;
        else if (lu.currentLevel > lu.startLevel) await lu.updateSource({ currentLevel: lu.currentLevel - 1 });
        this.render();
    }

    /** Take an advancement: the same entry the system's checkbox writes. */
    static async #onOption(event, target) {
        const lu = this.levelup;
        const key = target.dataset.option;
        const nr = target.dataset.nr;
        if (!key || !nr) return;
        const tierKey = this.#tierKey();
        const option = lu.tiers[tierKey].options[key];
        if (this.level.nrSelections.available < option.minCost) return ui.notifications.info(L('LevelUp.NoneLeft'));
        const entry = {
            tier: Number(tierKey),
            minCost: Number(option.minCost),
            amount: option.amount ? Number(option.amount) : null,
            value: option.value != null ? String(option.value) : undefined,
            type: option.type,
            subType: option.subType
        };
        if (option.type === 'domainCard') entry.secondaryData = { limit: Math.max(...lu.tiers[tierKey].belongingLevels) };
        await this.#update({ [`${this.path}.choices.${key}.${nr}`]: entry });
    }

    /** Give an advancement back (removing what was picked for it). */
    static async #onUnoption(event, target) {
        const key = target.dataset.option;
        const nr = target.dataset.nr;
        const choices = this.level.choices[key] ?? {};
        if (!key || !nr || !choices[nr]) return;
        const single = Number(choices[nr].minCost) > 1 || Object.keys(choices).length === 1;
        await this.#update(single ? { [`${this.path}.choices.${key}`]: _del } : { [`${this.path}.choices.${key}.${nr}`]: _del });
    }

    /** Toggle a value in a choice's `data` list (traits, experiences), up to its amount. */
    async #toggleData(path, value) {
        const box = foundry.utils.getProperty(this.levelup, path);
        if (!box) return;
        const data = [...box.data];
        const at = data.indexOf(value);
        if (at >= 0) data.splice(at, 1);
        else if (data.length < (box.amount ?? 1)) data.push(value);
        else return ui.notifications.info(L('LevelUp.PickedEnough'));
        await this.#update({ [`${path}.data`]: data });
    }

    static #onPickTrait(event, target) {
        return this.#toggleData(target.dataset.path, target.dataset.trait);
    }

    static #onPickExperience(event, target) {
        return this.#toggleData(target.dataset.path, target.dataset.id);
    }

    /** Fill a domain card slot (an achievement card's `uuid` or an advancement card's `data`). */
    static async #onPickCard(event, target) {
        const { slot, uuid } = target.dataset;
        const current = foundry.utils.getProperty(this.levelup, slot);
        const isData = slot.endsWith('.data');
        const already = isData ? current?.includes?.(uuid) : current === uuid;
        await this.#update({ [slot]: already ? (isData ? [] : null) : isData ? [uuid] : uuid });
    }

    static async #onPickUpgrade(event, target) {
        const { path, uuid, state, multiclass } = target.dataset;
        const box = foundry.utils.getProperty(this.levelup, path);
        const remove = box?.data.includes(uuid);
        await this.#update({
            [path]: { data: remove ? [] : [uuid], secondaryData: { featureState: String(state), isMulticlass: multiclass } }
        });
    }

    static async #onPickMulticlass(event, target) {
        const { path, uuid } = target.dataset;
        const box = foundry.utils.getProperty(this.levelup, path);
        const cleared = Object.keys(box?.secondaryData ?? {}).reduce((acc, k) => ((acc[k] = _del), acc), {});
        await this.#update({
            [path]: { tier: box.tier, minCost: box.minCost, amount: box.amount, value: box.value, type: box.type, data: uuid ? [uuid] : [], secondaryData: cleared }
        });
    }

    /** Choose the multiclass domain; achievement cards from a previously chosen domain are cleared (as the system does). */
    static async #onPickMultiDomain(event, target) {
        const { path, domain } = target.dataset;
        const box = foundry.utils.getProperty(this.levelup, path);
        const next = box.secondaryData.domain === domain ? null : domain;
        const update = { [`${path}.secondaryData.domain`]: next };
        if (box.secondaryData.domain) {
            for (const [key, card] of Object.entries(this.level.achievements.domainCards)) {
                if (card.uuid && fromUuidSync(card.uuid)?.system.domain === box.secondaryData.domain) {
                    update[`${this.path}.achievements.domainCards.${key}.uuid`] = null;
                }
            }
        }
        await this.#update(update);
    }

    static async #onPickMultiSubclass(event, target) {
        const { path, uuid } = target.dataset;
        const box = foundry.utils.getProperty(this.levelup, path);
        await this.#update({ [`${path}.secondaryData.subclass`]: box.secondaryData.subclass === uuid ? null : uuid });
    }

    async #onInput(event) {
        const input = event.currentTarget;
        const [kind, id] = input.dataset.dhetInput.split(':');
        if (kind === 'newExperience') {
            await this.#update({ [`${this.path}.achievements.experiences.${id}.name`]: input.value.trim() });
        }
    }

    /** The system's own level-up: the same payload its dialog's save sends. */
    static async #onFinish(event, target) {
        const lu = this.levelup;
        if (!lu?.allLevelsFinished) return;
        target.disabled = true;
        const data = Object.fromEntries(
            Object.entries(lu.levels)
                .filter(([k]) => Number(k) >= lu.startLevel)
                .map(([k, v]) => [k, v.toObject()])
        );
        try {
            await this.actor.levelUp(data);
        } catch (err) {
            console.error(`${MODULE_ID} | level up failed`, err);
            ui.notifications.error(L('LevelUp.Failed'));
            target.disabled = false;
            return;
        }
        await this.close();
        this.actor.sheet?.render({ force: true });
    }
}
