import { BigNumber } from 'ethers';
import { toMatchSnapshot, utils } from 'jest-snapshot';

import { forcePass, isTransactionReceipt } from '../../utils';
import { ensureBigNumbers } from '../bn/utils';
import { ignoreGasMatchers } from './common/ignoreGasMatchers';

const tolerance = 1000;

// Dirty hack to extract the context type from jest-snapshot types.
type Context = typeof toMatchSnapshot extends (this: infer TArg, ...args: any) => any ? TArg : never;

export function toMatchGasSnapshot(this: jest.MatcherContext, received: any, hint?: string) {
  if (ignoreGasMatchers) {
    return forcePass(this.isNot);
  }

  return ensureBigNumbers([isTransactionReceipt(received) ? received.gasUsed : received], this.isNot, ([gas]) => {
    const state = (this as Context).snapshotState as any;
    const update = state._updateSnapshot === 'all';

    if (!update) {
      // This lets us look up the previously stored value in the snapshot file.
      const name = this.currentTestName && hint ? `${this.currentTestName}: ${hint}` : this.currentTestName || '';
      const count = (state._counters.get(name) || 0) + 1;
      const key = utils.testNameToKey(name, count);
      const snapshots = state._snapshotData as Record<string, string>;

      if (snapshots[key]) {
        const snapshot = BigNumber.from(snapshots[key]);
        const min = snapshot.sub(tolerance);
        const max = snapshot.add(tolerance);

        if (gas.lte(max) && gas.gte(min)) {
          // HACK: If the gas usage is within the tolerance range, override the snapshot data entry.
          snapshots[key] = gas.toString();
        }
      }
    }

    const args = [gas, ...(hint === undefined ? [] : [hint])] as const;

    return toMatchSnapshot.call(this as Context, ...args);
  });
}
