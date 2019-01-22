import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import { PriceInterface, toAtomic } from '@melonproject/token-math';
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

const prepareArgs: PrepareArgsFunction<SetBaseRateArgs> = async (
  environment,
  { prices, blockNumber: givenBlockNumber },
) => {
  environment.logger('debug', LogLevels.DEBUG, prices);

  const numberOfTokens = prices.length;

  const tokens = isBuySell(prices)
    ? prices.map(p => p.buy.base.token.address.toString())
    : prices.map(p => p.base.token.address.toString());

  const baseBuy = isBuySell(prices)
    ? prices.map(p => `${toAtomic(p.buy)}`)
    : prices.map(p => `${toAtomic(p)}`);

  const baseSell = isBuySell(prices)
    ? prices.map(p => `${toAtomic(p.sell)}`)
    : prices.map(p => `${toAtomic(p)}`);

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
