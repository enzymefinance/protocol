import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess = async (environment, result) => {
  const token = await getToken(environment, result);
  return token;
};

const getAmguToken = callFactoryWithoutParams(
  'mlnAddress',
  Contracts.AmguConsumer,
  {
    postProcess,
  },
);

export { getAmguToken };
