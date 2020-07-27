import { AddressLike, BuidlerProvider } from '@crestproject/crestproject';
import { IKyberNetworkProxy } from '../../contracts/IKyberNetworkProxy';
import { KyberPriceFeed } from '../../contracts/KyberPriceFeed';
import { Registry } from '../../contracts/Registry';
import { commonConfigSnapshot } from './commonConfig';

// Want to allow registry and quoteAsset to be mocks, so we pass them in as params
export async function kyberPriceFeedSnapshot(
  provider: BuidlerProvider,
  registry: Registry,
  kyberNetworkProxy: IKyberNetworkProxy,
  quoteAsset: AddressLike,
) {
  const commonConfig = await commonConfigSnapshot(provider);
  const signer = provider.getSigner(commonConfig.accounts.deployer);
  const kyberPriceFeed = await KyberPriceFeed.deploy(
    signer,
    registry,
    kyberNetworkProxy,
    commonConfig.kyber.maxSpread,
    quoteAsset,
    commonConfig.kyber.maxPriceDeviation,
    commonConfig.accounts.priceFeedUpdater,
  );

  return {
    kyberPriceFeed,
  };
}
