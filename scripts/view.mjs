import { MODULE_ID } from './rules.mjs';

/**
 * A feature's description as tooltip HTML: name, then the enriched text. Goes in `data-tooltip-html`
 * (Handlebars escapes it into the attribute; the browser decodes it back).
 */
export async function describe(name, html, relativeTo) {
    const body = html
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo })
        : '';
    const title = foundry.utils.escapeHTML(name);
    return `<div class="dhet-tip"><strong>${title}</strong>${body}</div>`;
}

export const TEMPLATES = ['stances', 'lunar', 'hex', 'warlock', 'mark', 'poison', 'patterns', 'unstoppable'].map(
    name => `modules/${MODULE_ID}/templates/${name}.hbs`
);

export function preloadTemplates() {
    return foundry.applications.handlebars.loadTemplates(TEMPLATES);
}
