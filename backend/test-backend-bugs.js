// test-backend-bugs.js
// Regression unit tests for bugs CC-06, CC-07, CC-08, CC-09, CC-10.
const assert = require('assert');
const { validateLine, reserveStock, releaseStock } = require('./logic/validation');
const { applyCoupon } = require('./logic/pricing');
const { paginate, sortDishes } = require('./logic/search');
const statusLogic = require('./logic/status');

console.log('Running backend bugs regression tests...\n');

// -------------------------------------------------------------
// CC-06: Stock validation (order qty vs stock & atomicity)
// -------------------------------------------------------------
console.log('Testing CC-06: Stock validation & Atomicity');
const sampleMenu = [
  { id: 1, name: 'Samosa', price: 20, stock: 2, disabled: false, slot: 'allday' },
  { id: 2, name: 'Chai', price: 10, stock: 5, disabled: false, slot: 'allday' },
];
const now = new Date('2026-10-10T12:00:00Z');

// 1. Order qty exceeding available stock must be rejected in validateLine
const overErrors = validateLine({ dishId: 1, qty: 5 }, 0, sampleMenu, now, new Set());
assert(overErrors.length > 0, 'Should reject qty > stock');
assert(overErrors.some((e) => /Only 2 left for Samosa/i.test(e)), 'Error should mention stock limit');

// 2. Order qty within available stock must be accepted in validateLine
const validErrors = validateLine({ dishId: 1, qty: 2 }, 0, sampleMenu, now, new Set());
assert.strictEqual(validErrors.length, 0, 'Should accept qty <= stock');

// 3. Atomicity: If item 1 has enough stock but item 2 fails, item 1 MUST NOT be modified
const multiItemMenu = [
  { id: 10, name: 'Dish 10', price: 50, stock: 10 },
  { id: 20, name: 'Dish 20', price: 50, stock: 2 },
];
const partialFail = reserveStock(
  [
    { dishId: 10, qty: 5 }, // valid (has 10)
    { dishId: 20, qty: 5 }, // invalid (has 2)
  ],
  multiItemMenu
);
assert.strictEqual(partialFail.ok, false, 'reserveStock must fail when any item exceeds stock');
assert.strictEqual(
  partialFail.menu.find((d) => d.id === 10).stock,
  10,
  'Item 10 stock must remain 10 in returned menu on failure'
);
assert.strictEqual(multiItemMenu[0].stock, 10, 'Input menu must not be mutated');

// 4. Duplicate lines for the same dish exceeding total stock must fail atomically
const duplicateMenu = [{ id: 30, name: 'Dish 30', price: 40, stock: 5 }];
const dupFail = reserveStock(
  [
    { dishId: 30, qty: 3 },
    { dishId: 30, qty: 3 }, // total 6 > 5
  ],
  duplicateMenu
);
assert.strictEqual(dupFail.ok, false, 'Duplicate lines exceeding total stock must fail');
assert.strictEqual(dupFail.menu.find((d) => d.id === 30).stock, 5, 'Stock must not decrement on duplicate failure');

// 5. Duplicate lines within total stock must succeed
const dupOk = reserveStock(
  [
    { dishId: 30, qty: 2 },
    { dishId: 30, qty: 2 }, // total 4 <= 5
  ],
  duplicateMenu
);
assert.strictEqual(dupOk.ok, true, 'Duplicate lines within total stock must succeed');
assert.strictEqual(dupOk.menu.find((d) => d.id === 30).stock, 1, 'Stock must be correctly decremented to 1');

// 6. Normal stock reservation succeeds when all items are available
const reserveOk = reserveStock([{ dishId: 1, qty: 2 }], sampleMenu);
assert.strictEqual(reserveOk.ok, true, 'reserveStock must succeed when qty <= stock');
assert.strictEqual(reserveOk.menu.find((d) => d.id === 1).stock, 0, 'Stock decremented to 0');
console.log('  ok CC-06 passed');

// -------------------------------------------------------------
// CC-07: Stock restoration on cancellation & Double-cancellation guard
// -------------------------------------------------------------
console.log('Testing CC-07: Stock restoration & Cancellation flow');
const initialMenu = [
  { id: 1, name: 'Samosa', price: 20, stock: 0 },
  { id: 2, name: 'Chai', price: 10, stock: 3 },
];

// 1. Cancelling an order of 2 samosas and 1 chai must add stock back
const restoredMenu = releaseStock(
  [
    { dishId: 1, qty: 2 },
    { dishId: 2, qty: 1 },
  ],
  initialMenu
);
assert.strictEqual(restoredMenu.find((d) => d.id === 1).stock, 2, 'Samosa stock must increase from 0 to 2');
assert.strictEqual(restoredMenu.find((d) => d.id === 2).stock, 4, 'Chai stock must increase from 3 to 4');

