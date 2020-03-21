import { BN, toWei, randomHex } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';

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
    investmentAssetContract: weth,
    investmentAmount: toWei('1', 'ether'),
    sharesQuantity: toWei('1', 'ether'),
    txOpts: investorTxOpts,
  };
});

// TODO: can test for _hub and _registry also, but let's see how the hub/spoke system changes
describe('constructor', () => {
  let fund;
  let defaultTokens;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    defaultTokens = [weth.options.address, mln.options.address];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory
    }); 
  });

  it('enables _defaultAssets as investment assets', async () => {
    const investmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');
    expect(investmentAssets.length).toBe(defaultTokens.length);

    for (const token of defaultTokens) {
      expect(investmentAssets.includes(token));
      expect(await call(fund.shares, 'isSharesInvestmentAsset', [token])).toBeTruthy();
    }
  });
});

describe('buyShares', () => {
  let fund;
  let buySharesTxBlock;
  let preBuyerShares, postBuyerShares, preTotalShares, postTotalShares;
  let preCallerInvestmentAsset, postCallerInvestmentAsset;
  let preFundHoldingsInvestmentAsset, postFundHoldingsInvestmentAsset;
  let preVaultInvestmentAsset, postVaultInvestmentAsset;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      fundFactory
    });
  });

  afterAll(async () => {
    await send(registry, 'setSharesRequestor', [sharesRequestor.options.address]);
  });

  it('can NOT be called by deployer or fund manager', async () => {
    await send(
      defaultBuyShares.investmentAssetContract,
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
          defaultBuyShares.investmentAssetContract.options.address,
          defaultBuyShares.sharesQuantity
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Only SharesRequestor can call this function")
  });

  it('succeeds when called by sharesRequestor', async () => {
    await send(registry, 'setSharesRequestor', [deployer]);

    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    preBuyerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preCallerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
        'balanceOf',
        [deployer]
      )
    );
    preTotalShares = new BN(await call(fund.shares, 'totalSupply'));
    preVaultInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
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
          defaultBuyShares.investmentAssetContract.options.address,
          defaultBuyShares.sharesQuantity
        ],
        defaultTxOpts
      )
    ).resolves.not.toThrow()

    buySharesTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    postBuyerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postCallerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
        'balanceOf',
        [deployer]
      )
    );
    postTotalShares = new BN(await call(fund.shares, 'totalSupply'));
    postVaultInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
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
    expect(preCallerInvestmentAsset.sub(postCallerInvestmentAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    ); 
    expect(postVaultInvestmentAsset.sub(preVaultInvestmentAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    ); 
    // 3. Fund internal accounting increased
    expect(postFundHoldingsInvestmentAsset.sub(preFundHoldingsInvestmentAsset)).bigNumberEq(
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
    expect(eventValues.investmentAsset).toBe(
      defaultBuyShares.investmentAssetContract.options.address
    );
    expect(eventValues.investmentAmount).toBe(defaultBuyShares.investmentAmount);
  });
});

describe('disableSharesInvestmentAssets', () => {
  let fund;
  let defaultTokens, tokensToDisable;
  let preInvestmentAssets, postInvestmentAssets;
  let disableInvestmentAssetsTxBlock;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    tokensToDisable = [dai.options.address, zrx.options.address];
    defaultTokens = [
      weth.options.address,
      mln.options.address,
      ...tokensToDisable
    ];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory
    }); 
  });

  it('can NOT be called by an unauthorized user', async () => {
    await expect(
      send(
        fund.shares,
        'disableSharesInvestmentAssets',
        [tokensToDisable],
        { ...defaultTxOpts, from: thirdParty }
      )
    ).rejects.toThrowFlexible("ds-auth-unauthorized")
  });

  it('succeeds when called by an authorized user', async () => {
    preInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');

    await expect(
      send(
        fund.shares,
        'disableSharesInvestmentAssets',
        [tokensToDisable],
        defaultTxOpts
      )
    ).resolves.not.toThrow()

    disableInvestmentAssetsTxBlock = await web3.eth.getBlockNumber();
    postInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');
  });

  it('correctly updates state', async () => {
    expect(preInvestmentAssets.length - postInvestmentAssets.length).toBe(tokensToDisable.length);
    for (const token of tokensToDisable) {
      expect(!postInvestmentAssets.includes(token));
      expect(await call(fund.shares, 'isSharesInvestmentAsset', [token])).toBeFalsy();
    }
  });

  it('emits correct SharesInvestmentAssetsDisabled event', async () => {
    const events = await fund.shares.getPastEvents(
      'SharesInvestmentAssetsDisabled',
      {
        fromBlock: disableInvestmentAssetsTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.assets).toEqual(tokensToDisable);
  });
});

