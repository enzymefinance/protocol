import * as R from 'ramda';

import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

// tslint:disable:max-line-length
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deploy } from '~/utils/solidity/deploy';
import { promisesSerial } from '~/utils/helpers/promisesSerial';
import { ensure } from '~/utils/guards/ensure';
import { deployErc20Proxy } from './deployErc20Proxy';
import { addAuthorizedAddress } from '../thirdparty/0x/transactions/addAuthorizedAddress';
import { registerAssetProxy } from '../thirdparty/0x/transactions/registerAssetProxy';
import { changeZRXAsset } from '../thirdparty/0x/transactions/changeZRXAsset';
import { addNewWrapperPair } from '../thirdparty/ethfinex/transactions/addNewWrapperPair';
// tslint:enable:max-line-length

interface DeployEthFinexArgs {
  tokens: TokenInterface[];
  erc20Proxy?: Address;
}

export const deployEthfinex = async (
  { tokens, erc20Proxy: givenErc20Proxy }: DeployEthFinexArgs,
  environment: Environment,
) => {
  const ethfinex = await deploy(Contracts.EthfinexExchangeEfx, [], environment);

  const erc20Proxy = givenErc20Proxy || (await deployErc20Proxy(environment));

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

  await addAuthorizedAddress(erc20Proxy, { exchange: ethfinex }, environment);
  await registerAssetProxy(ethfinex, { assetProxy: erc20Proxy }, environment);

  const zrxToken = tokens.find(R.propEq('symbol', 'ZRX'));
  ensure(
    !!zrxToken,
    `No ZRX token found in provided tokens: ${tokens
      .map(R.prop('symbol'))
      .join(', ')}`,
  );

  await changeZRXAsset(ethfinex, { zrxToken }, environment);

  await addNewWrapperPair(
    ethfinex,
    {
      tokens,
      wrappers: tokenWrappers,
    },
    environment,
  );

  return ethfinex;
};
