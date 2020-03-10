import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';

let deployer;
let defaultTxOpts;
let weth, mln;
let testingPriceFeed;
let fund;
const exaUnit = toWei('1', 'ether');

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;
  const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  testingPriceFeed = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];
  weth = contracts.WETH;
  mln = contracts.MLN;

  await send(
    testingPriceFeed,
    'update',
    [[weth.options.address, mln.options.address], [exaUnit, exaUnit]],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address],
    manager: deployer,
    quoteToken: weth.options.address,
    fundFactory
  });
});

it('(contract) has correct values after initialization', async () => {
  const { accounting } = fund;

  await expect(
    call(accounting, 'getOwnedAssetsLength')
  ).resolves.toBe('0');
  await expect(
    call(accounting, 'DENOMINATION_ASSET')
  ).resolves.toBe(weth.options.address);
});

describe('calcFundMetrics', () => {
  it('correctly calculates values after initialization', async () => {
    const { accounting } = fund;

    const fundCalcs = await call(accounting, 'calcFundMetrics');

    expect(fundCalcs.gav_).toBe('0');
    expect(fundCalcs.feesInDenominationAsset_).toBe('0');
    expect(fundCalcs.feesInShares_).toBe('0');
    expect(fundCalcs.nav_).toBe('0');
    expect(fundCalcs.sharePrice_).toBe(exaUnit);
  });

  it('correctly calculates values after investment', async() => {
    const { accounting, hub } = fund;

    const contribAmount = toWei('1', 'ether');

    await investInFund({
      fundAddress: hub.options.address,
      investment: {
        contribAmount,
        investor: deployer,
        isInitial: true,
        tokenContract: weth
      }
    });

    const fundCalcs = await call(accounting, 'calcFundMetrics');
    expect(new BN(fundCalcs.gav_)).bigNumberEq(new BN(contribAmount));
    expect(fundCalcs.feesInDenominationAsset_).toBe('0');
    expect(fundCalcs.feesInShares_).toBe('0');
    expect(fundCalcs.nav_).toBe(fundCalcs.gav_);
    expect(fundCalcs.sharePrice_).toBe(exaUnit);
  });
});
