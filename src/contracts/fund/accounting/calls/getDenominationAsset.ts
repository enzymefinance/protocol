import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { TokenInterface } from '@melonproject/token-math';

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<TokenInterface> => {
  const fundToken = await getToken(environment, result);
  return fundToken;
};

const getDenominationAsset = callFactoryWithoutParams(
  'DENOMINATION_ASSET',
  Contracts.Accounting,
  { postProcess },
);

export { getDenominationAsset };
