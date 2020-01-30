/*
 * @file Tests fund's ability to handle a malicious redemption attempts
 *
 * @test Redeem fails when malicious token is present
 * @test Redemption with non-registered assets does not succeed
 * @test redeemWithConstraints succeeds to withdraw specific assets only
 */

import { BN, toWei, randomHex } from 'web3-utils';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, deploy, send } from '~/deploy/utils/deploy-contract';
import { BNExpMul } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import getAccounts from '~/deploy/utils/getAccounts';
import { delay } from '~/tests/utils/time';

let defaultTxOpts, investorTxOpts;
let deployer, manager, investor;
let contracts;
let fund, weth, mln, priceSource, maliciousToken;

beforeAll(async () => {
  [deployer, manager, investor] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]); contracts = deployed.contracts;
  weth = contracts.WETH;
  mln = contracts.MLN;
  priceSource = contracts.TestingPriceFeed;
  const registry = contracts.Registry;
  const version = contracts.Version;

  maliciousToken = await deploy(
    CONTRACT_NAMES.MALICIOUS_TOKEN,
    ['MLC', 18, 'Malicious']
  );

  await send(priceSource, 'setDecimals', [maliciousToken.options.address, 18], defaultTxOpts);

  await send(
    registry,
    'registerAsset',
    [
      maliciousToken.options.address.toLowerCase(),
      'Malicious',
      'MLC',
      '',
      0,
      [],
      [],
    ],
    defaultTxOpts
  );

  fund = await setupFundWithParams({
    defaultTokens: [mln.options.address, weth.options.address, maliciousToken.options.address],
    initialInvestment: {
      contribAmount: toWei('1', 'ether'),
      investor, // Buy all shares with investor to make calcs simpler
      tokenContract: weth
    },
    manager,
    quoteToken: weth.options.address,
    version
  });
});

test('Trying to avoid performance fee with invalid asset addresses fails', async () => {
  const { accounting, participation, shares } = fund;
  const preInvestorShares = new BN(await call(shares, 'balanceOf', [investor]));
  const holdings = await call(accounting, 'getFundHoldings');
  const errorMessage = 'Requested asset holdings is 0';

  // TODO: convert to iterated tests
  await expect(
    send(
      participation,
      'redeemWithConstraints',
      [
        preInvestorShares.toString(),
        [randomHex(20), EMPTY_ADDRESS],
      ],
      investorTxOpts
    )
  ).rejects.toThrowFlexible(errorMessage);

  await expect(
    send(
      participation,
      'redeemWithConstraints',
      [
        preInvestorShares.toString(),
        [EMPTY_ADDRESS],
      ],
      investorTxOpts
    )
  ).rejects.toThrowFlexible(errorMessage);

  await expect(
    send(
      participation,
      'redeemWithConstraints',
      [
        preInvestorShares.toString(),
        [randomHex(20)],
      ],
      investorTxOpts
    )
  ).rejects.toThrowFlexible(errorMessage);

  await expect(
    send(
      participation,
      'redeemWithConstraints',
      [
        preInvestorShares.toString(),
        [...holdings[1], EMPTY_ADDRESS],
      ],
      investorTxOpts
    )
  ).rejects.toThrowFlexible(errorMessage);
});

test('General redeem fails in presence of malicious token', async () => {
  const { participation } = fund;
  const maliciousTokenAmount = toWei('1', 'ether');
  const wantedShares = toWei('1', 'ether');
  const amguAmount = toWei('.01', 'ether');

  // Buy shares with malicious token
  await send(maliciousToken, 'transfer', [investor, maliciousTokenAmount], defaultTxOpts);
  await send(
    maliciousToken,
    'approve',
    [participation.options.address, maliciousTokenAmount],
    investorTxOpts
  );
  await send(
    fund.participation,
    'requestInvestment',
    [wantedShares, maliciousTokenAmount, maliciousToken.options.address],
    { ...investorTxOpts, value: amguAmount }
  );
  await delay(1000); // Delay 1 sec to ensure block new blocktime
  await send(
    priceSource,
    'update',
    [
      [weth.options.address, maliciousToken.options.address],
      [toWei('1', 'ether'), toWei('1', 'ether')]
    ],
    defaultTxOpts
  );
  await send(
    participation,
    'executeRequestFor',
    [investor],
    investorTxOpts
  );

  // Activate malicious token
  await send(maliciousToken, 'startReverting', [], defaultTxOpts);

  await expect(
    send(participation, 'redeem', [], investorTxOpts)
  ).rejects.toThrowFlexible();
});

test(`Redeem with constraints works as expected`, async () => {
  const { accounting, participation, shares } = fund;

  const preMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const preWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));

  const preFundHoldingsMaliciousToken = new BN(
    await call(accounting, 'getFundAssetHoldings', [maliciousToken.options.address])
  );
  const preFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const preFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );

  const investorShares = await call(shares, 'balanceOf', [investor]);
  const preTotalSupply = new BN(await call(shares, 'totalSupply'));


  await send(
    participation,
    'redeemWithConstraints',
    [investorShares, [weth.options.address]],
    investorTxOpts
  );

  const postMlnInvestor = new BN(await call(mln, 'balanceOf', [investor]));
  const postWethInvestor = new BN(await call(weth, 'balanceOf', [investor]));

  const postFundHoldingsMln = new BN(
    await call(accounting, 'getFundAssetHoldings', [mln.options.address])
  );
  const postFundHoldingsWeth = new BN(
    await call(accounting, 'getFundAssetHoldings', [weth.options.address])
  );

  const postTotalSupply = new BN(await call(shares, 'totalSupply'));
  const postFundGav = new BN(await call(accounting, 'calcGav'));

  const maliciousTokenPrice = new BN(
    (await call(priceSource, 'getPrice', [maliciousToken.options.address]))[0]
  );
  const fundMaliciousTokenValue = BNExpMul(preFundHoldingsMaliciousToken, maliciousTokenPrice);

  expect(postTotalSupply).bigNumberEq(preTotalSupply.sub(new BN(investorShares)));
  expect(postWethInvestor).bigNumberEq(preWethInvestor.add(preFundHoldingsWeth));
  expect(postFundHoldingsWeth).bigNumberEq(new BN(0));
  expect(postFundHoldingsMln).toEqual(preFundHoldingsMln);
  expect(postMlnInvestor).toEqual(preMlnInvestor);
  expect(postFundGav).bigNumberEq(fundMaliciousTokenValue);
});
