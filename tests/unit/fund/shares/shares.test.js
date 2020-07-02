import { BN, toWei } from 'web3-utils';
import { call, send } from '~/utils/deploy-contract';
import { BNExpDiv } from '~/utils/BNmath';
import { CONTRACT_NAMES } from '~/utils/constants';
import { setupFundWithParams } from '~/utils/fund';
import { getDeployed } from '~/utils/getDeployed';
import mainnetAddrs from '~/config';

let deployer, manager, investor, thirdParty;
let defaultTxOpts, investorTxOpts, gasPrice;
let weth;
let registry, sharesRequestor;
let defaultBuyShares;

beforeAll(async () => {
  [deployer, manager, investor] = await web3.eth.getAccounts();
  gasPrice = toWei('2', 'gwei');
  defaultTxOpts = { from: deployer, gas: 8000000, gasPrice };
  investorTxOpts = { ...defaultTxOpts, from: investor };

  registry = getDeployed(CONTRACT_NAMES.REGISTRY);
  sharesRequestor = getDeployed(CONTRACT_NAMES.SHARES_REQUESTOR);
  weth = getDeployed(CONTRACT_NAMES.WETH, mainnetAddrs.tokens.WETH);

  defaultBuyShares = {
    buyer: investor,
    denominationAssetToken: weth,
    investmentAmount: toWei('1', 'ether'),
    minSharesQuantity: 0,
    txOpts: investorTxOpts,
  };
});

// TODO: can test for _hub and _registry also, but let's see how the hub/spoke system changes
describe('constructor', () => {
  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

    await setupFundWithParams({
      defaultTokens,
      quoteToken: weth.options.address,
      fundFactory,
      manager
    });
  });
});

describe('buyShares', () => {
  let fund;
  let buySharesTxBlock;
  let expectedShares;
  let preBuyerShares, postBuyerShares, preTotalShares, postTotalShares;
  let preCallerDenominationAsset, postCallerDenominationAsset;
  let preFundBalanceOfDenominationAsset, postFundBalanceOfDenominationAsset;
  let preVaultDenominationAsset, postVaultDenominationAsset;

  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

    fund = await setupFundWithParams({
      fundFactory,
      quoteToken: weth.options.address,
      fundFactory,
      manager
    });
  });

  afterAll(async () => {
    await send(
      registry,
      'setSharesRequestor',
      [sharesRequestor.options.address],
      defaultTxOpts
    );
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
          defaultBuyShares.investmentAmount,
          defaultBuyShares.minSharesQuantity
        ],
        defaultTxOpts
      )
    ).rejects.toThrowFlexible("Only SharesRequestor can call this function")
  });

  it('succeeds when called by sharesRequestor', async () => {
    await send(registry, 'setSharesRequestor', [deployer], defaultTxOpts);

    preFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
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

    const sharePrice = new BN(await call(fund.shares, 'calcSharePrice'));
    expectedShares = BNExpDiv(new BN(defaultBuyShares.investmentAmount), sharePrice);
    await expect(
      send(
        fund.shares,
        'buyShares',
        [
          defaultBuyShares.buyer,
          defaultBuyShares.investmentAmount,
          defaultBuyShares.minSharesQuantity
        ],
        defaultTxOpts
      )
    ).resolves.not.toThrow()

    buySharesTxBlock = await web3.eth.getBlockNumber();
    postFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
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
    expect(postBuyerShares.sub(preBuyerShares)).bigNumberEq(expectedShares);
    expect(postTotalShares.sub(preTotalShares)).bigNumberEq(expectedShares);
    // 2. Investment asset transferred
    expect(preCallerDenominationAsset.sub(postCallerDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    expect(postVaultDenominationAsset.sub(preVaultDenominationAsset)).bigNumberEq(
      new BN(defaultBuyShares.investmentAmount)
    );
    // 3. Fund internal accounting increased
    expect(postFundBalanceOfDenominationAsset.sub(preFundBalanceOfDenominationAsset)).bigNumberEq(
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
    expect(eventValues.sharesQuantity).toBe(expectedShares.toString());
    expect(eventValues.investmentAmount).toBe(defaultBuyShares.investmentAmount);
  });
});

// TODO: need to account for fees here too?
describe('redeemShares', () => {
  let fund;
  let redeemTxBlock;
  let preFundBalanceOfDenominationAsset, postFundBalanceOfDenominationAsset;
  let preRedeemerDenominationAsset, postRedeemerDenominationAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      fundFactory,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: weth
      },
      fundFactory,
      quoteToken: weth.options.address,
      manager
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
    preFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
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
    postFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
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
    expect(preFundBalanceOfDenominationAsset.sub(postFundBalanceOfDenominationAsset)).bigNumberEq(
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
    expect(eventValues.sharesQuantity).toBe(preRedeemerShares.toString());
    expect(eventValues.receivedAssets).toEqual(
      [defaultBuyShares.denominationAssetToken.options.address]
    );
    expect(eventValues.receivedAssetQuantities).toEqual([defaultBuyShares.investmentAmount]);
  });
});

describe('redeemSharesQuantity', () => {
  let fund;
  let halfOfDenominationAsset, halfOfShares;
  let redeemTxBlock;
  let preFundBalanceOfDenominationAsset, postFundBalanceOfDenominationAsset;
  let preRedeemerDenominationAsset, postRedeemerDenominationAsset, preRedeemerShares, postRedeemerShares;

  beforeAll(async () => {
    const fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY);

    // Buy shares directly via initial investment
    fund = await setupFundWithParams({
      fundFactory,
      initialInvestment: {
        contribAmount: defaultBuyShares.investmentAmount,
        investor: defaultBuyShares.buyer,
        tokenContract: weth
      },
      fundFactory,
      quoteToken: weth.options.address,
      manager
    });

    halfOfDenominationAsset = new BN(defaultBuyShares.investmentAmount).div(new BN(2));
    preRedeemerShares = new BN(await call(fund.shares, 'balanceOf', [defaultBuyShares.buyer]));
  });

  it('can NOT be called by a user without enough shares', async () => {
    const sharesPlusOne = preRedeemerShares.add(new BN(1)).toString();

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
    preFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
      )
    );
    preRedeemerDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [defaultBuyShares.buyer]
      )
    );

    halfOfShares = preRedeemerShares.div(new BN(2));
    await expect(
      send(
        fund.shares,
        'redeemSharesQuantity',
        [halfOfShares.toString()],
        defaultBuyShares.txOpts
      )
    ).resolves.not.toThrow()

    redeemTxBlock = await web3.eth.getBlockNumber();
    postFundBalanceOfDenominationAsset = new BN(
      await call(
        defaultBuyShares.denominationAssetToken,
        'balanceOf',
        [fund.vault.options.address]
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
    expect(preFundBalanceOfDenominationAsset.sub(postFundBalanceOfDenominationAsset)).bigNumberEq(
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
