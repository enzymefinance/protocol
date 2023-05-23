import { BigNumber } from 'ethers';
import { toMatchSnapshot } from 'jest-snapshot';

import { ensureBigNumbers } from '../bn/utils';
import { isTransactionReceipt } from '../utils';

export function toMatchGasSnapshot(this: jest.MatcherContext, received: any, hint?: string, tolerance = 1000) {
  return ensureBigNumbers(
    [isTransactionReceipt(received) ? received.gasUsed : received],
    this.isNot ?? false,
    ([gas]) => {
      const state = this.snapshotState;
      const update = state._updateSnapshot === 'all';

      if (!update) {
        // This lets us look up the previously stored value in the snapshot file.
        const name = this.currentTestName && hint ? `${this.currentTestName}: ${hint}` : this.currentTestName || '';
        const count = (state._counters.get(name) || 0) + 1;
        const key = `${name} ${count}`;
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

      const args = hint === undefined ? [gas] : [gas, hint];

      return toMatchSnapshot.call<any, any, any>(this, ...args);
    },
  );
}
