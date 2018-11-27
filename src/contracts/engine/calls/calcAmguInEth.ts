import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Address } from '@melonproject/token-math/address';
import { multiply, BigInteger } from '@melonproject/token-math/bigInteger';
import { toAtomic } from '@melonproject/token-math/price';
import { createQuantity } from '@melonproject/token-math/quantity';
import { getAmguPrice } from '~/contracts/version/calls/getAmguPrice';
import { getPrices } from '~/contracts/prices/calls/getPrices';
import { getPriceSource } from './getPriceSource';
import { getVersion } from './getVersion';
import { getAmguToken } from './getAmguToken';

const calcAmguInEth = async (
  contractAddress: Address,
  gasEstimation: number,
  environment = getGlobalEnvironment(),
) => {
  const amguToken = await getAmguToken(contractAddress, environment);
  const versionAddress = await getVersion(contractAddress, environment);
  const priceSourceAddress = await getPriceSource(contractAddress, environment);
  const mlnPerAmgu = await getAmguPrice(versionAddress, environment);
  const ethPerMln = await getPrices(
    priceSourceAddress,
    [amguToken],
    false,
    environment,
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