describe('enableSharesInvestmentAssets', () => {
  let fund;
  let defaultTokens, tokensToEnable;
  let preInvestmentAssets, postInvestmentAssets;
  let enableInvestmentAssetsTxBlock;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    tokensToEnable = [dai.options.address, zrx.options.address];
    defaultTokens = [
      weth.options.address,
      mln.options.address
    ];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory
    }); 
  });

  it('can NOT be called by an unauthorized user', async () => {
    await expect(
      send(
        fund.shares,
        'enableSharesInvestmentAssets',
        [tokensToEnable],
        { ...defaultTxOpts, from: thirdParty }
      )
    ).rejects.toThrowFlexible("ds-auth-unauthorized")
  });

  it('succeeds when called by an authorized user', async () => {
    preInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');

    await expect(
      send(
        fund.shares,
        'enableSharesInvestmentAssets',
        [tokensToEnable],
        defaultTxOpts
      )
    ).resolves.not.toThrow()

    enableInvestmentAssetsTxBlock = await web3.eth.getBlockNumber();
    postInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');
  });

  it('correctly updates state', async () => {
    expect(postInvestmentAssets.length - preInvestmentAssets.length).toBe(tokensToEnable.length);
    for (const token of tokensToEnable) {
      expect(postInvestmentAssets.includes(token));
      expect(await call(fund.shares, 'isSharesInvestmentAsset', [token])).toBeTruthy();
    }
  });

  it('emits correct SharesInvestmentAssetsEnabled event', async () => {
    const events = await fund.shares.getPastEvents(
      'SharesInvestmentAssetsEnabled',
      {
        fromBlock: enableInvestmentAssetsTxBlock,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.assets).toEqual(tokensToEnable);
  });
});

// TODO: need to account for fees here too?
describe('redeemShares', () => {
  let fund;
  let redeemTxBlock;
  let preFundHoldingsInvestmentAsset, postFundHoldingsInvestmentAsset;
  let preRedeemerInvestmentAsset, postRedeemerInvestmentAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: defaultBuyShares.investmentAssetContract
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
    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preRedeemerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
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
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    postRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postRedeemerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares destroyed
    expect(postRedeemerShares).bigNumberEq(new BN(0));
    // 2. Asset returned to investor
    expect(postRedeemerInvestmentAsset.sub(preRedeemerInvestmentAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    // 3. Fund internal accounting decreased
    expect(preFundHoldingsInvestmentAsset.sub(postFundHoldingsInvestmentAsset)).bigNumberEq(
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
      [defaultBuyShares.investmentAssetContract.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([defaultBuyShares.investmentAmount]);
  });
});

describe('redeemSharesQuantity', () => {
  let fund;
  let halfOfShares, halfOfInvestmentAsset;
  let redeemTxBlock;
  let preFundHoldingsInvestmentAsset, postFundHoldingsInvestmentAsset;
  let preRedeemerInvestmentAsset, postRedeemerInvestmentAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: defaultBuyShares.investmentAssetContract
      },
      fundFactory
    });

    halfOfShares = new BN(defaultBuyShares.sharesQuantity).div(new BN(2));
    halfOfInvestmentAsset = new BN(defaultBuyShares.investmentAmount).div(new BN(2));
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
    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    preRedeemerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
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
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [defaultBuyShares.investmentAssetContract.options.address]
      )
    );
    postRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
    postRedeemerInvestmentAsset = new BN(
      await call(
        defaultBuyShares.investmentAssetContract,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares destroyed
    expect(preRedeemerShares.sub(postRedeemerShares)).bigNumberEq(halfOfShares);
    // 2. Asset returned to investor
    expect(postRedeemerInvestmentAsset.sub(preRedeemerInvestmentAsset)).bigNumberEq(
      halfOfInvestmentAsset
    );
    // 3. Fund internal accounting decreased
    expect(preFundHoldingsInvestmentAsset.sub(postFundHoldingsInvestmentAsset)).bigNumberEq(
      halfOfInvestmentAsset
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
      [defaultBuyShares.investmentAssetContract.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([halfOfInvestmentAsset.toString()]);
  });
});

