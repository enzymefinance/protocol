import { TokenInterface } from '@melonproject/token-math/token';
import { Address } from '@melonproject/token-math/address';

import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math/quantity';

interface DeployKyberPriceFeed {
  registry: Address;
  quoteToken: TokenInterface;
  maxSpread?: number;
  kyberNetworkProxy: Address;
}

const deployKyberPriceFeed = async (
  environment: Environment,
  {
    registry,
    quoteToken,
    maxSpread = 0.1,
    kyberNetworkProxy,
  }: DeployKyberPriceFeed,
) => {
  const maxSpreadInWei = createQuantity(
    quoteToken,
    maxSpread,
  ).quantity.toString();

  const address = await deployContract(environment, Contracts.KyberPriceFeed, [
    registry,
    kyberNetworkProxy.toString(),
    maxSpreadInWei,
    quoteToken.address.toString(),
  ]);

  return address;
};

export { deployKyberPriceFeed };
