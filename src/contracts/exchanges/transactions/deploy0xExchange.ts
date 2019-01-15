import { TokenInterface, Address } from '@melonproject/token-math';

// tslint:disable:max-line-length
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { deployErc20Proxy } from './deployErc20Proxy';
import { addAuthorizedAddress } from '../third-party/0x/transactions/addAuthorizedAddress';
import { registerAssetProxy } from '../third-party/0x/transactions/registerAssetProxy';
import { changeZRXAsset } from '../third-party/0x/transactions/changeZRXAsset';
// tslint:enable:max-line-length

interface Deploy0xExchangeArgs {
  zrxToken: TokenInterface;
  erc20Proxy?: Address;
}

export const deploy0xExchange = async (
  environment: Environment,
  { zrxToken, erc20Proxy: givenErc20Proxy }: Deploy0xExchangeArgs,
) => {
  const exchange = await deployContract(
    environment,
    Contracts.ZeroExExchange,
    [],
  );
  const erc20Proxy = givenErc20Proxy || (await deployErc20Proxy(environment));

  await addAuthorizedAddress(environment, erc20Proxy, { exchange });
  await registerAssetProxy(environment, exchange, { assetProxy: erc20Proxy });
  await changeZRXAsset(environment, exchange, { zrxToken });

  return exchange;
};
