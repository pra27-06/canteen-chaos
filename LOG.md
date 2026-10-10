# Debug log

Your notes. One entry per bug you fixed, using the template below.

This file is read as carefully as your code. A correct fix you cannot
explain counts for little; a bug you could not fix but investigated
honestly still counts for something.

Delete the example before you submit.



## Example — delete this

### CC-99 — "The cart total is wrong"

**Reproduced:** Added 2 dosas at Rs. 60 each. The cart showed
Rs. 119.99999 instead of Rs. 130. Happened every time, on any dish with
a price ending in .50.

**Cause:** The total was being added up with plain floating point and
never rounded, so 0.1 + 0.2 style errors showed up on screen. The
rounding helper existed but this one place was not using it.

**Fix:** Ran the total through the existing rounding helper instead of
adding a new one, so every price on screen goes through the same path.

**Checked:** Cart, checkout and the order screen all show Rs. 130 now.
Prices without decimals still show without a trailing .00.

**Time:** about 40 minutes, most of it working out that the cart and the
order screen round in different places.



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



## Could not fix

For anything you investigated but did not solve. Say what you tried and
where you got to. This is worth marks — leaving it blank when you got
stuck is not.

### CC-0X — "<the complaint>"

**What I tried:**

**Where I got to:**

**What I would try next:**



## Extra credit

Anything not on the bug log: a problem you found yourself, a test you
wrote, or a fix you are unsure about. Same format, plus one line on how
you noticed it.
