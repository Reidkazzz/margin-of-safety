// Run with: node test/valuation.test.js
const assert = require('node:assert/strict');
const V = require('../valuation.js');

const A = { discount: 0.10, terminal: 0.025, growthCap: 0.15, aaa: 5 };
const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

// Graham number: sqrt(22.5 * 5 * 20) = sqrt(2250)
close(V.grahamNumber(5, 20), 47.4342, 0.001);
assert.equal(V.grahamNumber(-1, 20), null);
assert.equal(V.grahamNumber(5, 0), null);

// Graham growth formula: 4 * (8.5 + 2*5) * 4.4 / 5 = 65.12
close(V.grahamGrowth(4, 5, 5), 65.12, 0.001);
assert.equal(V.grahamGrowth(-1, 5, 5), null);

// DCF with zero growth everywhere is a growing perpetuity check: fcf, g=0 -> gT=0 over 10y + terminal
// PV of level 10/yr for 10 years at 10% = 61.446; terminal 10/0.10 discounted 10y = 38.554; total 100
close(V.dcfPerShare(10, 0, 0, 0.10, 10), 100, 0.01);
assert.equal(V.dcfPerShare(-5, 0.05, 0.025, 0.10, 10), null);
assert.equal(V.dcfPerShare(10, 0.05, 0.10, 0.10, 10), null); // discount must exceed terminal growth

// Higher growth must raise value
assert.ok(V.dcfPerShare(10, 0.10, 0.025, 0.10, 10) > V.dcfPerShare(10, 0.02, 0.025, 0.10, 10));

// analyze(): a cheap, profitable company
const cheap = V.analyze(30, {
  epsTTM: 5, bookValuePerShareQuarterly: 25, freeCashFlowPerShareTTM: 4,
  epsGrowth5Y: 6, revenueGrowth5Y: 4, roeTTM: 18, 'totalDebt/totalEquityQuarterly': 0.6,
  '52WeekHigh': 40, '52WeekLow': 25
}, A);
assert.ok(cheap.value > 30, 'value should exceed price');
assert.ok(cheap.mos > 0, 'positive margin of safety');
close(cheap.pe, 6, 1e-9);
close(cheap.fcfYield, 4 / 30, 1e-9);
close(cheap.growth, 0.05, 1e-9);
assert.equal(cheap.growthAssumed, false);

// analyze(): negative earnings drops the EPS-based models, DCF can still run
const loss = V.analyze(20, { epsTTM: -1, bookValuePerShareQuarterly: 10, freeCashFlowPerShareTTM: 2 }, A);
assert.equal(loss.models.graham, null);
assert.equal(loss.models.growthFormula, null);
assert.ok(loss.models.dcf > 0);
assert.equal(loss.pe, null);
assert.equal(loss.growthAssumed, true);

// analyze(): falls back to P/FCF when FCF per share is missing
const viaPfcf = V.analyze(50, { epsTTM: 2, bookValuePerShareQuarterly: 10, pfcfShareTTM: 25 }, A);
close(viaPfcf.fcfps, 2, 1e-9);

// analyze(): invalid price
assert.equal(V.analyze(0, {}, A), null);

// growth cap
const wild = V.analyze(10, { epsTTM: 1, epsGrowth5Y: 90, revenueGrowth5Y: 70 }, A);
close(wild.g0, 0.15, 1e-9);

// score(): the cheaper stock ranks higher
const rows = V.score([
  Object.assign({ ticker: 'CHEAP' }, cheap),
  Object.assign({ ticker: 'PRICEY' }, V.analyze(200, {
    epsTTM: 5, bookValuePerShareQuarterly: 25, freeCashFlowPerShareTTM: 4, epsGrowth5Y: 6, revenueGrowth5Y: 4, roeTTM: 18
  }, A))
]);
assert.ok(rows[0].score > rows[1].score);

// passes(): filters, blank filters ignored, missing metrics hidden when a filter is set
const none = { mos: null, pe: null, roe: null, de: null, fcf: false };
assert.equal(V.passes(rows[0], none), true);
assert.equal(V.passes(rows[1], Object.assign({}, none, { mos: 20 })), false);
assert.equal(V.passes(rows[0], Object.assign({}, none, { mos: 20, pe: 15, roe: 10, de: 1, fcf: true })), true);
assert.equal(V.passes(rows[0], Object.assign({}, none, { de: 0.3 })), false);
assert.equal(V.passes(Object.assign({}, rows[0], { debtEq: null }), Object.assign({}, none, { de: 2 })), false);

