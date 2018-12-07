import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { TokenInterface } from '@melonproject/token-math/token';

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<TokenInterface> => {
  const fundToken = await getToken(environment, result);
  return fundToken;
};

const getQuoteToken = callFactoryWithoutParams(
  'QUOTE_ASSET',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { getQuoteToken };
