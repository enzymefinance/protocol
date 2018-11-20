import { ensure } from '~/utils/guards';

const ensurePriceFeed = async (
  makerAssetSymbol,
  takerAssetSymbol,
  environment,
) => {
  // TODO:
  const [
    isRecent,
  ] = await canonicalPriceFeedContract.instance.getReferencePriceInfo.call({}, [
    getAddress(config, makerAssetSymbol),
    getAddress(config, takerAssetSymbol),
  ]);

  ensure(isRecent, 'Pricefeed data is outdated. Please try again.');
};

export { ensurePriceFeed };
