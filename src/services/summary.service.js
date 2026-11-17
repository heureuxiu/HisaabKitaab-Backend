// Month totals for one user. remaining = income - saved - spent
async function summarize(store, uid, month) {
  const rows = await store.monthTotals(uid, month);
  let income = 0, saved = 0, spent = 0;
  const byCategory = {};
  for (const r of rows) {
    const t = Number(r.total);
    if (r.type === 'income') income += t;
    else if (r.type === 'savings') saved += t;
    else { spent += t; byCategory[r.category] = (byCategory[r.category] || 0) + t; }
  }
  return { month, income, saved, spent, remaining: income - saved - spent, byCategory };
}

/** Last n months (1 to 24) ending at `end` (YYYY-MM), oldest first, as { month, income, saved, spent }. */
async function history(store, uid, end, n) {
  let [y, m] = end.split('-').map(Number);
  const months = [];
  for (let i = 0; i < n; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return Promise.all(months.map(async (mo) => {
    const s = await summarize(store, uid, mo);
    return { month: mo, income: s.income, saved: s.saved, spent: s.spent };
  }));
}

module.exports = { summarize, history };
