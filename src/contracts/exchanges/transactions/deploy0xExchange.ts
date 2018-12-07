import { assetDataUtils } from '@0x/order-utils';
import { TokenInterface } from '@melonproject/token-math/token';

import { Contracts } from '~/Contracts';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { deploy } from '~/utils/solidity/deploy';
import { getContract } from '~/utils/solidity/getContract';
import { getWeb3Options } from '~/utils/environment/getWeb3Options';

interface Deploy0xExchangeArgs {
  zrxToken: TokenInterface;
}

export const deploy0xExchange = async (
  { zrxToken }: Deploy0xExchangeArgs,
  environment = getGlobalEnvironment(),
) => {
  const exchange = await deploy(Contracts.ZeroExExchange, [], environment);

  const exchangeContract = await getContract(
    Contracts.ZeroExExchange,
    exchange,
    environment,
  );

  const erc20Proxy = await deploy(Contracts.ERC20Proxy, [], environment);

  const erc20ProxyContract = await getContract(
    Contracts.ERC20Proxy,
    erc20Proxy,
    environment,
  );

  const options = getWeb3Options(environment);

  await erc20ProxyContract.methods.addAuthorizedAddress(exchange).send(options);
  await exchangeContract.methods.registerAssetProxy(erc20Proxy).send(options);
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(
    zrxToken.address.toString(),
  );
  await exchangeContract.methods.changeZRXAssetData(zrxAssetData).send(options);

  return exchange;
};
