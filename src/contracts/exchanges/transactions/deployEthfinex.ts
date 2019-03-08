import * as R from 'ramda';

import { TokenInterface, Address } from '@melonproject/token-math';

// tslint:disable:max-line-length
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';
import { deployContract } from '~/utils/solidity/deployContract';
import { promisesSerial } from '~/utils/helpers/promisesSerial';
import { ensure } from '~/utils/guards/ensure';
import { addNewWrapperPair } from '../third-party/ethfinex/transactions/addNewWrapperPair';
import { getAssetProxy } from '../third-party/0x/calls/getAssetProxy';
// tslint:enable:max-line-length

interface DeployEthFinexArgs {
  zeroExExchangeAddress: Address;
  tokens: TokenInterface[];
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
  { zeroExExchangeAddress, tokens }: DeployEthFinexArgs,
): Promise<EthfinexEnvironment> => {
  const wrapperRegistryEFX = await deployContract(
    environment,
    Contracts.WrapperRegistryEFX,
    [],
  );

  const erc20Proxy = await getAssetProxy(environment, zeroExExchangeAddress);

  const tokenWrappersPromises = tokens.map(token => async () => {
    if (token.symbol === 'WETH') {
      return deployContract(environment, Contracts.WrapperLockEth, [
        'WETH',
        'WETH token',
        18,
        zeroExExchangeAddress.toString(),
        erc20Proxy.toString(),
      ]);
    } else {
      return deployContract(environment, Contracts.WrapperLock, [
        token.address.toString(),
        `W-${token.symbol}`,
        `${token.symbol} Token`,
        token.decimals,
        false,
        zeroExExchangeAddress.toString(),
        erc20Proxy.toString(),
      ]);
    }
  });

  const tokenWrappers: Address[] = await promisesSerial(tokenWrappersPromises);

  const zrxToken = tokens.find(R.propEq('symbol', 'ZRX'));
  ensure(
    !!zrxToken,
    `No ZRX token found in provided tokens: ${tokens
      .map(R.prop('symbol'))
      .join(', ')}`,
  );

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
    exchange: zeroExExchangeAddress,
    wrapperPairs,
    wrapperRegistryEFX,
  };
};
