import { MODULE_ID } from '../rules.mjs';
import { L } from '../actor.mjs';
import { describe } from '../view.mjs';
import { actorPortrait, cardHtml, coreActive, coreThemeStyle, domainBanner, isArt, stepBackdrop, subclassCutout } from './art.mjs';
import { domainCards, loadCandidates, loadGear, subclassesOf, traitArray } from './data.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

export const STEPS = ['class', 'ancestry', 'community', 'traits', 'experiences', 'domains', 'equipment', 'background', 'review'];
const DOMAIN_CARDS = 2;
const TRAITS = () => Object.keys(CONFIG.DH.ACTOR.abilities);
const T = key => `modules/${MODULE_ID}/templates/wizard/${key}.hbs`;

/**
 * Full-screen character creation. Every choice is a click on a card instead of a drag; the result is written by
 * the system's own creation code, so the character comes out exactly as the built-in dialog would make it.
 */
export class CreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.step = 'class';
        /** Steps the player has been to (a step only shows as done once visited). */
        this.visited = new Set(['class']);
        this.candidates = null;
        this.descriptions = new Map();
        this.setup = {
            class: null,
            subclass: null,
            primaryAncestry: null,
            secondaryAncestry: null,
            mixedAncestry: false,
            ancestryName: '',
            community: null,
            traits: Object.fromEntries(TRAITS().map(t => [t, null])),
            experiences: [
                { id: foundry.utils.randomID(), name: '', description: '' },
                { id: foundry.utils.randomID(), name: '', description: '' }
            ],
            domainCards: [],
            /** Optional: characteristics and answers to the class's background and connection questions. */
            biography: {
                pronouns: '',
                age: '',
                faith: '',
                background: {},
                connections: {},
                /** The player's own questions: { id, question, answer }. */
                custom: { background: [], connections: [] }
            }
        };
        this.equipment = {
            mode: 'suggested',
            suggested: { primaryWeapon: null, secondaryWeapon: null, armor: null },
            custom: { primaryWeapon: null, secondaryWeapon: null, armor: null },
            choices: { take: [], choiceA: [], choiceB: [] },
            choiceA: null,
            choiceB: null,
            /** Custom gallery: which slot it fills, its search text and trait filter, and the loaded items. */
            slot: 'primaryWeapon',
            search: '',
            trait: '',
            gallery: null
        };
    }

    static DEFAULT_OPTIONS = {
        id: 'dhet-wizard-{id}',
        classes: ['dhet-wizard'],
        tag: 'div',
        // Not positioned: the stylesheet pins it over the whole screen, above Foundry's own interface.
        window: { frame: false, positioned: false },
        actions: {
            close: CreationWizard.#onClose,
            cancelClose: CreationWizard.#onCancelClose,
            goto: CreationWizard.#onGoto,
            next: CreationWizard.#onNext,
            back: CreationWizard.#onBack,
            pickSubclass: CreationWizard.#onPickSubclass,
            pickAncestry: CreationWizard.#onPickAncestry,
            toggleMixed: CreationWizard.#onToggleMixed,
            pickCommunity: CreationWizard.#onPickCommunity,
            setTrait: CreationWizard.#onSetTrait,
            suggestedTraits: CreationWizard.#onSuggestedTraits,
            clearTraits: CreationWizard.#onClearTraits,
            pickDomainCard: CreationWizard.#onPickDomainCard,
            equipmentMode: CreationWizard.#onEquipmentMode,
            selectSlot: CreationWizard.#onSelectSlot,
            pickGear: CreationWizard.#onPickGear,
            gearTrait: CreationWizard.#onGearTrait,
            clearSlot: CreationWizard.#onClearSlot,
            pickChoice: CreationWizard.#onPickChoice,
            openItem: CreationWizard.#onOpenItem,
            addQuestion: CreationWizard.#onAddQuestion,
            removeQuestion: CreationWizard.#onRemoveQuestion,
            finish: CreationWizard.#onFinish
        }
    };

    static PARTS = {
        main: { template: T('wizard'), scrollable: ['.dhet-wz-body'] }
    };

    get title() {
        return L('Wizard.Title', { actor: this.actor.name });
    }

    /* ---------- lifecycle ---------- */

    /** Load the cards once (Foundry prepares the context before any other render hook). */
    async #load() {
        if (this.candidates) return;
        this.candidates = await loadCandidates();
        // Start from whatever the sheet already has, like the built-in dialog does.
        const sys = this.actor.system;
        if (sys.class?.value) await this.#setClass(this.#candidate('class', sys.class.value) ?? sys.class.value);
        if (sys.class?.subclass) this.setup.subclass = this.#candidate('subclass', sys.class.subclass) ?? sys.class.subclass;
        if (sys.ancestry) this.setup.primaryAncestry = this.#candidate('ancestry', sys.ancestry) ?? sys.ancestry;
        if (sys.community) this.setup.community = this.#candidate('community', sys.community) ?? sys.community;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        for (const input of this.element.querySelectorAll('[data-dhet-input]')) {
            input.addEventListener('input', ev => this.#onInput(ev));
            input.addEventListener('change', ev => this.#onInput(ev, true));
        }
        this.element.querySelector('.dhet-wz-body')?.scrollTo?.({ top: this._scroll ?? 0 });
        if (this._focus) {
            const field = this.element.querySelector(`[data-dhet-input="${this._focus.key}"]`);
            if (field) {
                field.focus({ preventScroll: true });
                field.setSelectionRange?.(this._focus.at, this._focus.at);
            }
            this._focus = null;
        }
        this._scroll = 0;
    }

    async _preRender(context, options) {
        await super._preRender(context, options);
        this._scroll = this._keepScroll ? this.element?.querySelector('.dhet-wz-body')?.scrollTop ?? 0 : 0;
        // Keep focus in text fields across re-renders (a change event re-renders while Tab moves to the next field).
        const active = document.activeElement;
        this._focus = active?.dataset?.dhetInput && this.element?.contains(active)
            ? { key: active.dataset.dhetInput, at: active.selectionStart ?? active.value.length }
            : null;
        this._keepScroll = false;
    }

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        // Other windows (the sheet that opened us, chat pop-outs…) would sit on top: hide them meanwhile.
        document.body.classList.add('dhet-wizard-open');
    }

    async close(options = {}) {
        if (![...foundry.applications.instances.values()].some(a => a !== this && a instanceof CreationWizard && a.rendered)) {
            document.body.classList.remove('dhet-wizard-open');
        }
        return super.close(options);
    }

    /** Re-render, keeping the scroll position (picking a card shouldn't jump back to the top). */
    refresh() {
        this._keepScroll = true;
        return this.render();
    }

    /* ---------- helpers ---------- */

    /** The candidate (compendium document) an actor item came from, so it can be shown selected. */
    #candidate(type, item) {
        const source = item.sourceUuid ?? item._stats?.compendiumSource;
        return this.candidates[type].find(c => c.uuid === source || c.uuid === item.uuid) ?? null;
    }

    /** The system's tooltip card for a document (cached; rendering cards is not free). */
    async #cardOf(doc) {
        const key = `card:${doc.uuid}`;
        if (!this.descriptions.has(key)) this.descriptions.set(key, await cardHtml(doc));
        return this.descriptions.get(key);
    }

    async #describe(doc) {
        if (!this.descriptions.has(doc.uuid)) {
            this.descriptions.set(doc.uuid, await describe(doc.name, doc.system.description, doc));
        }
        return this.descriptions.get(doc.uuid);
    }

    async #setClass(cls) {
        if (this.setup.class?.uuid !== cls.uuid) {
            this.setup.subclass = null;
            this.setup.domainCards = [];
        }
        this.setup.class = cls;
        const [gear, choices] = await Promise.all([
            cls.system.fetchSuggestedGear?.() ?? {},
            cls.system.fetchInventoryChoices?.() ?? {}
        ]);
        this.equipment.suggested = {
            primaryWeapon: gear.primaryWeapon ?? null,
            secondaryWeapon: gear.secondaryWeapon ?? null,
            armor: gear.armor ?? null
        };
        this.equipment.custom = { ...this.equipment.suggested };
        this.equipment.choices = {
            take: (choices.take ?? []).filter(Boolean),
            choiceA: (choices.choiceA ?? []).filter(Boolean),
            choiceB: (choices.choiceB ?? []).filter(Boolean)
        };
        this.equipment.choiceA = null;
        this.equipment.choiceB = null;
    }

    /** Equipment that will be created: the class's suggestions or the custom picks. */
    get gear() {
        return this.equipment.mode === 'custom' ? this.equipment.custom : this.equipment.suggested;
    }

    /** Whether a step's requirements are met. */
    complete(step) {
        const s = this.setup;
        switch (step) {
            case 'class':
                return !!(s.class && s.subclass);
            case 'ancestry':
                return !!(s.primaryAncestry && (!s.mixedAncestry || s.secondaryAncestry));
            case 'community':
                return !!s.community;
            case 'traits':
                return Object.values(s.traits).every(v => v !== null);
            case 'experiences':
                return s.experiences.every(e => e.name.trim());
            case 'domains':
                return s.domainCards.length === DOMAIN_CARDS;
            default:
                return true;
        }
    }

    /** A step can be opened once every step before it is complete. */
    reachable(step) {
        return STEPS.slice(0, STEPS.indexOf(step)).every(s => this.complete(s));
    }

    /** Values still free in the trait array, as counts by value. */
    #freeTraitValues() {
        const free = new Map();
        for (const v of traitArray()) free.set(v, (free.get(v) ?? 0) + 1);
        for (const v of Object.values(this.setup.traits)) if (v !== null) free.set(v, (free.get(v) ?? 0) - 1);
        return free;
    }

    /* ---------- context ---------- */

    async _prepareContext(options) {
        await this.#load();
        const context = await super._prepareContext(options);
        const step = this.step;
        const index = STEPS.indexOf(step);
        const s = this.setup;

        const selectedArt =
            {
                class: s.subclass?.img,
                ancestry: s.primaryAncestry?.img,
                community: s.community?.img
            }[step] ?? null;
        // The character's own art (if set) is the backdrop throughout; otherwise what was just picked, or splash art.
        const backdrop = actorPortrait(this.actor) ?? (isArt(selectedArt) ? selectedArt : stepBackdrop(step));

        const stepContext = await this.#stepContext(step);
        const stepHtml = await foundry.applications.handlebars.renderTemplate(T(`step-${step}`), {
            ...stepContext,
            setup: s
        });

        return {
            ...context,
            actorName: this.actor.name,
            core: coreActive(),
            themeStyle: (this._theme ??= coreThemeStyle(this.actor)),
            backdrop,
            step,
            stepTitle: L(`Wizard.Step.${step}.Title`),
            stepHint: L(`Wizard.Step.${step}.Hint`),
            stepHtml,
            steps: STEPS.map((id, i) => ({
                id,
                number: i + 1,
                label: L(`Wizard.Step.${id}.Label`),
                current: id === step,
                done: id !== 'review' && this.visited.has(id) && id !== step && this.complete(id),
                locked: !this.reachable(id)
            })),
            summary: this.#summary(),
            canBack: index > 0,
            canNext: this.complete(step),
            isLast: step === 'review',
            nextLabel: index < STEPS.length - 1 ? L(`Wizard.Step.${STEPS[index + 1]}.Label`) : null
        };
    }

    /** The little "so far" panel under the stepper. */
    #summary() {
        const s = this.setup;
        const portrait = actorPortrait(this.actor);
        return {
            // The character's own portrait wins over the subclass cutout.
            portrait,
            cutout: portrait ? null : subclassCutout(s.subclass),
            art: isArt(s.subclass?.img) ? s.subclass.img : null,
            lines: [
                s.class && `${s.class.name}${s.subclass ? ` · ${s.subclass.name}` : ''}`,
                s.primaryAncestry && this.#ancestryName(),
                s.community?.name
            ].filter(Boolean)
        };
    }

    #ancestryName() {
        const s = this.setup;
        if (s.ancestryName.trim()) return s.ancestryName.trim();
        if (s.mixedAncestry && s.secondaryAncestry) return `${s.primaryAncestry.name}/${s.secondaryAncestry.name}`;
        return s.primaryAncestry?.name ?? '';
    }

    async #card(doc, { selected = false, action, extra = {} } = {}) {
        return {
            uuid: doc.uuid,
            name: doc.name,
            img: doc.img,
            hasArt: isArt(doc.img),
            selected,
            action,
            card: await this.#cardOf(doc),
            tooltip: await this.#describe(doc),
            ...extra
        };
    }

    async #stepContext(step) {
        const s = this.setup;
        const c = this.candidates;
        const domainsConfig = CONFIG.DH.DOMAIN.allDomains?.() ?? CONFIG.DH.DOMAIN.domains ?? {};
        const domainLabel = d => game.i18n.localize(domainsConfig[d]?.label ?? d);

        switch (step) {
            case 'class': {
                // No separate class pick: each class labels its subclass cards, and a subclass brings its class.
                const groups = await Promise.all(
                    c.class.map(async cls => ({
                        uuid: cls.uuid,
                        name: cls.name,
                        selected: s.class?.uuid === cls.uuid,
                        domainList: (cls.system.domains ?? []).map(d => ({ label: domainLabel(d), icon: domainsConfig[d]?.src })),
                        hp: cls.system.hitPoints,
                        evasion: cls.system.evasion,
                        tooltip: await this.#describe(cls),
                        subclasses: await Promise.all(
                            subclassesOf(cls, c).map(sub =>
                                this.#card(sub, { selected: s.subclass?.uuid === sub.uuid, action: 'pickSubclass' })
                            )
                        )
                    }))
                );
                return { groups: groups.filter(g => g.subclasses.length) };
            }
            case 'ancestry': {
                const ancestries = await Promise.all(
                    c.ancestry.map(a =>
                        this.#card(a, {
                            selected: s.primaryAncestry?.uuid === a.uuid,
                            action: 'pickAncestry',
                            extra: { second: s.secondaryAncestry?.uuid === a.uuid }
                        })
                    )
                );
                return {
                    ancestries,
                    mixed: s.mixedAncestry,
                    primaryName: s.primaryAncestry?.name,
                    secondaryName: s.secondaryAncestry?.name,
                    ancestryName: s.ancestryName,
                    ancestryNamePlaceholder:
                        s.primaryAncestry && s.secondaryAncestry
                            ? `${s.primaryAncestry.name}/${s.secondaryAncestry.name}`
                            : L('Wizard.Ancestry.NamePlaceholder')
                };
            }
            case 'community':
                return {
                    communities: await Promise.all(
                        c.community.map(x => this.#card(x, { selected: s.community?.uuid === x.uuid, action: 'pickCommunity' }))
                    )
                };
            case 'traits': {
                const free = this.#freeTraitValues();
                const values = [...new Set(traitArray())].sort((a, b) => b - a);
                const suggested = s.class?.system.characterGuide?.suggestedTraits ?? null;
                const fmt = v => (v > 0 ? `+${v}` : `${v}`);
                return {
                    pool: traitArray()
                        .sort((a, b) => b - a)
                        .map((v, i, all) => {
                            // Mark as many copies of each value used as are assigned.
                            const used = Object.values(s.traits).filter(x => x === v).length;
                            const nth = all.slice(0, i + 1).filter(x => x === v).length;
                            return { label: fmt(v), used: nth <= used };
                        }),
                    traits: TRAITS().map(key => {
                        const cfg = CONFIG.DH.ACTOR.abilities[key];
                        const current = s.traits[key];
                        return {
                            key,
                            label: game.i18n.localize(cfg.label),
                            verbs: (cfg.verbs ?? []).map(v => game.i18n.localize(v)).join(' · '),
                            value: current === null ? null : fmt(current),
                            suggested: suggested?.[key] != null ? fmt(suggested[key]) : null,
                            options: values.map(v => ({
                                value: v,
                                label: fmt(v),
                                selected: current === v,
                                disabled: current !== v && !(free.get(v) > 0)
                            }))
                        };
                    }),
                    hasSuggestion: !!suggested && Object.values(suggested).some(v => v !== null && v !== undefined),
                    className: s.class?.name
                };
            }
            case 'experiences':
                return {
                    experiences: s.experiences.map((e, i) => ({ ...e, number: i + 1 })),
                    examples: L('Wizard.Experiences.Examples')
                };
            case 'domains': {
                const chosen = new Set(s.domainCards.map(d => d.uuid));
                const columns = await Promise.all(
                    (s.class?.system.domains ?? []).map(async domain => ({
                        id: domain,
                        label: domainLabel(domain),
                        banner: domainBanner(domain),
                        icon: domainsConfig[domain]?.src,
                        color: domainsConfig[domain]?.color,
                        cards: await Promise.all(
                            domainCards(domain, c).map(card =>
                                this.#card(card, {
                                    selected: chosen.has(card.uuid),
                                    action: 'pickDomainCard',
                                    extra: {
                                        glow: domainsConfig[domain]?.color ?? null,
                                        level: card.system.level,
                                        type: card.system.type
                                            ? game.i18n.localize(CONFIG.DH.DOMAIN.cardTypes?.[card.system.type]?.label ?? card.system.type)
                                            : null,
                                        recall: card.system.recallCost
                                    }
                                })
                            )
                        )
                    }))
                );
                return { columns, count: s.domainCards.length, max: DOMAIN_CARDS };
            }
            case 'equipment': {
                const gear = this.gear;
                const slot = (key, item) => ({
                    key,
                    label: L(`Wizard.Equipment.${key}`),
                    item: item ? { uuid: item.uuid, name: item.name, img: item.img, info: gearInfo(item) } : null,
                    custom: this.equipment.mode === 'custom',
                    blocked: key === 'secondaryWeapon' && gear.primaryWeapon?.system.burden === 'twoHanded'
                });
                const choice = key =>
                    this.equipment.choices[key].map(item => ({
                        uuid: item.uuid,
                        name: item.name,
                        img: item.img,
                        key,
                        selected: this.equipment[key]?.uuid === item.uuid
                    }));
                const eq = this.equipment;
                let gallery = null;
                if (eq.mode === 'custom') {
                    eq.gallery ??= await loadGear();
                    const blocked = eq.slot === 'secondaryWeapon' && gear.primaryWeapon?.system.burden === 'twoHanded';
                    const search = eq.search.trim().toLowerCase();
                    const items = (eq.gallery[eq.slot] ?? []).filter(
                        i =>
                            (!search || i.name.toLowerCase().includes(search)) &&
                            (!eq.trait || i.system.attack?.roll?.trait === eq.trait)
                    );
                    gallery = {
                        slot: eq.slot,
                        slotLabel: L(`Wizard.Equipment.${eq.slot}`),
                        blocked,
                        search: eq.search,
                        weapon: eq.slot !== 'armor',
                        traits: [{ key: '', label: L('Wizard.Equipment.AnyTrait'), selected: !eq.trait }].concat(
                            TRAITS().map(t => ({
                                key: t,
                                label: game.i18n.localize(CONFIG.DH.ACTOR.abilities[t].label),
                                selected: eq.trait === t
                            }))
                        ),
                        items: items.map(i => ({
                            uuid: i.uuid,
                            name: i.name,
                            img: i.img,
                            info: gearInfo(i),
                            selected: gear[eq.slot]?.uuid === i.uuid,
                            tooltip: this.descriptions.get(i.uuid) ?? null
                        }))
                    };
                    // Tooltips for the visible items (cached after the first time).
                    for (const [n, i] of items.entries()) gallery.items[n].tooltip = await this.#describe(i);
                }
                return {
                    currency: startingCurrency(this.actor),
                    gallery,
                    activeSlot: eq.slot,
                    mode: this.equipment.mode,
                    slots: [
                        slot('primaryWeapon', gear.primaryWeapon),
                        slot('secondaryWeapon', gear.primaryWeapon?.system.burden === 'twoHanded' ? null : gear.secondaryWeapon),
                        slot('armor', gear.armor)
                    ],
                    choiceA: choice('choiceA'),
                    choiceB: choice('choiceB'),
                    take: this.equipment.choices.take.map(i => ({ uuid: i.uuid, name: i.name, img: i.img }))
                };
            }
            case 'background': {
                const bio = s.biography;
                const questions = (list, kind) =>
                    (list ?? []).filter(q => q?.trim()).map((question, i) => ({ question, key: `${kind}:${i}`, answer: bio[kind][i] ?? '' }));
                return {
                    pronouns: bio.pronouns,
                    age: bio.age,
                    faith: bio.faith,
                    className: s.class?.name,
                    background: questions(s.class?.system.backgroundQuestions, 'background'),
                    connections: questions(s.class?.system.connections, 'connections'),
                    customBackground: bio.custom.background,
                    customConnections: bio.custom.connections
                };
            }
            case 'review': {
                const fmt = v => (v > 0 ? `+${v}` : `${v}`);
                const gear = this.gear;
                return {
                    cutout: subclassCutout(s.subclass),
                    // The header shows where you come from (the community's art, blurred) behind your subclass portrait.
                    heroArt: [s.community?.img, s.subclass?.img].find(isArt) ?? null,
                    className: s.class?.name,
                    subclassName: s.subclass?.name,
                    ancestry: s.primaryAncestry && { name: this.#ancestryName(), img: s.primaryAncestry.img },
                    community: s.community && { name: s.community.name, img: s.community.img },
                    traits: TRAITS().map(key => ({
                        label: game.i18n.localize(CONFIG.DH.ACTOR.abilities[key].label),
                        value: s.traits[key] === null ? '—' : fmt(s.traits[key])
                    })),
                    experiences: s.experiences.map(e => e.name),
                    domainCards: s.domainCards.map(d => ({ name: d.name, img: d.img })),
                    hand: (
                        await Promise.all(
                            [s.subclass, s.primaryAncestry, s.mixedAncestry ? s.secondaryAncestry : null, s.community, ...s.domainCards]
                                .filter(Boolean)
                                .map(d => this.#cardOf(d))
                        )
                    ).filter(Boolean),
                    gear: [gear.primaryWeapon, gear.primaryWeapon?.system.burden === 'twoHanded' ? null : gear.secondaryWeapon, gear.armor, this.equipment.choiceA, this.equipment.choiceB, ...this.equipment.choices.take]
                        .filter(Boolean)
                        .map(i => ({ name: i.name, img: i.img }))
                };
            }
        }
        return {};
    }

    /* ---------- actions ---------- */

    /** Closing loses the choices, so ask first (inside the wizard: a dialog window would open behind it). */
    static #onClose(event, target) {
        if (!this.setup.class || target.dataset.confirmed) return this.close();
        this.element.querySelector('.dhet-wz-confirm')?.classList.add('open');
    }

    static #onCancelClose() {
        this.element.querySelector('.dhet-wz-confirm')?.classList.remove('open');
    }

    static #onGoto(event, target) {
        const step = target.dataset.step;
        if (!STEPS.includes(step) || !this.reachable(step)) return;
        this.step = step;
        this.visited.add(step);
        this.render();
    }

    static #onNext() {
        if (!this.complete(this.step)) return;
        const next = STEPS[STEPS.indexOf(this.step) + 1];
        if (next) {
            this.step = next;
            this.visited.add(next);
            this.render();
        }
    }

    static #onBack() {
        const prev = STEPS[STEPS.indexOf(this.step) - 1];
        if (prev) {
            this.step = prev;
            this.render();
        }
    }

    /** Picking a subclass also picks its class (the class is only a heading over its subclasses). */
    static async #onPickSubclass(event, target) {
        const sub = this.candidates.subclass.find(x => x.uuid === target.dataset.uuid);
        if (!sub) return;
        const cls = this.candidates.class.find(x => (x.sourceUuid ?? x.uuid) === sub.system.linkedClass);
        if (!cls) return;
        if (this.setup.class?.uuid !== cls.uuid) await this.#setClass(cls);
        this.setup.subclass = this.setup.subclass?.uuid === sub.uuid ? null : sub;
        this.refresh();
    }

    static #onPickAncestry(event, target) {
        const a = this.candidates.ancestry.find(x => x.uuid === target.dataset.uuid);
        if (!a) return;
        const s = this.setup;
        if (!s.mixedAncestry) {
            s.primaryAncestry = a;
        } else if (s.primaryAncestry?.uuid === a.uuid) {
            s.primaryAncestry = s.secondaryAncestry;
            s.secondaryAncestry = null;
        } else if (s.secondaryAncestry?.uuid === a.uuid) {
            s.secondaryAncestry = null;
        } else if (!s.primaryAncestry) {
            s.primaryAncestry = a;
        } else {
            s.secondaryAncestry = a;
        }
        this.refresh();
    }

    static #onToggleMixed() {
        this.setup.mixedAncestry = !this.setup.mixedAncestry;
        if (!this.setup.mixedAncestry) {
            this.setup.secondaryAncestry = null;
            this.setup.ancestryName = '';
        }
        this.refresh();
    }

    static #onPickCommunity(event, target) {
        this.setup.community = this.candidates.community.find(x => x.uuid === target.dataset.uuid) ?? null;
        this.refresh();
    }

    static #onSetTrait(event, target) {
        const { trait } = target.dataset;
        const value = Number(target.dataset.value);
        if (!(trait in this.setup.traits)) return;
        this.setup.traits[trait] = this.setup.traits[trait] === value ? null : value;
        this.refresh();
    }

    static #onSuggestedTraits() {
        const suggested = this.setup.class?.system.characterGuide?.suggestedTraits;
        if (!suggested) return;
        for (const key of TRAITS()) this.setup.traits[key] = suggested[key] ?? null;
        this.refresh();
    }

    static #onClearTraits() {
        for (const key of TRAITS()) this.setup.traits[key] = null;
        this.refresh();
    }

    static #onPickDomainCard(event, target) {
        const card = this.candidates.domainCard.find(x => x.uuid === target.dataset.uuid);
        if (!card) return;
        const list = this.setup.domainCards;
        const at = list.findIndex(d => d.uuid === card.uuid);
        if (at >= 0) list.splice(at, 1);
        else if (list.length < DOMAIN_CARDS) list.push(card);
        else ui.notifications.info(L('Wizard.Domains.Full', { max: DOMAIN_CARDS }));
        this.refresh();
    }

    static #onEquipmentMode(event, target) {
        this.equipment.mode = target.dataset.mode === 'custom' ? 'custom' : 'suggested';
        this.refresh();
    }

    /** Custom equipment: the gallery below the slots fills the selected slot. */
    static #onSelectSlot(event, target) {
        const key = target.dataset.slot;
        if (!['primaryWeapon', 'secondaryWeapon', 'armor'].includes(key)) return;
        this.equipment.slot = key;
        this.equipment.search = '';
        this.equipment.trait = '';
        this.refresh();
    }

    static #onPickGear(event, target) {
        const eq = this.equipment;
        const item = eq.gallery?.[eq.slot]?.find(i => i.uuid === target.dataset.uuid);
        if (!item) return;
        if (eq.slot === 'secondaryWeapon' && eq.custom.primaryWeapon?.system.burden === 'twoHanded') {
            return ui.notifications.warn(L('Wizard.Equipment.TwoHanded'));
        }
        eq.custom[eq.slot] = eq.custom[eq.slot]?.uuid === item.uuid ? null : item;
        if (eq.slot === 'primaryWeapon' && item.system.burden === 'twoHanded') eq.custom.secondaryWeapon = null;
        this.refresh();
    }

    static #onGearTrait(event, target) {
        this.equipment.trait = target.dataset.trait ?? '';
        this.refresh();
    }

    static #onClearSlot(event, target) {
        this.equipment.custom[target.dataset.slot] = null;
        this.refresh();
    }

    static #onPickChoice(event, target) {
        const { key, uuid } = target.dataset;
        const item = this.equipment.choices[key]?.find(i => i.uuid === uuid);
        this.equipment[key] = this.equipment[key]?.uuid === uuid ? null : item ?? null;
        this.refresh();
    }

    /** A question of the player's own, under the class's background or connection questions. */
    static async #onAddQuestion(event, target) {
        const list = this.setup.biography.custom[target.dataset.list];
        if (!list) return;
        const id = foundry.utils.randomID();
        list.push({ id, question: '', answer: '' });
        await this.refresh();
        this.element.querySelector(`[data-dhet-input="customQuestion:${target.dataset.list}|${id}"]`)?.focus();
    }

    static #onRemoveQuestion(event, target) {
        const list = this.setup.biography.custom[target.dataset.list];
        const at = list?.findIndex(e => e.id === target.dataset.id) ?? -1;
        if (at >= 0) list.splice(at, 1);
        this.refresh();
    }

    static async #onOpenItem(event, target) {
        (await fromUuid(target.dataset.uuid))?.sheet?.render({ force: true });
    }

    #onInput(event, commit = false) {
        const input = event.currentTarget;
        const [kind, id] = input.dataset.dhetInput.split(':');
        if (kind === 'experience' || kind === 'experienceDescription') {
            const exp = this.setup.experiences.find(e => e.id === id);
            if (exp) exp[kind === 'experience' ? 'name' : 'description'] = input.value;
        } else if (['pronouns', 'age', 'faith'].includes(kind)) {
            this.setup.biography[kind] = input.value;
        } else if (kind === 'background' || kind === 'connections') {
            this.setup.biography[kind][id] = input.value;
        } else if (kind === 'customQuestion' || kind === 'customAnswer') {
            const [list, entryId] = id.split('|');
            const entry = this.setup.biography.custom[list]?.find(e => e.id === entryId);
            if (entry) entry[kind === 'customQuestion' ? 'question' : 'answer'] = input.value;
        } else if (kind === 'ancestryName') {
            this.setup.ancestryName = input.value;
        } else if (kind === 'gearSearch') {
            this.equipment.search = input.value;
            // Filter the gallery as you type, keeping focus in the search box.
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(async () => {
                await this.refresh();
                const box = this.element.querySelector('[data-dhet-input="gearSearch"]');
                box?.focus();
                box?.setSelectionRange(box.value.length, box.value.length);
            }, 200);
            return;
        }
        // No re-render for text: it would replace the field Tab is moving focus to. Only the footer needs to follow.
        const next = this.element.querySelector('[data-action="next"]');
        if (next) next.disabled = !this.complete(this.step);
    }

    /**
     * Create the character with the system's own creation code (DhCharacterCreation.finish), fed the choices
     * in the shape it expects, so items, features and links come out exactly as with the built-in dialog.
     */
    static async #onFinish(event, target) {
        if (!STEPS.slice(0, -1).every(s => this.complete(s))) return;
        target.disabled = true;
        const s = this.setup;
        const gear = this.gear;
        const twoHanded = gear.primaryWeapon?.system.burden === 'twoHanded';
        const name = this.#ancestryName();
        const system = {
            character: this.actor,
            setup: {
                traits: Object.fromEntries(TRAITS().map(k => [k, { value: s.traits[k] }])),
                ancestryName: {
                    primary: s.primaryAncestry.name,
                    secondary: s.mixedAncestry ? s.secondaryAncestry?.name ?? '' : '',
                    overwrite: s.ancestryName.trim() ? name : undefined
                },
                mixedAncestry: s.mixedAncestry,
                primaryAncestry: s.primaryAncestry,
                secondaryAncestry: s.mixedAncestry && s.secondaryAncestry ? s.secondaryAncestry : {},
                community: s.community,
                class: s.class,
                subclass: s.subclass,
                experiences: Object.fromEntries(
                    s.experiences.map(e => [e.id, { name: e.name.trim(), value: 2, description: e.description.trim(), core: true }])
                ),
                domainCards: Object.fromEntries(s.domainCards.map(d => [foundry.utils.randomID(), d]))
            },
            equipment: {
                armor: gear.armor ?? {},
                primaryWeapon: gear.primaryWeapon ?? {},
                secondaryWeapon: (!twoHanded && gear.secondaryWeapon) || {},
                inventory: { take: {}, choiceA: this.equipment.choiceA ?? {}, choiceB: this.equipment.choiceB ?? {} }
            },
            close: () => {}
        };
        try {
            const Creation = game.system.api.applications.characterCreation.CharacterCreation;
            await Creation.finish.call(system, event, { disabled: false });
        } catch (err) {
            console.error(`${MODULE_ID} | character creation failed`, err);
            ui.notifications.error(L('Wizard.Failed'));
            target.disabled = false;
            return;
        }
        await this.#writeBiography().catch(err => console.warn(`${MODULE_ID} | biography not written`, err));
        await this.close();
        this.actor.sheet?.render({ force: true });
    }

    /**
     * The system puts the class's background and connection questions into the biography when the class is
     * added; write them again with the answers given here beneath each one, plus the characteristics.
     */
    async #writeBiography() {
        const bio = this.setup.biography;
        const esc = foundry.utils.escapeHTML;
        const paragraph = a => (a ? `<p>${esc(a).replace(/\n/g, '<br>')}</p>` : '');
        const answered = (list, answers, custom) => {
            const questions = (list ?? []).filter(q => q?.trim());
            const own = custom.filter(e => e.question.trim());
            if (!questions.some((q, i) => answers[i]?.trim()) && !own.length) return null;
            return [
                ...questions.map((q, i) => `<p><strong>${q}</strong></p>${paragraph(answers[i]?.trim())}`),
                ...own.map(e => `<p><strong>${esc(e.question.trim())}</strong></p>${paragraph(e.answer.trim())}`)
            ].join('');
        };
        const update = {};
        const background = answered(this.setup.class?.system.backgroundQuestions, bio.background, bio.custom.background);
        const connections = answered(this.setup.class?.system.connections, bio.connections, bio.custom.connections);
        if (background !== null) update['system.biography.background'] = background;
        if (connections !== null) update['system.biography.connections'] = connections;
        for (const key of ['pronouns', 'age', 'faith']) {
            if (bio[key].trim()) update[`system.biography.characteristics.${key}`] = bio[key].trim();
        }
        if (Object.keys(update).length) await this.actor.update(update);
    }
}

