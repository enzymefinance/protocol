import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

const postProcess = async (environment, result, _) => {
  const token =
    result === '0x00'
      ? getTokenBySymbol(environment, 'WETH')
      : getToken(environment, result);
  return token;
};

const getOriginalToken = callFactoryWithoutParams(
  'originalToken',
  Contracts.WrapperLock,
  {
    postProcess,
  },
);

export { getOriginalToken };
