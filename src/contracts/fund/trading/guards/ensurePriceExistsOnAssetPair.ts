const ensurePriceExistsOnAssetPair = async (
  makerAssetSymbol,
  takerAssetSymbol,
  environment,
) => {
  // TODO:
  // const priceExists = await canonicalPriceFeedContract.instance.existsPriceOnAssetPair.call(
  //   {},
  //   [
  //     getAddress(config, makerAssetSymbol),
  //     getAddress(config, takerAssetSymbol),
  //   ],
  // );
  // ensure(
  //   priceExists,
  //   'Price not provided on this asset pair by your datafeed.',
  // );
};

export { ensurePriceExistsOnAssetPair };
