# Debug log

Your notes. One entry per bug you fixed, using the template below.

This file is read as carefully as your code. A correct fix you cannot
explain counts for little; a bug you could not fix but investigated
honestly still counts for something.



## CC-01 — "The search suggestions are behind everything"

**Reproduced:** Typed "ch" or "paneer" into the search bar. The suggestions dropdown rendered, but its lower half was hidden behind the category tabs (`.cat-tabs`) and could not be clicked.

**Cause:** In `frontend/style.css`, `.search-wrap` had `z-index: 1`, while the adjacent `.cat-tabs` element had `z-index: 40`. Because `.search-wrap` established a lower stacking context, its child `.suggest-box` was clipped/occluded by the category tab bar.

**Fix:** Changed `.search-wrap` to `z-index: 50` so the entire search container and suggestions dropdown sit above `.cat-tabs` (z-index 40).

**Checked:** Verified with regression test in `backend/test-frontend-css.js` that `.search-wrap` has `z-index >= 40`. Verified in browser that typing search terms displays the full suggestions box layered over category tabs, with all items clickable.

**Time:** about 15 minutes.



## CC-02 — "Can't read anything in dark mode"

**Reproduced:** Switched theme to dark mode using the header theme button. Dish names and prices became nearly invisible against the dark card backgrounds.

**Cause:** In `frontend/style.css`, `.dish-body` had hardcoded `color: #2b2118;` instead of using the theme CSS variable `var(--ink)`. When `data-theme="dark"` set the card background to dark brown (`#201913`), the text remained dark brown.

**Fix:** Replaced hardcoded `color: #2b2118;` with `color: var(--ink);` in `.dish-body`.

**Checked:** Verified with `backend/test-frontend-css.js` that `.dish-body` uses `var(--ink)`. Toggled between light and dark themes in browser; dish names and prices render in `#2b2118` in light mode and high-contrast `#f2e8df` in dark mode.

**Time:** about 10 minutes.



## CC-03 — "The menu is wider than my phone"

**Reproduced:** Simulated mobile screen width (<= 480px) in browser developer tools. Long dish names (like "Paneer Butter Masala Combo with Butter Naan") prevented cards from fitting within the viewport, causing unwanted horizontal scrolling and cutting off "Add to Cart" buttons.

**Cause:** In `frontend/style.css`, under `@media (max-width: 760px)`, `.name-btn` was set to `width: max-content;`, preventing dish titles from wrapping and forcing the entire grid column to expand past the screen edge.

**Fix:** Changed `.name-btn` in the 760px media query to `width: 100%; text-align: left;` and constrained `.dish-card img` to `width: 100%; max-width: 100%;` so cards wrap text properly within mobile columns.

**Checked:** Verified with `backend/test-frontend-css.js` that `width: max-content` is removed. Tested on 375px and 414px mobile viewports; verified dish titles wrap cleanly and cards fit within viewport without horizontal scrolling.

**Time:** about 20 minutes.



## CC-04 — "The buttons don't work on my tablet"

**Reproduced:** Set viewport width between 761px and 900px (tablet breakpoint). Clicking "Add to Cart" or the favorite star button on any dish card had no effect.

**Cause:** In `frontend/style.css`, an `@media (min-width: 761px) and (max-width: 900px)` rule created empty `::after` pseudo-elements over `.dish-card` (bottom 58px) and `.img-wrap` (top-right 52x52px) without `pointer-events: none;`, intercepting all click and tap events.

**Fix:** Added `pointer-events: none;` to `.dish-card::after, .img-wrap::after` in the tablet media query so pointer events pass through directly to the underlying buttons.

**Checked:** Verified with `backend/test-frontend-css.js` that `pointer-events: none` is present in the tablet media query. Tested clicks at 800px viewport; confirmed "Add to Cart" increments cart and the favorite star toggles correctly.

**Time:** about 15 minutes.



## CC-05 — "The category bar scrolls away on my phone"

**Reproduced:** Set viewport width to <= 480px and scrolled down through the menu dishes. The `.filters` bar scrolled off screen instead of sticking to the top.

**Cause:** In `frontend/style.css`, `@media (max-width: 480px)` applied `.view { overflow-x: hidden; }`. In CSS layout, `overflow-x: hidden` establishes a clipping/scroll container that breaks `position: sticky; top: 0;` on child elements during page scrolling.

**Fix:** Replaced `.view { overflow-x: hidden; }` with `.view { overflow-x: clip; }`. Unlike `hidden`, `clip` prevents horizontal scroll overflow without establishing a scroll container, allowing `position: sticky` on `.filters` to stick to the viewport.

**Checked:** Verified with `backend/test-frontend-css.js` that `.view { overflow-x: hidden; }` is removed. Verified in browser at 375px width that the category and filter bar remains fixed at top while scrolling the menu.

**Time:** about 15 minutes.



## CC-06 — "I ordered more than they had"

**Reproduced:** Checked a dish with 2 items in stock (e.g. Samosa). Attempted to validate an order containing 5 units. The validation passed without error, and calling `POST /api/orders` accepted the order, resulting in negative stock.