// 2. Cancellation status transition check: repeated cancellation must be rejected
const repeatCancel = statusLogic.canTransition('cancelled', 'cancelled');
assert.strictEqual(repeatCancel.ok, false, 'statusLogic must reject transitioning from cancelled to cancelled');
assert.strictEqual(repeatCancel.reason, 'Order is already cancelled');

const illegalChange = statusLogic.canTransition('cancelled', 'ready');
assert.strictEqual(illegalChange.ok, false, 'statusLogic must reject changing a cancelled order');
assert.strictEqual(illegalChange.reason, 'A cancelled order cannot change');

assert.deepStrictEqual(statusLogic.allowedNext('cancelled'), [], 'Cancelled order has no allowed next transitions');
console.log('  ok CC-07 passed');

// -------------------------------------------------------------
// CC-08: Coupon expiry check (expired, future, missing, malformed)
// -------------------------------------------------------------
console.log('Testing CC-08: Coupon expiry edge cases');
const coupons = [
  {
    code: 'FRESHERS24',
    type: 'flat',
    value: 30,
    minOrder: 50,
    maxDiscount: 30,
    usesLeft: 10,
    expiresAt: '2024-09-30T23:59:59.000Z',
  },
  {
    code: 'VALID20',
    type: 'percent',
    value: 20,
    minOrder: 50,
    maxDiscount: 40,
    usesLeft: 10,
    expiresAt: '2027-12-31T23:59:59.000Z',
  },
  {
    code: 'NOEXPIRY_UNDEF',
    type: 'flat',
    value: 10,
    minOrder: 20,
    maxDiscount: 10,
    usesLeft: 5,
  },
  {
    code: 'NOEXPIRY_NULL',
    type: 'flat',
    value: 10,
    minOrder: 20,
    maxDiscount: 10,
    usesLeft: 5,
    expiresAt: null,
  },
  {
    code: 'MALFORMED',
    type: 'flat',
    value: 10,
    minOrder: 20,
    maxDiscount: 10,
    usesLeft: 5,
    expiresAt: 'invalid-date-string-123',
  },
];
const cartLines = [{ dishId: 1, name: 'Samosa', price: 50, qty: 2, lineTotal: 100 }];

// 1. Expired coupon must be rejected
const expiredRes = applyCoupon('FRESHERS24', cartLines, coupons, { now });
assert.strictEqual(expiredRes.valid, false, 'Expired coupon must be invalid');
assert(expiredRes.reason && /expired/i.test(expiredRes.reason), 'Reason must mention expiry');

// 2. Active future coupon must be accepted
const activeRes = applyCoupon('VALID20', cartLines, coupons, { now });
assert.strictEqual(activeRes.valid, true, 'Active future coupon must be valid');
assert.strictEqual(activeRes.discount, 20, 'Discount must be calculated');

// 3. Coupon with undefined expiresAt must be accepted
const noExpUndef = applyCoupon('NOEXPIRY_UNDEF', cartLines, coupons, { now });
assert.strictEqual(noExpUndef.valid, true, 'Coupon without expiresAt must be valid');

// 4. Coupon with null expiresAt must be accepted
const noExpNull = applyCoupon('NOEXPIRY_NULL', cartLines, coupons, { now });
assert.strictEqual(noExpNull.valid, true, 'Coupon with null expiresAt must be valid');

// 5. Coupon with malformed / invalid date string must be rejected
const malformedRes = applyCoupon('MALFORMED', cartLines, coupons, { now });
assert.strictEqual(malformedRes.valid, false, 'Coupon with malformed date must be rejected');
assert(malformedRes.reason && /expired/i.test(malformedRes.reason), 'Malformed date must report expired/invalid');
console.log('  ok CC-08 passed');

// -------------------------------------------------------------
// CC-09 & CC-10: Pagination and Sorting
// -------------------------------------------------------------
console.log('Testing CC-09 & CC-10: Pagination and Sorting');
const list = [1, 2, 3, 4, 5];
const p1 = paginate(list, 1, 2);
const p2 = paginate(list, 2, 2);
assert.deepStrictEqual(p1.items, [1, 2], 'Page 1 must contain first 2 items');
assert.deepStrictEqual(p2.items, [3, 4], 'Page 2 must contain next 2 items');

const dishes = [{ price: 50 }, { price: 10 }, { price: 30 }];
const asc = sortDishes(dishes, 'price-asc');
const desc = sortDishes(dishes, 'price-desc');
assert.deepStrictEqual(asc.map((d) => d.price), [10, 30, 50], 'price-asc must be ascending');
assert.deepStrictEqual(desc.map((d) => d.price), [50, 30, 10], 'price-desc must be descending');
console.log('  ok CC-09 & CC-10 passed');

console.log('\nAll regression tests passed successfully!');
