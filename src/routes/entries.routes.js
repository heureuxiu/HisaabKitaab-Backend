const { Router } = require('express');
const { httpError, wrap } = require('../utils/errors');
const { monthOf, parseEntry } = require('../utils/validators');

/** /api/entries: the income, expense and savings rows of the logged-in user. */
module.exports = function entriesRoutes(store) {
  const r = Router();
  r.get('/', wrap(async (req, res) => res.json(await store.listEntries(req.userId, monthOf(req.query.month)))));

  r.post('/', wrap(async (req, res) => {
    const e = parseEntry(req.body);
    res.status(201).json({ id: await store.addEntry(req.userId, e), ...e });
  }));

  r.put('/:id', wrap(async (req, res) => {
    const e = parseEntry(req.body);
    if (!(await store.updateEntry(req.userId, req.params.id, e))) throw httpError(404, 'Entry not found');
    res.json({ id: req.params.id, ...e });
  }));

  r.delete('/:id', wrap(async (req, res) => {
    if (!(await store.deleteEntry(req.userId, req.params.id))) throw httpError(404, 'Entry not found');
    res.status(204).end();
  }));
  return r;
};