**Cause:** In `backend/logic/validation.js`, `validateLine()` only verified `Number(dish.stock) <= 0` (sold out check), but never compared `item.qty` against `dish.stock`. Additionally, `reserveStock()` decremented stock without verifying that sufficient stock remained.

**Fix:** In `validateLine()`, added a condition `else if (qty > Number(dish.stock)) errors.push(`Only ${dish.stock} left for ${dish.name}`);`. In `reserveStock()`, aggregated total demand per dish across all lines (handling duplicate dish lines) and pre-checked all quantities against available inventory atomically. If any dish lacks stock, the entire reservation fails atomically without mutating any menu item.

**Checked:** Validated an order requesting 5 samosas when 2 were in stock; received validation rejection error `Only 2 left for Samosa`. Verified unit tests in `test-backend-bugs.js` for atomic failure, non-mutation on failure, and duplicate line aggregation. Confirmed smoke test check `qty over stock rejected` passed.

**Time:** about 25 minutes.



## CC-07 — "Cancelling makes it worse"

**Reproduced:** Placed an order for dishes and then called `PATCH /api/orders/:token/status` with `{ status: "cancelled" }`. The stock for the ordered dishes was subtracted again instead of being added back.

**Cause:** In `backend/logic/validation.js`, `releaseStock()` calculated new stock using `dish.stock - line.qty` instead of adding the cancelled quantity back to inventory.

**Fix:** Changed `releaseStock()` to add the restored quantity: `dish.stock + qty`. Also aggregated quantities by dish ID and ensured cancellation only restores stock if the order status was not already cancelled.

**Checked:** Tested cancellation of orders in `test-backend-bugs.js` and verified stock restored accurately (0 stock became 2 after cancelling 2 items). Verified smoke test check `cancel puts stock back` passed.

**Time:** about 20 minutes.



## CC-08 — "An old coupon still works"

**Reproduced:** Applied the coupon `FRESHERS24` (which had `expiresAt: "2024-09-30T23:59:59.000Z"`) on an order quote. The discount was successfully applied even though the expiry date was in 2024.

**Cause:** In `backend/logic/pricing.js`, `applyCoupon()` checked usage counts, min order amounts, and meal slots, but never checked `coupon.expiresAt` against the current timestamp `now`.

**Fix:** Added validation for `coupon.expiresAt` in `applyCoupon()`. If `coupon.expiresAt` is present (not null/undefined), it is parsed as a Date; if `isNaN(expDate.getTime())` (malformed date) or `expDate <= now` (expired date), the coupon is rejected with reason `${coupon.code} has expired`. Coupons with future dates or without expiry dates remain valid as intended.

**Checked:** Tested `FRESHERS24` against current date in `test-backend-bugs.js` and confirmed it returns `valid: false` with reason `FRESHERS24 has expired`. Tested active, null, undefined, and malformed date strings. Verified smoke test check `expired coupon refused` passed.

**Time:** about 15 minutes.



## CC-09 — "The menu shows more dishes than it should"

**Reproduced:** Called `/api/menu?limit=5&page=1` and `/api/menu?limit=5&page=2`. Both responses returned all dishes in the database rather than slicing them to 5 items per page. The smoke test reported `FAIL pages differ`.

**Cause:** In `backend/logic/search.js`, the `paginate()` function sliced the page correctly into `items`, but returned `items: list`, returning the entire unpaginated array to the client.

**Fix:** Changed `items: list` to `items` in the return object of `paginate()`.

**Checked:** Queried `/api/menu?limit=5&page=1` and page 2; confirmed page 1 returns 5 items and differs from page 2. Ran `node smoke.js`, and `pages differ` passed.

**Time:** about 15 minutes.



## CC-10 — "Sorting by price is backwards"

**Reproduced:** Selected "Price: low to high" and observed highest price dishes at the top. Running `node smoke.js` reported `FAIL sort by price works`.

**Cause:** In `backend/logic/search.js`, the `SORTERS` object inverted the comparators: `'price-asc'` used `(a, b) => b.price - a.price` (descending order), while `'price-desc'` used `(a, b) => a.price - b.price` (ascending order).

**Fix:** Swapped the comparators in `SORTERS` so `'price-asc'` computes `a.price - b.price` and `'price-desc'` computes `b.price - a.price`.

**Checked:** Tested sorting on `/api/menu?sort=price-asc` and `/api/menu?sort=price-desc`. Verified lowest price appears first on `price-asc`. Ran `node smoke.js`, and `sort by price works` passed.

**Time:** about 15 minutes.



## Extra credit

### Regression Test Suites Added
Wrote two dedicated automated regression test scripts under `backend/`:
1. `backend/test-backend-bugs.js`: Deterministically validates logic for CC-06 (stock validation, atomic reservation failure, duplicate demand aggregation), CC-07 (stock restoration on cancellation, idempotent cancellation), CC-08 (coupon expiry date edge cases: expired, active, missing, malformed), and CC-09/CC-10 (pagination and price sorting comparators).
2. `backend/test-frontend-css.js`: Validates CSS rules for CC-01 through CC-05 against regressions in stacking order, dark mode theming, button wrapping, tablet pointer events, and sticky filter preservation.
