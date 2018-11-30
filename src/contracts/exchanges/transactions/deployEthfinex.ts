import * as R from 'ramda';
import { assetDataUtils } from '0x.js';
import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deploy } from '~/utils/solidity/deploy';
import { promisesSerial } from '~/utils/helpers/promisesSerial';
import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';

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

  // const ethWrapper = await deploy(
  // Contracts.WrapperlockEth,
  // ['WETH', 'WETH Token', 18, ethfinex.toString(), erc20Proxy.toString()],
  // environment,
  // );

  const tokenWrappersPromises = tokens.map(token => async () =>
    deploy(
      Contracts.WrapperLock,
      [
        token.address.toString(),
        token.symbol,
        `${token.symbol} Token`,
        token.decimals,
        false,
        ethfinex.toString(),
        erc20Proxy.toString(),
      ],
      environment,
    ),
  );

  const tokenWrappers: Address[] = await promisesSerial(tokenWrappersPromises);

  await transactionFactory('addAuthorizedAddress', Contracts.ERC20Proxy)(
    erc20Proxy,
    { exchange: ethfinex },
    environment,
  );

  await transactionFactory('registerAssetProxy', Contracts.EthfinexExchangeEfx)(
    ethfinex,
    { assetProxy: erc20Proxy },
    environment,
  );

  const zrxToken = tokens.find(R.propEq('symbol', 'ZRX'));
  ensure(
    !!zrxToken,
    `No ZRX token found in provided tokens: ${tokens
      .map(R.prop('symbol'))
      .join(', ')}`,
  );

  const zrxAssetData = assetDataUtils.encodeERC20AssetData(
    zrxToken.address.toString(),
  );

  await transactionFactory('changeZRXAssetData', Contracts.EthfinexExchangeEfx)(
    ethfinex,
    { zrxAssetData },
    environment,
  );

  await transactionFactory(
    'addNewWrapperPair',
    Contracts.EthfinexExchangeEfx,
    undefined,
    async ({ tokens, wrappers }) => [
      tokens.map(t => t.address.toString()),
      wrappers.map(w => w.toString()),
    ],
  )(
    ethfinex,
    {
      tokens,
      wrappers: tokenWrappers,
    },
    environment,
  );

  return ethfinex;
};