// 2 investors with equal shares, Investor B redeems for 1/2 shares quantity and only 1 of 2 fund assets
// Expected: Investor B gets 1/4 of the fund's holdings for an asset
describe('redeemSharesWithConstraints', () => {
  let fund;
  let buySharesOpts;
  let halfOfShares, quarterOfInvestmentAsset;
  let redeemTxBlock;
  let preFundHoldingsInvestmentAsset, postFundHoldingsInvestmentAsset;
  let preRedeemerInvestmentAsset, postRedeemerInvestmentAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    const fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    const tokenAddresses = [weth.options.address, mln.options.address];
    const tokenPrices = [toWei('1', 'ether'), toWei('0.5', 'ether')];

    // Set expected prices
    await send(
      priceSource,
      'update',
      [tokenAddresses, tokenPrices],
      defaultTxOpts
    );

    // 1st investment in weth
    fund = await setupFundWithParams({
      defaultTokens: tokenAddresses,
      initialInvestment: {
        contribAmount: toWei('1', 'ether'),
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory
    });

    buySharesOpts = {
      ...defaultBuyShares,
      investmentAssetContract: mln,
      investmentAmount: toWei('2', 'ether')
    };

    // 2nd investment in mln
    await investInFund({
      fundAddress: fund.hub.options.address,
      investment: {
        contribAmount: buySharesOpts.investmentAmount,
        investor,
        tokenContract: mln
      },
      tokenPriceData: {
        priceSource,
        tokenAddresses,
        tokenPrices
      }
    });

    halfOfShares = new BN(buySharesOpts.sharesQuantity).div(new BN(2));
    quarterOfInvestmentAsset = new BN(buySharesOpts.investmentAmount).div(new BN(4));
  });

  it('can NOT be called by a user without enough shares', async () => {
    const sharesPlusOne = new BN(buySharesOpts.sharesQuantity).add(new BN(1)).toString();

    await expect(
      send(
        fund.shares,
        'redeemSharesWithConstraints',
        [sharesPlusOne, [buySharesOpts.investmentAssetContract.options.address]],
        buySharesOpts.txOpts
      )
    ).rejects.toThrowFlexible("_sharesQuantity exceeds sender balance")
  });

  it('can NOT be called with an asset with a 0 balance', async () => {
    await expect(
      send(
        fund.shares,
        'redeemSharesWithConstraints',
        [
          halfOfShares.toString(),
          [
            buySharesOpts.investmentAssetContract.options.address,
            randomHex(20)
          ]
        ],
        buySharesOpts.txOpts
      )
    ).rejects.toThrowFlexible("Requested asset holdings is 0")
  });

  it('can NOT be called with a duplicate asset', async () => {
    await expect(
      send(
        fund.shares,
        'redeemSharesWithConstraints',
        [
          halfOfShares.toString(),
          [
            buySharesOpts.investmentAssetContract.options.address,
            buySharesOpts.investmentAssetContract.options.address
          ]
        ],
        buySharesOpts.txOpts
      )
    ).rejects.toThrowFlexible("Attempted to redeem duplicate asset")
  });

  it('succeeds when called by a user with enough shares', async () => {
    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [buySharesOpts.investmentAssetContract.options.address]
      )
    );
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [buySharesOpts.buyer]));
    preRedeemerInvestmentAsset = new BN(
      await call(
        buySharesOpts.investmentAssetContract,
        'balanceOf',
        [buySharesOpts.buyer]
      )
    );

    await expect(
      send(
        fund.shares,
        'redeemSharesWithConstraints',
        [halfOfShares.toString(), [buySharesOpts.investmentAssetContract.options.address]],
        buySharesOpts.txOpts
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.accounting,
        'getFundHoldingsForAsset',
        [buySharesOpts.investmentAssetContract.options.address]
      )
    );
    postRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [buySharesOpts.buyer]));
    postRedeemerInvestmentAsset = new BN(
      await call(
        buySharesOpts.investmentAssetContract,
        'balanceOf',
        [buySharesOpts.buyer]
      )
    );
  });

  it('correctly updates state', async () => {
    // 1. Shares destroyed
    expect(preRedeemerShares.sub(postRedeemerShares)).bigNumberEq(halfOfShares);
    // 2. Asset returned to investor (1/4 of amount)
    expect(postRedeemerInvestmentAsset.sub(preRedeemerInvestmentAsset)).bigNumberEq(
      quarterOfInvestmentAsset
    );
    // 3. Fund internal accounting decreased (1/4 of amount)
    expect(preFundHoldingsInvestmentAsset.sub(postFundHoldingsInvestmentAsset)).bigNumberEq(
      quarterOfInvestmentAsset
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
    expect(eventValues.redeemer).toBe(buySharesOpts.buyer);
    expect(eventValues.sharesQuantity).toBe(halfOfShares.toString());
    expect(eventValues.receivedAssets).toEqual(
      [buySharesOpts.investmentAssetContract.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([quarterOfInvestmentAsset.toString()]);
  });
});
