import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { PriceInterface, toAtomic } from '@melonproject/token-math/price';
import { getLatestBlock } from '~/utils/evm';
import { LogLevels } from '~/utils/environment/Environment';

interface BuySell {
  buy: PriceInterface;
  sell: PriceInterface;
}

interface SetBaseRateArgs {
  prices: BuySell[] | PriceInterface[];
  blockNumber?: number;
}

const isBuySell = (
  prices: BuySell[] | PriceInterface[],
): prices is BuySell[] => {
  if (!prices.length) return false;
  const first = prices[0];

  return (
    (<BuySell>first).buy !== undefined && (<BuySell>first).sell !== undefined
  );
};

type SetBaseRateResult = boolean;

const prepareArgs: PrepareArgsFunction<SetBaseRateArgs> = async (
  environment,
  { prices, blockNumber: givenBlockNumber },
) => {
  environment.logger('debug', LogLevels.DEBUG, prices);

  const tokens = isBuySell(prices)
    ? prices.map(p => p.buy.base.token.address.toString())
    : prices.map(p => p.base.token.address.toString());

  const baseBuy = isBuySell(prices)
    ? prices.map(p => toAtomic(p.buy))
    : prices.map(p => toAtomic(p));

  const baseSell = isBuySell(prices)
    ? prices.map(p => toAtomic(p.sell))
    : prices.map(p => toAtomic(p));

  const blockNumber =
    givenBlockNumber || (await getLatestBlock(environment)).number;

  const zeroExArray = isBuySell(prices)
    ? prices.map(p => '0x')
    : prices.map(p => '0x');

  const zeroArray = isBuySell(prices) ? prices.map(p => 0) : prices.map(p => 0);

  return [
    tokens,
    baseBuy,
    baseSell,
    zeroExArray,
    zeroExArray,
    blockNumber,
    zeroArray,
  ];
};

const setBaseRate: EnhancedExecute<
  SetBaseRateArgs,
  SetBaseRateResult
> = transactionFactory(
  'setBaseRate',
  Contracts.ConversionRates,
  undefined,
  prepareArgs,
);

export { setBaseRate };