/** Starting currency from the system's (homebrew) currency settings: enabled denominations with a starting amount. */
function startingCurrency(actor) {
    let currency = null;
    try {
        currency = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew)?.currency;
    } catch {
        /* no homebrew settings */
    }
    const order = ['chests', 'bags', 'handfuls', 'coins'];
    return order
        .map(key => {
            const cfg = currency?.[key];
            if (cfg && cfg.enabled === false) return null;
            const amount = actor.system.gold?.[key] ?? cfg?.initialAmount ?? 0;
            if (!amount) return null;
            return { amount, label: cfg?.label ?? key, icon: cfg?.icon || 'fa-solid fa-coins', title: currency?.title ?? 'Gold' };
        })
        .filter(Boolean);
}

/** Short stats line for a weapon or armor (damage moved from `damage.parts` to `damage.main` in system 2.13). */
function gearInfo(item) {
    const sys = item.system;
    const loc = (cfg, key) => (cfg?.[key]?.label ? game.i18n.localize(cfg[key].label) : key);
    if (item.type === 'armor') {
        const t = sys.baseThresholds;
        const score = sys.armor?.max ?? sys.baseScore;
        return [
            t ? `${L('Wizard.Equipment.Thresholds')} ${t.major}/${t.severe}` : null,
            score != null ? `${L('Wizard.Equipment.Score')} ${score}` : null
        ]
            .filter(Boolean)
            .join(' · ');
    }
    const attack = sys.attack ?? {};
    const damage = attack.damage?.main?.value ?? attack.damage?.parts?.[0]?.value ?? null;
    const dice = damage?.dice ? `${damage.multiplier === 'prof' ? '' : damage.flatMultiplier ?? ''}${damage.dice}${damage.bonus ? `+${damage.bonus}` : ''}` : null;
    const type = (attack.damage?.main?.type ?? attack.damage?.parts?.[0]?.type ?? [])[0];
    return [
        attack.roll?.trait ? loc(CONFIG.DH.ACTOR.abilities, attack.roll.trait) : null,
        attack.range ? loc(CONFIG.DH.GENERAL.range, attack.range) : null,
        dice ? `${dice}${type ? ` ${type === 'magical' ? L('Wizard.Equipment.Mag') : L('Wizard.Equipment.Phy')}` : ''}` : null,
        sys.burden ? loc(CONFIG.DH.GENERAL.burden, sys.burden) : null
    ]
        .filter(Boolean)
        .join(' · ');
}
