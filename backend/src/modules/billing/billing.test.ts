import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocate, cents, money, schedule } from './billing.js';

const lease = { id: 'lease', amount: '1000.00', startDate: '2026-01-31', expireDate: '2026-04-29', paymentPeriod: 'MONTHLY', gracePeriod: 5 };
test('billing keeps month-end anchors and applies grace boundaries', () => {
  const bills = schedule(lease, '2026-02-05');
  assert.deepEqual(bills.map(b => [b.startPeriod, b.endPeriod, b.amount]), [
    ['2026-01-31', '2026-02-27', '1000.00'], ['2026-02-28', '2026-03-30', '1000.00'], ['2026-03-31', '2026-04-29', '1000.00'],
  ]);
  assert.equal(bills[0]!.urgencyStatus, 'DUE');
  assert.equal(schedule(lease, '2026-02-06')[0]!.urgencyStatus, 'OVERDUE');
  assert.equal(bills[1]!.urgencyStatus, 'UPCOMING');
  assert.deepEqual(schedule(lease, '2026-02-05'), bills);
});
test('all billing frequencies multiply monthly rent and prorate partial periods', () => {
  for (const [paymentPeriod, expireDate, amount] of [['QUARTERLY', '2026-04-30', '3000.00'], ['HALF_YEARLY', '2026-07-31', '6000.00'], ['YEARLY', '2027-01-31', '12000.00']]) {
    assert.equal(schedule({ ...lease, startDate: '2026-02-01', expireDate, paymentPeriod }, '2026-01-01')[0]!.amount, amount);
  }
  const partial = schedule({ ...lease, startDate: '2026-01-01', expireDate: '2026-01-15' });
  assert.equal(partial[0]!.amount, '483.87');
  assert.deepEqual(schedule({ ...lease, expireDate: '2026-01-01' }), []);
});
test('payments allocate oldest first, cap each bill and retain excess as credit', () => {
  const bills = [{ id: 'feb', startPeriod: '2026-02-01', amount: '1000' }, { id: 'jan', startPeriod: '2026-01-01', amount: '1000' }];
  const partial = allocate(bills, [{ id: 'p1', amount: '250.50', paymentDate: '2026-01-15' }]);
  assert.deepEqual(partial.balances, [{ id: 'jan', paidAmount: '250.50', paymentStatus: 'PARTIAL_PAID' }, { id: 'feb', paidAmount: '0.00', paymentStatus: 'UNPAID' }]);
  const receipts = [{ id: 'p2', amount: '2000', paymentDate: '2026-02-01' }, { id: 'p1', amount: '250.50', paymentDate: '2026-01-15' }];
  const full = allocate(bills, receipts);
  assert.equal(full.allocations.reduce((sum, a) => sum + cents(a.amountAllocated), 0n), 200000n);
  assert.ok(full.balances.every(b => b.paymentStatus === 'PAID' && b.paidAmount === '1000.00'));
  assert.deepEqual(allocate(bills, receipts), full);
  assert.equal(allocate([{ ...bills[0]!, amount: '0' }], receipts).balances[0]!.paidAmount, '0.00');
});
test('decimal arithmetic preserves cents beyond floating point precision', () => {
  assert.equal(money(cents('999999999999.99') + cents('0.01')), '1000000000000.00');
  assert.throws(() => cents('0.001'));
  assert.throws(() => cents('-1'));
});
