import { assetDataUtils } from '@0x/order-utils';
import { TokenInterface } from '@melonproject/token-math/token';
import { Contracts } from '~/Contracts';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { getWeb3Options } from '~/utils/environment/getWeb3Options';
import { Environment } from '~/utils/environment/Environment';

interface Deploy0xExchangeArgs {
  zrxToken: TokenInterface;
}

export const deploy0xExchange = async (
  environment: Environment,
  { zrxToken }: Deploy0xExchangeArgs,
) => {
  const exchange = await deployContract(
    environment,
    Contracts.ZeroExExchange,
    [],
  );

  const exchangeContract = await getContract(
    environment,
    Contracts.ZeroExExchange,
    exchange,
  );

  const erc20Proxy = await deployContract(
    environment,
    Contracts.ERC20Proxy,
    [],
  );

  const erc20ProxyContract = await getContract(
    environment,
    Contracts.ERC20Proxy,
    erc20Proxy,
  );

  const options = getWeb3Options(environment);

  await erc20ProxyContract.methods
    .addAuthorizedAddress(exchange.toString())
    .send(options);
  await exchangeContract.methods
    .registerAssetProxy(erc20Proxy.toString())
    .send(options);
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(
    zrxToken.address.toString(),
  );
  await exchangeContract.methods.changeZRXAssetData(zrxAssetData).send(options);

  return exchange;
};
