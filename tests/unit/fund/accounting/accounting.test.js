import { toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { delay } from '~/tests/utils/time';

let deployer;
let defaultTxOpts;
let testingPriceFeed, weth, mln;
let fund;
const exaUnit = toWei('1', 'ether');

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
  const contracts = deployed.contracts;
  const version = contracts[CONTRACT_NAMES.VERSION];
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
    version
  });
});

test('(contract) has proper values after initialization', async () => {
  const { accounting } = fund;

  await expect(
    call(accounting, 'getOwnedAssetsLength')
  ).resolves.toBe('0');
  await expect(
    call(accounting, 'DENOMINATION_ASSET')
  ).resolves.toBe(weth.options.address);
  await expect(
    call(accounting, 'NATIVE_ASSET')
  ).resolves.toBe(weth.options.address);

  const initialCalculations = await call(accounting, 'performCalculations');

  expect(initialCalculations.gav).toBe('0');
  expect(initialCalculations.feesInDenominationAsset).toBe('0');
  expect(initialCalculations.feesInShares).toBe('0');
  expect(initialCalculations.nav).toBe('0');
  expect(initialCalculations.sharePrice).toBe(exaUnit);
});

describe('updateOwnedAssets', () => {
  test('removes zero balance asset', async () => {
    const { accounting, participation } = fund;

    const mlnInvestAmt = '10000000';
    const wantedShares = mlnInvestAmt;
    const amguAmount = toWei('0.01', 'ether');

    await send(
      mln,
      'approve',
      [participation.options.address, mlnInvestAmt],
      defaultTxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares, mlnInvestAmt, mln.options.address],
      { ...defaultTxOpts, value: amguAmount }
    );

    await send(participation, 'executeRequestFor', [deployer], defaultTxOpts);

    const fundHoldingsPreUpdate = await call(accounting, 'getFundHoldings');

    expect(fundHoldingsPreUpdate[0].length).toEqual(1);
    expect(fundHoldingsPreUpdate[1].length).toEqual(1);

    await send(participation, 'redeem', [], defaultTxOpts);

    await send(accounting, 'updateOwnedAssets', [], defaultTxOpts);

    const fundHoldingsPostUpdate = await call(accounting, 'getFundHoldings');

    expect(fundHoldingsPostUpdate[0].length).toEqual(0);
    expect(fundHoldingsPostUpdate[1].length).toEqual(0);
  });

  test('updateOwnedAssets does not remove denomination asset at zero balance', async () => {
    const { accounting, participation } = fund;

    const wethInvestAmt = '10000000';
    const wantedShares = wethInvestAmt;
    const amguAmount = toWei('0.01', 'ether');

    await send(
      weth,
      'approve',
      [participation.options.address, wethInvestAmt],
      defaultTxOpts
    );
    await send(
      participation,
      'requestInvestment',
      [wantedShares, wethInvestAmt, weth.options.address],
      { ...defaultTxOpts, value: amguAmount }
    );

    await delay(1000); // Need price update before participation executed
    await send(
      testingPriceFeed,
      'update',
      [[weth.options.address, mln.options.address], [exaUnit, exaUnit]],
      defaultTxOpts
    );

    await send(participation, 'executeRequestFor', [deployer], defaultTxOpts);

    const fundHoldingsPreUpdate = await call(accounting, 'getFundHoldings');

    expect(fundHoldingsPreUpdate[0].length).toEqual(1);
    expect(fundHoldingsPreUpdate[1].length).toEqual(1);

    await send(participation, 'redeem', [], defaultTxOpts);

    await send(accounting, 'updateOwnedAssets', [], defaultTxOpts);

    const fundHoldingsPostUpdate = await call(accounting, 'getFundHoldings');

    expect(fundHoldingsPostUpdate[0].length).toEqual(1);
    expect(fundHoldingsPostUpdate[1].length).toEqual(1);

    await expect(
      call(accounting, 'isInAssetList', [weth.options.address])
    ).resolves.toBe(true);
  });
});
