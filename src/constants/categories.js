// Single source of truth for valid entry types and categories.
const CATEGORIES = {
  income: ['salary', 'freelance', 'business', 'other_in'],
  expense: ['rent', 'food', 'bills', 'transport', 'other'],
  savings: ['sav_monthly', 'sav_emergency', 'sav_goal'],
};
const TYPES = Object.keys(CATEGORIES);
const EXPENSE_CATEGORIES = CATEGORIES.expense;

function isValidCategory(type, categoryId) {
  return Array.isArray(CATEGORIES[type]) && CATEGORIES[type].includes(categoryId);
}

module.exports = { CATEGORIES, TYPES, EXPENSE_CATEGORIES, isValidCategory };
