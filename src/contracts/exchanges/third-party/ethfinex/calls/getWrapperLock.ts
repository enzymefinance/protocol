import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { TokenInterface } from '@melonproject/token-math/token';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

const prepareArgs = (environment, { token }: { token: TokenInterface }) => [
  token.address.toString(),
];

const postProcess = async (environment, result, prepared) => {
  if (isEmptyAddress(result)) return undefined;
  const token = await getToken(environment, result);
  return token;
};

const getWrapperLock = callFactory(
  'wrapper2TokenLookup',
  Contracts.WrapperRegistryEFX,
  {
    postProcess,
    prepareArgs,
  },
);

export { getWrapperLock };
