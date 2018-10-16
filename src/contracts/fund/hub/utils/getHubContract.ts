import * as fs from 'fs';
import * as path from 'path';

import * as R from 'ramda';

import { Address } from '~/utils/types';

import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

const getHubContract = (
  address: Address,
  environment = getGlobalEnvironment(),
) => {
  const rawABI = fs.readFileSync(
    path.join(process.cwd(), 'out', 'fund', 'hub', 'Hub.abi'),
    { encoding: 'utf-8' },
  );
  const ABI = JSON.parse(rawABI);
  const contract = new environment.eth.Contract(ABI, address.toString());
  return contract;
};

export default R.memoize(getHubContract);