// flags
const hasFlag = (r, text) => r.flags.some((f) => f.includes(text));

// zero-model flag: no EPS, book value or free cash flow means nothing can run
const empty = V.analyze(20, {}, A);
assert.equal(empty.value, null);
assert.equal(empty.mos, null);
assert.ok(hasFlag(empty, 'No valuation model could run'));
assert.ok(!hasFlag(cheap, 'No valuation model could run'));

// growth-disagreement flag: EPS and revenue growth far apart
const split = V.analyze(30, { epsTTM: 5, bookValuePerShareQuarterly: 25, epsGrowth5Y: 40, revenueGrowth5Y: 5 }, A);
assert.ok(hasFlag(split, 'differ a lot'));
assert.ok(!hasFlag(cheap, 'differ a lot'), 'close growth figures should not flag');
const oneSided = V.analyze(30, { epsTTM: 5, bookValuePerShareQuarterly: 25, epsGrowth5Y: 40 }, A);
assert.ok(!hasFlag(oneSided, 'differ a lot'), 'needs both growth figures');

// 52-week range: near the low flags, a degenerate or missing range does not
const nearLow = V.analyze(25.5, { epsTTM: 5, bookValuePerShareQuarterly: 25, '52WeekHigh': 40, '52WeekLow': 25 }, A);
assert.ok(hasFlag(nearLow, '52-week low'));
const flatRange = V.analyze(25, { epsTTM: 5, bookValuePerShareQuarterly: 25, '52WeekHigh': 25, '52WeekLow': 25 }, A);
assert.ok(!hasFlag(flatRange, '52-week low'), 'high equal to low must not divide by zero');
const noRange = V.analyze(25, { epsTTM: 5, bookValuePerShareQuarterly: 25 }, A);
assert.ok(!hasFlag(noRange, '52-week low'));
assert.ok(!hasFlag(cheap, '52-week low'), 'mid-range price should not flag');

// growth cap flag prints a clean percentage, not 7.000000000000001
const capped = V.analyze(10, { epsTTM: 1, epsGrowth5Y: 90, revenueGrowth5Y: 70 }, Object.assign({}, A, { growthCap: 0.07 }));
assert.ok(hasFlag(capped, 'capped at 7%.'));

// revenue growth: latest quarter YoY wins, TTM is the fallback, missing stays null
const g1 = V.analyze(10, { epsTTM: 1, revenueGrowthQuarterlyYoy: 58, revenueGrowthTTMYoy: 30 }, A);
close(g1.revGrowth, 0.58, 1e-9);
close(V.analyze(10, { epsTTM: 1, revenueGrowthTTMYoy: 30 }, A).revGrowth, 0.30, 1e-9);
assert.equal(V.analyze(10, { epsTTM: 1 }, A).revGrowth, null);

// growth-screen filters: market cap in $M, revenue growth in percent
const inod = { marketCap: 1960, revGrowth: 0.58 };
const capF = (extra) => Object.assign({}, none, extra);
assert.equal(V.passes(inod, capF({ capMin: 300, capMax: 2000, rev: 17 })), true);
assert.equal(V.passes({ marketCap: 2500, revGrowth: 0.5 }, capF({ capMax: 2000 })), false, 'above max cap');
assert.equal(V.passes({ marketCap: 250, revGrowth: 0.5 }, capF({ capMin: 300 })), false, 'below min cap');
assert.equal(V.passes({ marketCap: 1000, revGrowth: 0.16 }, capF({ rev: 17 })), false, 'growth under the floor');
assert.equal(V.passes({ marketCap: 1000, revGrowth: 0.17 }, capF({ rev: 17 })), true, 'growth exactly at the floor');
assert.equal(V.passes({ marketCap: null, revGrowth: 0.5 }, capF({ capMin: 300 })), false, 'missing cap is hidden when filtered');
assert.equal(V.passes({ marketCap: null, revGrowth: null }, none), true, 'filters off ignore missing data');
assert.equal(V.passes(inod, none), true, 'older filter objects without the new keys still work');
assert.equal(V.passes(inod, { mos: null, pe: null, roe: null, de: null, fcf: false }), true);

