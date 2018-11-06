import * as R from 'ramda';

import { Address } from '~/utils/types';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { getPolicyManagerABI } from './getPolicyManagerABI';

export const getPolicyManagerContractAnew = (
  address: Address,
  environment = getGlobalEnvironment(),
) => {
  const ABI = getPolicyManagerABI();
  const contract = new environment.eth.Contract(ABI, address.toString());
  return contract;
};

export const getPolicyManagerContract = R.memoize(getPolicyManagerContractAnew);
