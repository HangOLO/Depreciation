'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Accounting = require('../accounting.js');

function checkConservation(lesson) {
  for (const row of lesson.rows) {
    assert.equal(row.opening - row.depreciation, row.closing);
    assert.equal(row.accumulated + row.closing, lesson.cost);
    assert.ok(row.closing >= lesson.residual);
    assert.ok(row.depreciation >= 0);
  }
}

test('browser global and CommonJS export share the same pure API', () => {
  assert.equal(globalThis.Accounting, Accounting);
  const first = Accounting.straight();
  first.rows[0].closing = -1;
  assert.equal(Accounting.straight().rows[0].closing, 42000);
});

test('money uses Hong Kong dollars and readable thousands', () => {
  assert.equal(Accounting.money(54000), '$54,000');
  assert.equal(Accounting.money(0), '$0');
  assert.equal(Accounting.money(12.5), '$12.5');
  assert.equal(Accounting.money(-1200), '-$1,200');
});

test('straight line includes transport and installation, allocating exactly $12,000 per year', () => {
  const lesson = Accounting.straight();
  assert.equal(lesson.cost, 54000);
  assert.equal(lesson.residual, 6000);
  assert.equal(lesson.depreciable, 48000);
  assert.equal(lesson.annual, 12000);
  assert.equal(lesson.years, 4);
  assert.deepEqual(lesson.rows, [
    { year: 2026, opening: 54000, depreciation: 12000, accumulated: 12000, closing: 42000 },
    { year: 2027, opening: 42000, depreciation: 12000, accumulated: 24000, closing: 30000 },
    { year: 2028, opening: 30000, depreciation: 12000, accumulated: 36000, closing: 18000 },
    { year: 2029, opening: 18000, depreciation: 12000, accumulated: 48000, closing: 6000 }
  ]);
  checkConservation(lesson);
});

test('straight line preserves the residual with other costs and useful lives', () => {
  const lesson = Accounting.straight({ price: 600, transport: 0, installation: 0,
    residual: 120, years: 3, startYear: 2030 });
  assert.equal(lesson.annual, 160);
  assert.deepEqual(lesson.rows.map(row => row.depreciation), [160, 160, 160]);
  assert.equal(lesson.rows.at(-1).closing, 120);
  assert.equal(lesson.rows[0].year, 2030);
  checkConservation(lesson);
});

test('reducing balance applies 40% before writing off the remaining balance in the final useful year', () => {
  const lesson = Accounting.reducing();
  assert.equal(lesson.rate, 0.4);
  assert.equal(lesson.cost, 40000);
  assert.equal(lesson.years, 5);
  assert.equal(lesson.usefulLife, 5);
  assert.equal(lesson.residual, 0);
  assert.equal(lesson.depreciable, 40000);
  assert.deepEqual(lesson.rows, [
    { year: 2026, opening: 40000, depreciation: 16000, accumulated: 16000, closing: 24000, finalYear: false },
    { year: 2027, opening: 24000, depreciation: 9600, accumulated: 25600, closing: 14400, finalYear: false },
    { year: 2028, opening: 14400, depreciation: 5760, accumulated: 31360, closing: 8640, finalYear: false },
    { year: 2029, opening: 8640, depreciation: 3456, accumulated: 34816, closing: 5184, finalYear: false },
    { year: 2030, opening: 5184, depreciation: 5184, accumulated: 40000, closing: 0, finalYear: true }
  ]);
  assert.equal(Object.hasOwn(lesson, 'annual'), false);
  checkConservation(lesson);
});

test('a shortened reducing balance display does not fully depreciate before the useful life ends', () => {
  const lesson = Accounting.reducing({ years: 2, usefulLife: 3 });
  assert.deepEqual(lesson.rows.map(row => row.depreciation), [16000, 9600]);
  assert.equal(lesson.rows.at(-1).closing, 14400);
  assert.ok(lesson.rows.every(row => !row.finalYear));
  checkConservation(lesson);
});

