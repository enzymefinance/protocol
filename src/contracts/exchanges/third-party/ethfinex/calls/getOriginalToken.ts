import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess = async (environment, result, _) => {
  const token = await getToken(environment, result);
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
