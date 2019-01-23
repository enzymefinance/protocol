import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import {
  PriceInterface,
  toAtomic,
  createPrice,
} from '@melonproject/token-math';
import { getLatestBlock } from '~/utils/evm';
import { LogLevels } from '~/utils/environment/Environment';

// Buy / sell rate in Kyber is different from Melon's conventions
// Buy rate in reserve is price of 1 ETH in Token (E.g 10 where 1 ETH = 10 MLN)
// Sell Rate is the price of 1 Token in ETH (E.g 0.1 where 1 MLN = 0.1 ETH)
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

const toHexString = (byteArray: number[]): String => {
  return Array.from(byteArray, byte =>
    `0${(byte & 0xff).toString(16)}`.slice(-2),
  ).join('');
};

const splitArray = (arr: number[], length: number): number[][] => {
  const groups = arr
    .map((e, i) => (i % length === 0 ? arr.slice(i, i + length) : null))
    .filter(e => e);
  return groups;
};

type SetBaseRateResult = boolean;

// If buy-sell prices are not explicity passed, assumes passed price to be sell
const prepareArgs: PrepareArgsFunction<SetBaseRateArgs> = async (
  environment,
  { prices, blockNumber: givenBlockNumber },
) => {
  environment.logger('debug', LogLevels.DEBUG, prices);

  const numberOfTokens = prices.length;
  let enhancedPrices: BuySell[] = [];
  if (!isBuySell(prices)) {
    enhancedPrices = prices.map(p => ({
      buy: createPrice(p.quote, p.base),
      sell: p,
    }));
  } else {
    enhancedPrices = prices;
  }

  const tokens = enhancedPrices.map(p => p.sell.base.token.address.toString());

  const baseBuy = enhancedPrices.map(p => `${toAtomic(p.buy)}`);

  const baseSell = enhancedPrices.map(p => `${toAtomic(p.sell)}`);

  const blockNumber =
    givenBlockNumber || (await getLatestBlock(environment)).number;

  // Generate and format compact data (Set to 0)
  // Formatting info: https://developer.kyber.network/docs/ReservesGuide/
  const zeroArray = splitArray(Array<number>(numberOfTokens).fill(0), 14);
  const zeroCompactDataArray = zeroArray.map(v => `0x${toHexString(v)}`);
  const indices = Array.from(Array<number>(zeroCompactDataArray.length).keys());

  return [
    tokens,
    baseBuy,
    baseSell,
    zeroCompactDataArray,
    zeroCompactDataArray,
    blockNumber,
    indices,
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
