import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents, toMilli, centsToString, centsToNumber, divRound, createMoney, minorDigits, MoneyError,
} from '../../src/lib/money.js';

const usd = createMoney('USD');

test('0.1 + 0.2 is exactly 0.30', () => {
  assert.equal(centsToString(usd.sum([toCents('0.1'), toCents('0.2')])), '0.30');
  assert.equal(centsToString(usd.sum([toCents(0.1), toCents(0.2)])), '0.30');
});

test('parses Postgres numeric text, JSON numbers, negatives', () => {
  assert.equal(toCents('12.34'), 1234n);
  assert.equal(toCents('12.3'), 1230n);
  assert.equal(toCents('12'), 1200n);
  assert.equal(toCents('-5.10'), -510n);
  assert.equal(toCents('5.000'), 500n); // trailing zeros are not precision
  assert.equal(toCents(20.5), 2050n);
  assert.equal(toMilli('1.250'), 1250n);
});

test('rejects float residue and non-decimals', () => {
  assert.throws(() => toCents('12.3400000001'), MoneyError);
  assert.throws(() => toCents(0.1 + 0.2), MoneyError); // 0.30000000000000004
  assert.throws(() => toCents('1e3'), MoneyError);
  assert.throws(() => toCents(''), MoneyError);
  assert.throws(() => toCents(null), MoneyError);
  assert.throws(() => toMilli('1.2345'), MoneyError);
});

test('half-way cases round away from zero', () => {
  assert.equal(divRound(5n, 10n), 1n);
  assert.equal(divRound(-5n, 10n), -1n);
  assert.equal(divRound(4n, 10n), 0n);
  assert.equal(divRound(-4n, 10n), 0n);
  assert.equal(divRound(15n, 10n), 2n);
  assert.equal(divRound(25n, 10n), 3n);
});

test('line amount with 3-dp quantity', () => {
  // 1.235 kg x 2.99 = 3.69265 -> 3.69
  assert.equal(centsToString(usd.lineAmount(toCents('2.99'), toMilli('1.235'))), '3.69');
  // 0.5 x 0.01 = 0.005 -> 0.01 (half away from zero)
  assert.equal(centsToString(usd.lineAmount(toCents('0.01'), toMilli('0.5'))), '0.01');
  assert.equal(centsToString(usd.lineAmount(toCents('19.99'), toMilli('3'))), '59.97');
});

test('tax percent', () => {
  assert.equal(centsToString(usd.percentOf(toCents('59.97'), '7.50')), '4.50'); // 4.49775
  assert.equal(centsToString(usd.percentOf(toCents('10.00'), '0')), '0.00');
});

test('3 x 0.10 + 0.20 = 0.50 exactly', () => {
  const total = usd.sum([usd.lineAmount(toCents('0.10'), toMilli('3')), toCents('0.20')]);
  assert.equal(centsToString(total), '0.50');
  assert.equal(centsToNumber(total), 0.5);
});

test('10^10-scale totals stay exact', () => {
  const big = toCents('9999999999.99'); // numeric(12,2) max
  assert.equal(centsToString(usd.sum([big, big, big])), '29999999999.97');
  assert.equal(centsToString(usd.lineAmount(big, toMilli('999999999.999'))), '9999999999980000000.00');
});

test('negative profit impact', () => {
  assert.equal(centsToString(toCents('3.00') - toCents('12.49')), '-9.49');
});

test('zero-decimal currency (JPY)', () => {
  const jpy = createMoney('JPY');
  assert.equal(jpy.parse('1500'), 150000n);
  assert.throws(() => jpy.parse('15.50'), MoneyError);
  assert.equal(centsToString(jpy.lineAmount(jpy.parse('333'), toMilli('1.5'))), '500.00'); // 499.5 -> 500
  assert.equal(centsToString(jpy.percentOf(jpy.parse('1000'), '8.25')), '83.00'); // 82.5 -> 83
});

test('currency support', () => {
  assert.equal(minorDigits('USD'), 2);
  assert.equal(minorDigits('NGN'), 2);
  assert.equal(minorDigits('JPY'), 0);
  assert.throws(() => minorDigits('KWD'), /only 0 or 2/);
  assert.throws(() => minorDigits('XXXX'), /Unknown currency/);
});
