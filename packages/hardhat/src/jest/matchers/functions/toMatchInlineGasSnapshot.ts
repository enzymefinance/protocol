import { BigNumber } from 'ethers';
import { toMatchInlineSnapshot } from 'jest-snapshot';

import { forcePass, isTransactionReceipt } from '../../utils';
import { ensureBigNumbers } from '../bn/utils';
import { ignoreGasMatchers } from './common/ignoreGasMatchers';

// Dirty hack to extract the context type from jest-snapshot types.
type Context = typeof toMatchInlineSnapshot extends (this: infer TArg, ...args: any) => any ? TArg : never;

export function toMatchInlineGasSnapshot(
  this: jest.MatcherContext,
  received: any,
  expected?: string,
  tolerance = 1000,
) {
  if (ignoreGasMatchers) {
    return forcePass(this.isNot);
  }

  return ensureBigNumbers([isTransactionReceipt(received) ? received.gasUsed : received], this.isNot, ([gas]) => {
    let value = expected;

    const state = (this as Context).snapshotState as any;
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

    const args = [gas, ...(value === undefined ? [] : [value])] as const;

    return toMatchInlineSnapshot.call(this as Context, ...args);
  });
}
