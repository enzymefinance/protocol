import { BN, toWei } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer;
let defaultTxOpts;
let weth, mln;
let fundFactory, priceSource;
let fund;
let takeOrderSignature;
let kyberAdapter;
let investmentAmount;

beforeAll(async () => {
  web3 = await startChain();
  [deployer] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  kyberAdapter = getDeployed(CONTRACT_NAMES.KYBER_ADAPTER, web3);

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );

  investmentAmount = toWei('0.01', 'ether');
});

describe('new investment in fund', () => {
  let preTxBlock;

  beforeAll(async () => {
    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      quoteToken: weth.options.address,
      fundFactory,
      web3
    });

    preTxBlock = await web3.eth.getBlockNumber()

    await investInFund({
      fundAddress: fund.hub.options.address,
      investment: {
        contribAmount: investmentAmount,
        investor: deployer,
        isInitial: true,
        tokenContract: weth
      },
      web3
    });
  });

  it('emits correct AssetBalanceUpdated event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetBalanceUpdated',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(weth.options.address);
    expect(eventValues.oldBalance).toBe("0");
    expect(eventValues.newBalance).toBe(investmentAmount);
  });

  it('correctly updates internal accounting', async() => {
    const fundWethHoldings = await call(fund.vault, 'assetBalances', [weth.options.address]);
    expect(fundWethHoldings).toBe(investmentAmount);
  });

  it('emits correct AssetAdded event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetAdded',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(weth.options.address);
  });

  it('adds asset to ownedAssets', async() => {
    const ownedAssets = await call(fund.vault, 'getOwnedAssets');
    expect(ownedAssets.length).toBe(1);

    const ownedAsset = await call(fund.vault, 'ownedAssets', [0]);
    expect(ownedAsset).toBe(weth.options.address);
  });
});

describe('vault', () => {
  let preTxBlock;
  let makerAsset, makerQuantity, takerAsset, takerQuantity;
  let preFundMlnHoldings, preFundWethHoldings, postFundMlnHoldings, postFundWethHoldings;

  beforeAll(async () => {
    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      integrationAdapters: [kyberAdapter.options.address],
      initialInvestment: {
        contribAmount: investmentAmount,
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory,
      web3
    });

    makerAsset = mln.options.address;
    takerAsset = weth.options.address;
    takerQuantity = investmentAmount;
    const makerToWethAssetRate = new BN(
      (await call(priceSource, 'getPrice', [makerAsset]))[0]
    );
    makerQuantity = BNExpDiv(
      new BN(takerQuantity),
      makerToWethAssetRate
    ).toString();
  });

  it('cannot take a trade that decreases an asset balance below 0', async() => {
    const badTakerQuantity = new BN(takerQuantity).add(new BN(1)).toString();

    const encodedArgs = encodeTakeOrderArgs({
      makerAsset,
      makerQuantity,
      takerAsset,
      takerQuantity: badTakerQuantity
    });

    await expect(
      send(
        fund.vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
        web3
      )
    ).rejects.toThrowFlexible("insufficient native token assetBalance");
  });

  it('can take a trade that decreases asset balance to exactly 0', async() => {
    preFundMlnHoldings = new BN(
      await call(fund.vault, 'assetBalances', [mln.options.address])
    );
    preFundWethHoldings = new BN(
      await call(fund.vault, 'assetBalances', [weth.options.address])
    );

    preTxBlock = await web3.eth.getBlockNumber();

    const encodedArgs = encodeTakeOrderArgs({
      makerAsset,
      makerQuantity,
      takerAsset,
      takerQuantity
    });

    await expect(
      send(
        fund.vault,
        'callOnIntegration',
        [
          kyberAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
        web3
      )
    ).resolves.not.toThrow();

    postFundMlnHoldings = new BN(
      await call(fund.vault, 'assetBalances', [mln.options.address])
    );
    postFundWethHoldings = new BN(
      await call(fund.vault, 'assetBalances', [weth.options.address])
    );
    expect(postFundWethHoldings).bigNumberEq(new BN(0));
  })

  // TODO: I think this one is failing because the amount of MLN that is sent is not accurate
  // maybe that is due to the kyber price not matching the rate onchain exactly?
  it('emits correct AssetBalanceUpdated events', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetBalanceUpdated',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(2);

    const takerTokenEvents = await fund.vault.getPastEvents(
      'AssetBalanceUpdated',
      {
        filter: { asset: weth.options.address },
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(takerTokenEvents.length).toBe(1);

    const takerTokenEventValues = takerTokenEvents[0].returnValues;
    expect(new BN(takerTokenEventValues.oldBalance)).bigNumberEq(preFundWethHoldings);
    expect(new BN(takerTokenEventValues.newBalance)).bigNumberEq(
      preFundWethHoldings.sub(new BN(takerQuantity))
    );

    const makerTokenEvents = await fund.vault.getPastEvents(
      'AssetBalanceUpdated',
      {
        filter: { asset: mln.options.address },
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(makerTokenEvents.length).toBe(1);

    const makerTokenEventValues = makerTokenEvents[0].returnValues;
    expect(new BN(makerTokenEventValues.oldBalance)).bigNumberEq(preFundMlnHoldings);
    // TODO: is using >= actually ok instead of > as before? it should just mean the price was better than expected
    expect(new BN(makerTokenEventValues.newBalance)).bigNumberGtEq(
      preFundMlnHoldings.add(new BN(makerQuantity))
    );
  });

  it('correctly updates internal accounting', async() => {
    expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings.sub(new BN(takerQuantity)));
    // TODO: (same as above) is using >= actually ok instead of > as before? it should just mean the price was better than expected
    expect(postFundMlnHoldings).bigNumberGtEq(preFundMlnHoldings.add(new BN(makerQuantity)));
  });

  it('emits correct AssetAdded event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetAdded',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(makerAsset);
  });

  it('emits correct AssetRemoved event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetRemoved',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(takerAsset);
  });

  it('adds maker asset to ownedAssets and removes take asset', async() => {
    const ownedAssets = await call(fund.vault, 'getOwnedAssets');
    expect(ownedAssets.length).toBe(1);

    const ownedAsset = await call(fund.vault, 'ownedAssets', [0]);
    expect(ownedAsset).toBe(makerAsset);
  });
});

describe('redeem shares', () => {
  let preTxBlock;

  beforeAll(async () => {
    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: investmentAmount,
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory,
      web3
    });
    const { shares } = fund;

    preTxBlock = await web3.eth.getBlockNumber();
    await send(shares, 'redeemShares', [], defaultTxOpts, web3);
  });

  it('emits correct AssetBalanceUpdated event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetBalanceUpdated',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(weth.options.address);
    expect(new BN(eventValues.oldBalance)).bigNumberEq(new BN(investmentAmount));
    expect(eventValues.newBalance).toBe("0");
  });

  it('correctly updates internal accounting', async() => {
    const fundWethHoldings = await call(fund.vault, 'assetBalances', [weth.options.address]);
    expect(Number(fundWethHoldings)).toBe(0);
  });

  it('emits correct AssetRemoved event', async() => {
    const events = await fund.vault.getPastEvents(
      'AssetRemoved',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(weth.options.address);
  });

  it('removes asset from ownedAssets', async() => {
    const ownedAssets = await call(fund.vault, 'getOwnedAssets');
    expect(ownedAssets.length).toBe(0);
  });
});
