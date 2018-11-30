import { TokenInterface } from '@melonproject/token-math/token';

// tslint:disable:max-line-length
import { Contracts } from '~/Contracts';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deploy } from '~/utils/solidity/deploy';
import { Address } from '@melonproject/token-math/address';
import { deployErc20Proxy } from './deployErc20Proxy';
import { addAuthorizedAddress } from '../thirdparty/0x/transactions/addAuthorizedAddress';
import { registerAssetProxy } from '../thirdparty/0x/transactions/registerAssetProxy';
import { changeZRXAsset } from '../thirdparty/0x/transactions/changeZRXAsset';
// tslint:enable:max-line-length

interface Deploy0xExchangeArgs {
  zrxToken: TokenInterface;
  erc20Proxy?: Address;
}

export const deploy0xExchange = async (
  { zrxToken, erc20Proxy: givenErc20Proxy }: Deploy0xExchangeArgs,
  environment = getGlobalEnvironment(),
) => {
  const exchange = await deploy(Contracts.ZeroExExchange, [], environment);
  const erc20Proxy = givenErc20Proxy || (await deployErc20Proxy(environment));

  await addAuthorizedAddress(erc20Proxy, { exchange }, environment);
  await registerAssetProxy(exchange, { assetProxy: erc20Proxy }, environment);
  await changeZRXAsset(exchange, { zrxToken }, environment);

  return exchange;
};
