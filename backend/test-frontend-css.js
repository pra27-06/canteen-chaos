// test-frontend-css.js
// Regression assertions verifying CSS rules for CC-01 through CC-05.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const cssPath = path.join(__dirname, '..', 'frontend', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('Running frontend CSS regression tests...\n');

// -------------------------------------------------------------
// CC-01: Search suggestions stacking order
// -------------------------------------------------------------
console.log('Testing CC-01: Search suggestions z-index stacking order');
const searchWrapMatch = css.match(/\.search-wrap\s*\{[^}]*z-index:\s*(\d+)/);
assert(searchWrapMatch, 'Must define z-index on .search-wrap');
const searchZ = parseInt(searchWrapMatch[1], 10);
assert(searchZ >= 40, `search-wrap z-index (${searchZ}) must be at least 40 to appear above .cat-tabs (z-index 40)`);
console.log('  ok CC-01 passed');

// -------------------------------------------------------------
// CC-02: Dark mode readability (CSS theme variable)
// -------------------------------------------------------------
console.log('Testing CC-02: Dish body text theme variable');
const dishBodyMatch = css.match(/\.dish-body\s*\{[^}]*color:\s*([^;]+)/);
assert(dishBodyMatch, 'Must define color on .dish-body');
assert.strictEqual(dishBodyMatch[1].trim(), 'var(--ink)', 'dish-body must use var(--ink) instead of hardcoded hex');
console.log('  ok CC-02 passed');

// -------------------------------------------------------------
// CC-03: Mobile menu width & dish name wrapping
// -------------------------------------------------------------
console.log('Testing CC-03: Mobile dish name wrapping');
const mobileBlockMatch = css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]*?)\n\}/);
assert(mobileBlockMatch, 'Must find 760px media query');
assert(!mobileBlockMatch[1].includes('width: max-content'), 'Must not use width: max-content for dish names on mobile');
console.log('  ok CC-03 passed');

// -------------------------------------------------------------
// CC-04: Tablet pseudo-element overlay click blocking
// -------------------------------------------------------------
console.log('Testing CC-04: Tablet pseudo-element overlay pointer events');
const tabletBlockMatch = css.match(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/);
assert(tabletBlockMatch, 'Must find tablet media query');
assert(tabletBlockMatch[1].includes('pointer-events: none'), 'Tablet overlays must have pointer-events: none');
console.log('  ok CC-04 passed');

// -------------------------------------------------------------
// CC-05: Sticky filters on mobile without breaking overflow
// -------------------------------------------------------------
console.log('Testing CC-05: Sticky filters on mobile');
const phoneBlockMatch = css.match(/@media\s*\(max-width:\s*480px\)\s*\{([\s\S]*?)\n\}/);
assert(phoneBlockMatch, 'Must find 480px media query');
assert(!phoneBlockMatch[1].includes('.view { overflow-x: hidden; }'), '.view must not use overflow-x: hidden on phone as it breaks position: sticky');
console.log('  ok CC-05 passed');

console.log('\nAll frontend CSS regression tests passed successfully!');
