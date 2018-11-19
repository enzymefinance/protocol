import { ensure } from '~/utils/guards';

const ensureNoOpenOrderForAsset = async (
  fund,
  makerAssetSymbol,
  environment,
) => {
  // TODO:
  const quantityHeldInCustodyOfExchange = await fundContract.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [getAddress(config, makerAssetSymbol)],
  );

  ensure(
    quantityHeldInCustodyOfExchange.eq(new BigNumber(0)),
    `Only one open order is allowed per asset. Please wait or cancel your existing open order on ${makerAssetSymbol}`,
  );
};

export { ensureNoOpenOrderForAsset };
