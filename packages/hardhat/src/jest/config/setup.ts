import { BigNumber } from 'ethers';

import * as matchers from '../matchers';

// Extend jest / jasmine with ethereum / hardhat specific matchers.
expect.extend(matchers);

// Allow bignumber values to be serialized properly when used in snapshots.
expect.addSnapshotSerializer({
  serialize: (value) => BigNumber.from(value).toString(),
  test: (value) => BigNumber.isBigNumber(value),
});

// Ensure that the global hardhat runtime is used.
jest.mock('hardhat', () => global.hre);
