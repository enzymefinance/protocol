import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess = async (result, _, environment) => {
  const token = await getToken(result, environment);
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
