import {
  Address,
  createQuantity,
  TokenInterface,
} from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

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
    maxSpread = 0.5,
    kyberNetworkProxy,
  }: DeployKyberPriceFeed,
) => {
  const maxSpreadInWei = createQuantity(
    quoteToken,
    maxSpread,
  ).quantity.toString();

  const address = await deployContract(environment, Contracts.KyberPriceFeed, [
    registry.toString(),
    kyberNetworkProxy.toString(),
    maxSpreadInWei,
    quoteToken.address.toString(),
  ]);

  return address;
};

export { deployKyberPriceFeed };
