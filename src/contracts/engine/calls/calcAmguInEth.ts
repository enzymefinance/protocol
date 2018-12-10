import { Address } from '@melonproject/token-math/address';
import { multiply, BigInteger } from '@melonproject/token-math/bigInteger';
import { toAtomic } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getAmguPrice } from '~/contracts/version/calls/getAmguPrice';
import { getPrices } from '~/contracts/prices/calls/getPrices';
import { getPriceSource } from './getPriceSource';
import { getVersion } from './getVersion';
import { getAmguToken } from './getAmguToken';
import { Environment } from '~/utils/environment/Environment';

const calcAmguInEth = async (
  environment: Environment,
  contractAddress: Address,
  gasEstimation: number,
) => {
  const amguToken = await getAmguToken(environment, contractAddress);
  const versionAddress = await getVersion(environment, contractAddress);
  const priceSourceAddress = await getPriceSource(environment, contractAddress);
  const mlnPerAmgu = await getAmguPrice(environment, versionAddress);
  const ethPerMln = await getPrices(
    environment,
    priceSourceAddress,
    [amguToken],
    false,
  );

  return createQuantity(
    'ETH',
    multiply(
      new BigInteger(toAtomic(ethPerMln[0])),
      new BigInteger(mlnPerAmgu.quantity),
      new BigInteger(gasEstimation),
    ).slice(0, -18),
  );
};

export { calcAmguInEth };
