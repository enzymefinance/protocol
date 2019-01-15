import * as R from 'ramda';

import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

// tslint:disable:max-line-length
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deployContract } from '~/utils/solidity/deployContract';
import { promisesSerial } from '~/utils/helpers/promisesSerial';
import { ensure } from '~/utils/guards/ensure';
import { deployErc20Proxy } from './deployErc20Proxy';
import { addAuthorizedAddress } from '../third-party/0x/transactions/addAuthorizedAddress';
import { registerAssetProxy } from '../third-party/0x/transactions/registerAssetProxy';
import { changeZRXAsset } from '../third-party/0x/transactions/changeZRXAsset';
import { addNewWrapperPair } from '../third-party/ethfinex/transactions/addNewWrapperPair';
// tslint:enable:max-line-length

interface DeployEthFinexArgs {
  tokens: TokenInterface[];
  erc20Proxy?: Address;
}

export interface WrapperPair {
  token: Address;
  wrapper: Address;
}

export interface EthfinexEnvironment {
  erc20Proxy?: Address;
  exchange: Address;
  wrapperPairs?: WrapperPair[];
  wrapperRegistryEFX: Address;
}

export const deployEthfinex = async (
  environment: Environment,
  { tokens, erc20Proxy: givenErc20Proxy }: DeployEthFinexArgs,
): Promise<EthfinexEnvironment> => {
  const ethfinex = await deployContract(
    environment,
    Contracts.EthfinexExchangeEfx,
    [],
  );

  const wrapperRegistryEFX = await deployContract(
    environment,
    Contracts.WrapperRegistryEFX,
    [],
  );

  const erc20Proxy = givenErc20Proxy || (await deployErc20Proxy(environment));

  const tokenWrappersPromises = tokens.map(token => async () => {
    if (token.symbol == 'WETH') {
      return deployContract(environment, Contracts.WrapperLockEth, [
        'WETH',
        'WETH token',
        18,
        ethfinex.toString(),
        erc20Proxy.toString(),
      ]);
    } else {
      return deployContract(environment, Contracts.WrapperLock, [
        token.address.toString(),
        `W-${token.symbol}`,
        `${token.symbol} Token`,
        token.decimals,
        false,
        ethfinex.toString(),
        erc20Proxy.toString(),
      ]);
    }
  });

  const tokenWrappers: Address[] = await promisesSerial(tokenWrappersPromises);

  await addAuthorizedAddress(environment, erc20Proxy, { exchange: ethfinex });
  await registerAssetProxy(environment, ethfinex, { assetProxy: erc20Proxy });

  const zrxToken = tokens.find(R.propEq('symbol', 'ZRX'));
  ensure(
    !!zrxToken,
    `No ZRX token found in provided tokens: ${tokens
      .map(R.prop('symbol'))
      .join(', ')}`,
  );

  await changeZRXAsset(environment, ethfinex, { zrxToken });

  const wrapperPairs = await addNewWrapperPair(
    environment,
    wrapperRegistryEFX,
    {
      tokens,
      wrappers: tokenWrappers,
    },
  );

  return {
    erc20Proxy,
    exchange: ethfinex,
    wrapperPairs,
    wrapperRegistryEFX,
  };
};
