// logic/validation.js
// Everything that decides whether an order is allowed to exist, plus the
// stock bookkeeping that goes with it.

const { findDish } = require('./pricing');
const { isServedNow, isCanteenOpen, blockedReason } = require('./availability');
const scheduling = require('./scheduling');

const MAX_QTY_PER_DISH = 10;
const MAX_DISTINCT_DISHES = 15;
const MAX_UNITS_PER_ORDER = 30;
const ROOM_PATTERN = /^[A-H]-[0-9]{3}$/;
const MAX_NOTE = 140;

/** One dish line. Returns a list of errors, empty when fine. */
function validateLine(item, index, menu, now, seen) {
  const where = `items[${index}]`;
  const errors = [];

  if (!item || typeof item !== 'object') return [`${where}: each item must be an object`];

  const dish = findDish(item.dishId, menu);
  if (!dish) return [`${where}: dish ${item && item.dishId} does not exist`];

  if (seen.has(dish.id)) errors.push(`${where}: ${dish.name} is listed more than once`);
  seen.add(dish.id);

  const qty = item.qty;
  if (typeof qty !== 'number' || !Number.isInteger(qty)) {
    return errors.concat(`${where}: qty must be a whole number`);
  }
  if (qty < 1) return errors.concat(`${where}: qty must be at least 1`);
  if (qty > MAX_QTY_PER_DISH) {
    errors.push(`${where}: you cannot order more than ${MAX_QTY_PER_DISH} of one dish`);
  }

  const blocked = blockedReason(dish, now);
  if (blocked && isServedNow(dish, now) === false) errors.push(`${dish.name}: ${blocked}`);
  else if (dish.disabled) errors.push(`${dish.name} is off the menu today`);
  else if (Number(dish.stock) <= 0) errors.push(`${dish.name} is sold out`);
  else if (qty > Number(dish.stock)) errors.push(`Only ${dish.stock} left for ${dish.name}`);

  return errors;
}

/**
 * Validate a whole order.
 * options: { now, orders } - orders is needed to check pickup slot capacity.
 */
function validateOrder(order, menu, { now = new Date(), orders = [] } = {}) {
  const errors = [];

  if (!order || typeof order !== 'object') {
    return { valid: false, errors: ['Order must be an object'] };
  }

  if (!isCanteenOpen(now)) errors.push('The canteen is closed right now (7:00 AM - 10:00 PM)');

  if (!Array.isArray(order.items) || order.items.length === 0) {
    return { valid: false, errors: errors.concat('Order must contain at least one item') };
  }
  if (order.items.length > MAX_DISTINCT_DISHES) {
    errors.push(`An order cannot contain more than ${MAX_DISTINCT_DISHES} different dishes`);
  }

  const seen = new Set();
  order.items.forEach((item, i) => {
    errors.push(...validateLine(item, i, menu, now, seen));
  });

  const units = order.items.reduce((sum, i) => sum + (Number(i && i.qty) || 0), 0);
  if (units > MAX_UNITS_PER_ORDER) {
    errors.push(`An order cannot have more than ${MAX_UNITS_PER_ORDER} items in total`);
  }

  if (order.hostelRoom) {
    if (!ROOM_PATTERN.test(String(order.hostelRoom).toUpperCase())) {
      errors.push('Room number must look like B-204');
    }
  }

  if (order.note !== undefined && order.note !== null) {
    if (typeof order.note !== 'string') errors.push('note must be text');
    else if (order.note.length > MAX_NOTE) {
      errors.push(`note cannot be longer than ${MAX_NOTE} characters`);
    }
  }

  if (order.pickupSlot) {
    const slotCheck = scheduling.canBook(order.pickupSlot, orders, now);
    if (!slotCheck.ok) errors.push(slotCheck.reason);
  }

  if (order.tipPercent !== undefined && order.tipPercent !== null && order.tipFlat) {
    errors.push('Send either a tip percentage or a flat tip, not both');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Take stock off the menu for a confirmed order.
 * Re-checks every line first, so two requests cannot take the same last plate.
 */
function reserveStock(items, menu) {
  const errors = [];
  if (!Array.isArray(items)) return { ok: false, menu, errors: ['items must be an array'] };

  const demanded = new Map();
  items.forEach((item) => {
    if (!item) return;
    const id = Number(item.dishId);
    const qty = Number(item.qty) || 0;
    if (qty > 0) {
      demanded.set(id, (demanded.get(id) || 0) + qty);
    }
  });

  // Pre-check all demanded quantities against menu
  demanded.forEach((qty, id) => {
    const dish = menu.find((d) => d.id === id);
    if (!dish) {
      errors.push(`dish ${id} vanished`);
    } else if (dish.stock < qty) {
      errors.push(`not enough stock for ${dish.name} (requested ${qty}, available ${dish.stock})`);
    }
  });

  if (errors.length > 0) return { ok: false, menu, errors };

  const next = menu.map((d) => {
    const qty = demanded.get(d.id);
    return qty ? { ...d, stock: d.stock - qty } : { ...d };
  });

  return { ok: true, menu: next, errors: [] };
}

/** Put stock back when an order is cancelled. */
function releaseStock(items, menu) {
  if (!Array.isArray(items)) return menu;
  const qtyByDish = new Map();
  items.forEach((item) => {
    if (!item) return;
    const id = Number(item.dishId);
    const qty = Number(item.qty) || 0;
    if (qty > 0) {
      qtyByDish.set(id, (qtyByDish.get(id) || 0) + qty);
    }
  });

  return menu.map((dish) => {
    const qty = qtyByDish.get(dish.id);
    if (!qty) return dish;
    return { ...dish, stock: dish.stock + qty };
  });
}

module.exports = {
  MAX_QTY_PER_DISH,
  MAX_DISTINCT_DISHES,
  MAX_UNITS_PER_ORDER,
  ROOM_PATTERN,
  MAX_NOTE,
  validateLine,
  validateOrder,
  reserveStock,
  releaseStock,
};
