import { BigNumber } from 'ethers';

import * as matchers from './tests/utils/jest/matchers';

expect.extend(matchers);
expect.addSnapshotSerializer({
  serialize: (value) => BigNumber.from(value).toString(),
  test: (value) => BigNumber.isBigNumber(value),
});
