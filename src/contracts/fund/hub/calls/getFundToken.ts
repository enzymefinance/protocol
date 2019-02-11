import { Contracts } from '~/Contracts';
import {
  PostProcessCallFunction,
  callFactoryWithoutParams,
} from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const postProcess: PostProcessCallFunction = async (environment, result) => {
  const token = await getToken(environment, result);
  return token;
};

const getFundToken = callFactoryWithoutParams('shares', Contracts.Hub, {
  postProcess,
});

export { getFundToken };