// filterChecks: how far each active filter is beaten or missed
const byId = (checks, id) => checks.find((c) => c.id === id);
const growthF = capF({ capMin: 300, capMax: 2000, rev: 17 });
const good = V.filterChecks({ marketCap: 1960, revGrowth: 0.58 }, growthF);
assert.equal(good.length, 3, 'only active filters are checked');
assert.equal(byId(good, 'rev').pass, true);
close(byId(good, 'rev').delta, 41, 1e-9); // 58% against 17% is 41 points ahead
close(byId(good, 'capMax').delta, 2, 1e-9); // 1,960 against a 2,000 ceiling is 2% under it
close(byId(good, 'capMin').delta, 553.33, 0.01); // 1,960 against a 300 floor is 553% above it
assert.ok(good.every((c) => c.pass));
assert.ok(byId(good, 'rev').key && byId(good, 'capMin').key && byId(good, 'capMax').key, 'growth filters are key');

const bad = V.filterChecks({ marketCap: 2500, revGrowth: 0.16 }, growthF);
assert.equal(byId(bad, 'rev').pass, false);
close(byId(bad, 'rev').delta, -1, 1e-9); // 1 point short
assert.equal(byId(bad, 'capMax').pass, false);
close(byId(bad, 'capMax').delta, -25, 1e-9); // 25% over the ceiling
assert.equal(V.passes({ marketCap: 2500, revGrowth: 0.16 }, growthF), false);

const gone = V.filterChecks({ marketCap: null, revGrowth: null }, growthF);
assert.ok(gone.every((c) => c.missing && !c.pass && c.delta === null), 'missing data fails with no margin');

// value filters: pts for percentages, percent of the limit for ratios, yes/no for free cash flow
const vf = V.filterChecks({ mos: 0.3, pe: 12, roe: 0.05, debtEq: 3, fcfps: -1 },
  { mos: 20, pe: 15, roe: 8, de: 2, fcf: true, capMin: null, capMax: null, rev: null });
close(byId(vf, 'mos').delta, 10, 1e-9);
close(byId(vf, 'pe').delta, 20, 1e-9); // 12 against a 15 ceiling is 20% under it
close(byId(vf, 'roe').delta, -3, 1e-9);
close(byId(vf, 'de').delta, -50, 1e-9);
assert.equal(byId(vf, 'fcf').pass, false);
assert.equal(byId(vf, 'fcf').kind, 'flag');
// a non-positive P/E fails and gets no margin, and a zero limit does not divide by zero
const negPe = V.filterChecks({ pe: -4 }, capF({ pe: 15 }));
assert.equal(byId(negPe, 'pe').pass, false);
assert.equal(byId(negPe, 'pe').delta, null);
assert.equal(byId(V.filterChecks({ debtEq: 0 }, capF({ de: 0 })), 'de').delta, null);
assert.equal(V.filterChecks({}, none).length, 0, 'no active filters means no checks');

// position size: risk 2% of 10,000 = 200; 5 per share stop distance -> 40 shares
const ps = V.positionSize(10000, 2, 50, 45);
assert.equal(ps.shares, 40);
close(ps.value, 2000, 1e-9);
close(ps.dollarRisk, 200, 1e-9);
close(ps.pctOfAccount, 0.2, 1e-9);
close(ps.riskPctOfAccount, 0.02, 1e-9);
close(ps.stopDistance, 0.1, 1e-9);
assert.equal(ps.capped, false);
// a tight stop would need more than the whole account, so it caps at what the account can buy
const tight = V.positionSize(1000, 5, 50, 49.5);
assert.equal(tight.capped, true);
assert.equal(tight.shares, 20);
close(tight.dollarRisk, 10, 1e-9);
// a wide stop buys nothing
assert.equal(V.positionSize(1000, 1, 100, 10).shares, 0);
// unusable inputs
assert.equal(V.positionSize(1000, 2, 50, 50), null, 'stop must be below entry');
assert.equal(V.positionSize(1000, 2, 50, 55), null);
assert.equal(V.positionSize(null, 2, 50, 45), null);
assert.equal(V.positionSize(1000, 0, 50, 45), null);
assert.equal(V.positionSize(1000, NaN, 50, 45), null);

console.log('All valuation tests passed.');
