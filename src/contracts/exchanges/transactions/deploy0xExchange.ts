import { assetDataUtils } from '0x.js';

import { deploy as deployContract, getContract } from '~/utils/solidity';
import { TokenInterface } from '@melonproject/token-math/token';
import { Contracts } from '~/Contracts';
import { getGlobalEnvironment, getWeb3Options } from '~/utils/environment';

interface Deploy0xExchangeArgs {
  zrxToken: TokenInterface;
}

export const deploy0xExchange = async (
  { zrxToken }: Deploy0xExchangeArgs,
  environment = getGlobalEnvironment(),
) => {
  const exchange = await deployContract(
    Contracts.ZeroExExchange,
    [],
    environment,
  );

  const exchangeContract = await getContract(
    Contracts.ZeroExExchange,
    exchange,
    environment,
  );

  const erc20Proxy = await deployContract(
    Contracts.ERC20Proxy,
    [],
    environment,
  );

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
