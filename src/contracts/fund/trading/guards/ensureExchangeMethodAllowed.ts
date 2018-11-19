import { ensure } from '~/utils/guards';

const ensureExchangeMethodAllowed = async (address, method, environment) => {
  // TODO:
  const signature = await getMethodNameSignature(environment, method);
  const canonicalPriceFeedContract = await getCanonicalPriceFeedContract(
    environment,
  );

  const isExchangeMethodAllowed = await canonicalPriceFeedContract.instance.exchangeMethodIsAllowed.call(
    {},
    [address, signature],
  );

  ensure(isExchangeMethodAllowed, 'This exchange method is not allowed.');
};

export { ensureExchangeMethodAllowed };
