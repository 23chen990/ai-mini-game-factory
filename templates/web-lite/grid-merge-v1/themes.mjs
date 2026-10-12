/** Presentation only. Both themes deliberately use identical engine rules. */
export const THEMES = Object.freeze({
  observatory: Object.freeze({ name: 'Lumen', eyebrow: 'A SMALL SPACE TO THINK', subtitle: 'Small moves. Brighter ideas.', unit: 'light', badge: 'Observatory' }),
  orchard: Object.freeze({ name: 'Grove', eyebrow: 'GROW SOMETHING GOOD', subtitle: 'Make room for something bigger.', unit: 'growth', badge: 'Orchard' }),
});
export function resolveTheme(value) { return value === 'orchard' ? 'orchard' : 'observatory'; }
