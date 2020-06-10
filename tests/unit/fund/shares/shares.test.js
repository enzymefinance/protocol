import { BN, toWei, randomHex } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';

let deployer, investor, thirdParty;
let defaultTxOpts, investorTxOpts, gasPrice;
let dai, mln, weth, zrx;
let priceSource, registry, sharesRequestor;
let defaultBuyShares;

beforeAll(async () => {
  [deployer, investor, thirdParty] = await getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  priceSource = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];
  registry = contracts[CONTRACT_NAMES.REGISTRY];
  sharesRequestor = contracts[CONTRACT_NAMES.SHARES_REQUESTOR];

  dai = contracts.DAI;
  mln = contracts.MLN;
  weth = contracts.WETH;
  zrx = contracts.ZRX;

  defaultBuyShares = {
    buyer: investor,
    denominationAssetToken: weth,
    investmentAmount: toWei('1', 'ether'),
    sharesQuantity: toWei('1', 'ether'),
    txOpts: investorTxOpts,
  };
});

// TODO: can test for _hub and _registry also, but let's see how the hub/spoke system changes
describe('constructor', () => {
  let fund;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    fund = await setupFundWithParams({
      denominationAssetToken: weth,
      fundFactory
    });
  });
});

describe('buyShares', () => {
  let fund;
  let buySharesTxBlock;
  let preBuyerShares, postBuyerShares, preTotalShares, postTotalShares;
  let preCallerDenominationAsset, postCallerDenominationAsset;
  let prefundHoldingsDenominationAsset, postFundHoldingsDenominationAsset;
  let preVaultDenominationAsset, postVaultDenominationAsset;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    fund = await setupFundWithParams({
      denominationAssetToken: weth,
      fundFactory
    });
  });

  afterAll(async () => {
    await send(registry, 'setSharesRequestor', [sharesRequestor.options.address]);
  });

  it('can NOT be called by deployer or fund manager', async () => {
    await send(
      defaultBuyShares.denominationAssetToken,
      'approve',
      [fund.shares.options.address, defaultBuyShares.investmentAmount],
      defaultTxOpts
    );
    await expect(
      send(
        fund.shares,
        'buyShares',
        [
          defaultBuyShares.buyer,
          defaultBuyShares.sharesQuantity
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Only SharesRequestor can call this function")
  });

  it('succeeds when called by sharesRequestor', async () => {
    await send(registry, 'setSharesRequestor', [deployer]);

    prefundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    preBuyerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preCallerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [deployer]
      )
    );
    preTotalShares = new BN(await call(fund.shares, 'totalSupply'));
    preVaultDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
      )
    );

    await expect(
      send(
        fund.shares,
        'buyShares',
        [
          defaultBuyShares.buyer,
          defaultBuyShares.sharesQuantity
        ],
        defaultTxOpts
      )
    ).resolves.not.toThrow()

    buySharesTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    postBuyerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postCallerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [deployer]
      )
    );
    postTotalShares = new BN(await call(fund.shares, 'totalSupply'));
    postVaultDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares created
    expect(postBuyerShares.sub(preBuyerShares)).bigNumberEq(
      new BN(defaultBuyShares.sharesQuantity)
    );
    expect(postTotalShares.sub(preTotalShares)).bigNumberEq(
      new BN(defaultBuyShares.sharesQuantity)
    );
    // 2. Investment asset transferred
    expect(preCallerDenominationAsset.sub(postCallerDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    expect(postVaultDenominationAsset.sub(preVaultDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    // 3. Fund internal accounting increased
    expect(postFundHoldingsDenominationAsset.sub(prefundHoldingsDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
  });

  it('emits correct SharesBought event', async () => {
    const events = await fund.shares.getPastEvents(
      'SharesBought',
      {
        fromBlock: buySharesTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.buyer).toBe(defaultBuyShares.buyer);
    expect(eventValues.sharesQuantity).toBe(defaultBuyShares.sharesQuantity);
    expect(eventValues.denominationAsset).toBe(
      defaultBuyShares.denominationAssetToken.options.address
    );
    expect(eventValues.investmentAmount).toBe(defaultBuyShares.investmentAmount);
  });
});

// TODO: need to account for fees here too?
describe('redeemShares', () => {
  let fund;
  let redeemTxBlock;
  let prefundHoldingsDenominationAsset, postFundHoldingsDenominationAsset;
  let preRedeemerDenominationAsset, postRedeemerDenominationAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      denominationAssetToken: weth,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
      },
      fundFactory
    });
  });

  it('can NOT be called by a user with no shares', async () => {
    await expect(
      send(
        fund.shares,
        'redeemShares',
        [],
        { ...defaultTxOpts, from: thirdParty }
      )
    ).rejects.toThrowFlexible("_sharesQuantity must be > 0")
  });

  it('succeeds when called by a user with shares', async () => {
    prefundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preRedeemerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );

    await expect(
      send(
        fund.shares,
        'redeemShares',
        [],
        defaultBuyShares.txOpts
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    postRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postRedeemerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares destroyed
    expect(postRedeemerShares).bigNumberEq(new BN(0));
    // 2. Asset returned to investor
    expect(postRedeemerDenominationAsset.sub(preRedeemerDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    // 3. Fund internal accounting decreased
    expect(prefundHoldingsDenominationAsset.sub(postFundHoldingsDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
  });

  it('emits correct SharesRedeemed event', async () => {
    const events = await fund.shares.getPastEvents(
      'SharesRedeemed',
      {
        fromBlock: redeemTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.redeemer).toBe(defaultBuyShares.buyer);
    expect(eventValues.sharesQuantity).toBe(defaultBuyShares.sharesQuantity);
    expect(eventValues.receivedAssets).toEqual(
      [defaultBuyShares.denominationAssetToken.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([defaultBuyShares.investmentAmount]);
  });
});

describe('redeemSharesQuantity', () => {
  let fund;
  let halfOfShares, halfOfDenominationAsset;
  let redeemTxBlock;
  let prefundHoldingsDenominationAsset, postFundHoldingsDenominationAsset;
  let preRedeemerDenominationAsset, postRedeemerDenominationAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      denominationAssetToken: weth,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
      },
      fundFactory
    });

    halfOfShares = new BN(defaultBuyShares.sharesQuantity).div(new BN(2));
    halfOfDenominationAsset = new BN(defaultBuyShares.investmentAmount).div(new BN(2));
  });

  it('can NOT be called by a user without enough shares', async () => {
    const sharesPlusOne = new BN(defaultBuyShares.sharesQuantity).add(new BN(1)).toString();

    await expect(
      send(
        fund.shares,
        'redeemSharesQuantity',
        [sharesPlusOne],
        defaultBuyShares.txOpts
      )
    ).rejects.toThrowFlexible("_sharesQuantity exceeds sender balance")
  });

  it('succeeds when called by a user with shares', async () => {
    prefundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preRedeemerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );

    await expect(
      send(
        fund.shares,
        'redeemSharesQuantity',
        [halfOfShares.toString()],
        defaultBuyShares.txOpts
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsDenominationAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
        [defaultBuyShares.denominationAssetToken.options.address]
      )
    );
    postRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postRedeemerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares destroyed
    expect(preRedeemerShares.sub(postRedeemerShares)).bigNumberEq(halfOfShares);
    // 2. Asset returned to investor
    expect(postRedeemerDenominationAsset.sub(preRedeemerDenominationAsset)).bigNumberEq(
      halfOfDenominationAsset
    );
    // 3. Fund internal accounting decreased
    expect(prefundHoldingsDenominationAsset.sub(postFundHoldingsDenominationAsset)).bigNumberEq(
      halfOfDenominationAsset
    );
  });

  it('emits correct SharesRedeemed event', async () => {
    const events = await fund.shares.getPastEvents(
      'SharesRedeemed',
      {
        fromBlock: redeemTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.redeemer).toBe(defaultBuyShares.buyer);
    expect(eventValues.sharesQuantity).toBe(halfOfShares.toString());
    expect(eventValues.receivedAssets).toEqual(
      [defaultBuyShares.denominationAssetToken.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([halfOfDenominationAsset.toString()]);
  });
});
