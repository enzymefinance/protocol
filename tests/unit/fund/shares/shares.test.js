import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { setupFundWithParams } from '~/tests/utils/fund';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager, investor, thirdParty;
let defaultTxOpts, investorTxOpts, managerTxOpts, gasPrice;
let dai, mln, weth, zrx;
let registry, sharesRequestor;
let defaultBuyShares;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  managerTxOpts = { ...defaultTxOpts, from: manager };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  registry = getDeployed(CONTRACT_NAMES.REGISTRY, web3);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR, web3);

  dai = getDeployed(CONTRACT_NAMES.DAI, web3, mainnetAddrs.tokens.DAI);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ZRX, web3, mainnetAddrs.tokens.ZRX);

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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    defaultTokens = [weth.options.address, mln.options.address];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });
  });

  afterAll(async () => {
    await send(
      registry,
      'setSharesRequestor',
      [sharesRequestor.options.address],
      defaultTxOpts,
      web3
    );
  });

  it('can NOT be called by deployer or fund manager', async () => {
    await send(
      defaultBuyShares.investmentAssetContract,
      'approve',
      [fund.shares.options.address, defaultBuyShares.investmentAmount],
      defaultTxOpts,
      web3
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
        defaultTxOpts,
        web3
      )
    ).rejects.toThrowFlexible("Only SharesRequestor can call this function")
  });

  it('succeeds when called by sharesRequestor', async () => {
    await send(registry, 'setSharesRequestor', [deployer], defaultTxOpts, web3);

    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
        defaultTxOpts,
        web3
      )
    ).resolves.not.toThrow()

    buySharesTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    tokensToDisable = [dai.options.address, zrx.options.address];
    defaultTokens = [
      weth.options.address,
      mln.options.address,
      ...tokensToDisable
    ];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });
  });

  it('can NOT be called by an unauthorized user', async () => {
    await expect(
      send(
        fund.shares,
        'disableSharesInvestmentAssets',
        [tokensToDisable],
        { ...defaultTxOpts, from: thirdParty },
        web3
      )
    ).rejects.toThrowFlexible("Only the fund manager can call this function")
  });

  it('succeeds when called by an authorized user', async () => {
    preInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');

    await expect(
      send(
        fund.shares,
        'disableSharesInvestmentAssets',
        [tokensToDisable],
        managerTxOpts,
        web3
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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    tokensToEnable = [dai.options.address, zrx.options.address];
    defaultTokens = [
      weth.options.address,
      mln.options.address
    ];
    fund = await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory,
      manager,
      web3
    });
  });

  it('can NOT be called by an unauthorized user', async () => {
    await expect(
      send(
        fund.shares,
        'enableSharesInvestmentAssets',
        [tokensToEnable],
        { ...defaultTxOpts, from: thirdParty },
        web3
      )
    ).rejects.toThrowFlexible("Only the fund manager can call this function")
  });

  it('succeeds when called by an authorized user', async () => {
    preInvestmentAssets = await call(fund.shares, 'getSharesInvestmentAssets');

    await expect(
      send(
        fund.shares,
        'enableSharesInvestmentAssets',
        [tokensToEnable],
        managerTxOpts,
        web3
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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: defaultBuyShares.investmentAssetContract
      },
      fundFactory,
      manager,
      web3
    });
  });

  it('can NOT be called by a user with no shares', async () => {
    await expect(
      send(
        fund.shares,
        'redeemShares',
        [],
        { ...defaultTxOpts, from: thirdParty },
        web3
      )
    ).rejects.toThrowFlexible("_sharesQuantity must be > 0")
  });

  it('succeeds when called by a user with shares', async () => {
    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
        defaultBuyShares.txOpts,
        web3
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      defaultTokens: [weth.options.address],
      quoteToken: weth.options.address,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: defaultBuyShares.investmentAssetContract
      },
      fundFactory,
      manager,
      web3
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
        defaultBuyShares.txOpts,
        web3
      )
    ).rejects.toThrowFlexible("_sharesQuantity exceeds sender balance")
  });

  it('succeeds when called by a user with shares', async () => {
    preFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
        defaultBuyShares.txOpts,
        web3
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundHoldingsInvestmentAsset = new BN(
      await call(
        fund.vault,
        'assetBalances',
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