test('reducing balance retains the estimated residual in the final useful year', () => {
  const lesson = Accounting.reducing({ residual: 6000, years: 3, usefulLife: 3 });
  assert.deepEqual(lesson.rows.map(row => row.depreciation), [16000, 9600, 8400]);
  assert.equal(lesson.depreciable, 34000);
  assert.equal(lesson.rows.at(-1).accumulated, 34000);
  assert.equal(lesson.rows.at(-1).closing, 6000);
  checkConservation(lesson);
  const fiveYearLesson = Accounting.reducing({ residual: 1000 });
  assert.deepEqual(fiveYearLesson.rows.map(row => row.depreciation), [16000, 9600, 5760, 3456, 4184]);
  assert.equal(fiveYearLesson.rows.at(-1).closing, 1000);
  checkConservation(fiveYearLesson);
});

test('reducing balance clamps a high rate to the residual before the final year', () => {
  const lesson = Accounting.reducing({ rate: 0.9, residual: 6000, years: 3, usefulLife: 3 });
  assert.deepEqual(lesson.rows.map(row => row.depreciation), [34000, 0, 0]);
  assert.ok(lesson.rows.every(row => row.closing === 6000));
  checkConservation(lesson);
});

test('a one-year reducing balance life depreciates only the cost less residual', () => {
  const lesson = Accounting.reducing({ years: 1, usefulLife: 1, residual: 6000 });
  assert.equal(lesson.rows[0].depreciation, 34000);
  assert.equal(lesson.rows[0].closing, 6000);
  assert.equal(lesson.rows[0].finalYear, true);
  checkConservation(lesson);
});

test('reducing balance rejects invalid useful lives, display horizons and residual values', () => {
  for (const input of [
    { years: 0 }, { years: 1.5 }, { usefulLife: 0 }, { usefulLife: 1.5 },
    { years: 4, usefulLife: 3 }, { residual: -1 }, { residual: 40001 }
  ]) {
    assert.throws(() => Accounting.reducing(input), RangeError);
  }
});

test('usage lesson allocates $4 per use and zero depreciation in the idle year', () => {
  const lesson = Accounting.usage();
  assert.equal(lesson.perUse, 4);
  assert.equal(lesson.depreciable, 48000);
  assert.equal(lesson.totalUsage, 12000);
  assert.deepEqual(lesson.rows, [
    { year: 2026, opening: 54000, usage: 3000, depreciation: 12000, accumulated: 12000, closing: 42000 },
    { year: 2027, opening: 42000, usage: 4500, depreciation: 18000, accumulated: 30000, closing: 24000 },
    { year: 2028, opening: 24000, usage: 0, depreciation: 0, accumulated: 30000, closing: 24000 },
    { year: 2029, opening: 24000, usage: 4500, depreciation: 18000, accumulated: 48000, closing: 6000 }
  ]);
  checkConservation(lesson);
});

test('usage preserves residual and never changes the input orders', () => {
  const usages = [0, 12000, 3000];
  const lesson = Accounting.usage({ usages });
  assert.deepEqual(usages, [0, 12000, 3000]);
  assert.deepEqual(lesson.rows.map(row => row.depreciation), [0, 48000, 0]);
  assert.equal(lesson.rows.at(-1).closing, 6000);
  checkConservation(lesson);
});

test('completed training opens straight line; only completing straight line opens the other methods', () => {
  assert.deepEqual(Accounting.allowedModes(false), ['free']);
  assert.deepEqual(Accounting.allowedModes(false, false), ['free']);
  assert.deepEqual(Accounting.allowedModes(false, true), ['free']);
  assert.deepEqual(Accounting.allowedModes(true), ['free', 'straight']);
  assert.deepEqual(Accounting.allowedModes(true, false), ['free', 'straight']);
  assert.deepEqual(Accounting.allowedModes(true, true), ['free', 'straight', 'reducing', 'usage']);
  const modes = Accounting.allowedModes(true, true);
  modes.pop();
  assert.equal(Accounting.allowedModes(true, true).length, 4);
});

test('invalid lesson inputs fail instead of displaying NaN or negative depreciation', () => {
  assert.throws(() => Accounting.straight({ years: 0 }), RangeError);
  assert.throws(() => Accounting.straight({ price: -1 }), RangeError);
  assert.throws(() => Accounting.straight({ residual: 60000 }), RangeError);
  assert.throws(() => Accounting.reducing({ rate: 1.1 }), RangeError);
  assert.throws(() => Accounting.usage({ totalUsage: 0 }), RangeError);
  assert.throws(() => Accounting.usage({ usages: [0, -1] }), RangeError);
  assert.throws(() => Accounting.money(NaN), RangeError);
});
