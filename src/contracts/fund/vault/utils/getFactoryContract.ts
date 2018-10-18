import * as fs from 'fs';
import * as path from 'path';
import * as R from 'ramda';

import { getGlobalEnvironment } from '~/utils/environment/getGlobalEnvironment';

export const getFactoryContract = R.memoize(
  (address: string, environment = getGlobalEnvironment()) => {
    const rawABI = fs.readFileSync(
      path.join(process.cwd(), 'out', 'fund', 'vault', 'VaultFactory.abi'),
      { encoding: 'utf-8' },
    );
    const ABI = JSON.parse(rawABI);
    const contract = new environment.eth.Contract(ABI, address);
    return contract;
  },
);
