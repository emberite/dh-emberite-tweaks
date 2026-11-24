import { MODULE_ID } from './rules.mjs';

/** Rich text reduced to a single plain line for tooltips. */
export function plainText(html, max = 300) {
    const div = document.createElement('div');
    div.innerHTML = html ?? '';
    const text = (div.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const TEMPLATES = ['stances', 'lunar', 'hex', 'warlock', 'mark', 'poison', 'patterns', 'unstoppable'].map(
    name => `modules/${MODULE_ID}/templates/${name}.hbs`
);

export function preloadTemplates() {
    return foundry.applications.handlebars.loadTemplates(TEMPLATES);
}
