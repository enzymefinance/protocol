import * as R from 'ramda';

import { Address } from '~/utils/types';
import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';
import getPolicyManagerABI from './getPolicyManagerABI';

const getPolicyManagerContract = (
  address: Address,
  environment = getGlobalEnvironment(),
) => {
  const ABI = getPolicyManagerABI();
  const contract = new environment.eth.Contract(ABI, address.toString());
  return contract;
};

export default R.memoize(getPolicyManagerContract);
