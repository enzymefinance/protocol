import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { TokenInterface } from '@melonproject/token-math/token';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

const prepareArgs = ({ token }: { token: TokenInterface }) => [
  token.address.toString(),
];

const postProcess = async (result, _, environment) => {
  if (isEmptyAddress(result)) return;
  const token = await getToken(result, environment);
  return token;
};

const getWrapperLock = callFactory(
  'wrapper2TokenLookup',
  Contracts.EthfinexExchangeEfx,
  {
    postProcess,
    prepareArgs,
  },
);

export { getWrapperLock };
