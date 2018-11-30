import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deploy } from '~/utils/solidity/deploy';

interface DeployEthFinexArgs {
  tokens: TokenInterface[];
  erc20Proxy?: Address;
}

export const deployEthfinex = async (
  { tokens, erc20Proxy: givenErc20Proxy }: DeployEthFinexArgs,
  environment: Environment,
) => {
  const ethfinex = await deploy(Contracts.EthfinexExchangeEfx, [], environment);

  const erc20Proxy =
    givenErc20Proxy || (await deploy(Contracts.ERC20Proxy, [], environment));

  const ethWrapper = await deploy(
    Contracts.WrapperlockEth,
    ['WETH', 'WETH Token', 18, ethfinex.toString(), erc20Proxy.toString()],
    environment,
  );

  const tokenWrappersPromises = tokens.map(token => async () =>
    deploy(Contracts.WrapperLock, [
      token.address.toString(),
      token.symbol,
      `${token.symbol} Token`,
      token.decimals,
      false,
      ethfinex.toString(),
      erc20Proxy.toString(),
    ]),
  );
};
