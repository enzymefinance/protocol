import { BigNumber } from 'ethers';
import { toMatchInlineSnapshot } from 'jest-snapshot';

import { isTransactionReceipt } from '../../utils';
import { ensureBigNumbers } from '../bn/utils';

export function toMatchInlineGasSnapshot(
  this: jest.MatcherContext,
  received: any,
  expected?: string,
  tolerance = 1000,
) {
  return ensureBigNumbers([isTransactionReceipt(received) ? received.gasUsed : received], this.isNot, ([gas]) => {
    let value = expected;

    const state = this.snapshotState;
    const update = state._updateSnapshot === 'all';

    if (!update && value !== undefined) {
      const snapshot = BigNumber.from(value);
      const min = snapshot.sub(tolerance);
      const max = snapshot.add(tolerance);

      if (gas.lte(max) && gas.gte(min)) {
        // HACK: If the gas usage is within the tolerance range, override the snapshot data entry.
        value = gas.toString();
      }
    }

    const args = [gas, ...(value === undefined ? [] : [value])];

    return toMatchInlineSnapshot.call<any, any, any>(this, ...args);
  });
}
