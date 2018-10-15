import * as fs from 'fs';
import * as path from 'path';

import * as R from 'ramda';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

const getContract = (address: string, environment = getGlobalEnvironment()) => {
  // TODO: Use ERC20 Interface ABI --> Needs to be extended with symbol, decimals first
  const rawABI = fs.readFileSync(
    path.join(
      process.cwd(),
      'out',
      'dependencies',
      'token',
      'PreminedToken.abi',
    ),
    { encoding: 'utf-8' },
  );
  const ABI = JSON.parse(rawABI);
  const contract = new environment.eth.Contract(ABI, address);
  return contract;
};

export default R.memoize(getContract);
