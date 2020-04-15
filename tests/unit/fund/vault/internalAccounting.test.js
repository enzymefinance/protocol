import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { BNExpDiv } from '~/tests/utils/BNmath';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { encodeTakeOrderArgs } from '~/tests/utils/formatting';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts;
let weth, mln;
let fundFactory, priceSource;
let fund;
let takeOrderSignature;
let kyberNetworkProxy, kyberAdapter;
let investmentAmount;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  priceSource = contracts[CONTRACT_NAMES.TESTING_PRICEFEED];
  weth = contracts.WETH;
  mln = contracts.MLN;

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
  kyberAdapter = contracts.KyberAdapter;
  kyberNetworkProxy = contracts.KyberNetworkProxy;

  investmentAmount = toWei('1', 'ether');
});

describe('new investment in fund', () => {
  let preTxBlock;

  beforeAll(async () => {
    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      quoteToken: weth.options.address,
      fundFactory
    });

    preTxBlock = await web3.eth.getBlockNumber()

    await investInFund({
      fundAddress: fund.hub.options.address,
      investment: {
        contribAmount: investmentAmount,
        investor: deployer,
        isInitial: true,
        tokenContract: weth
      }
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
    const ownedAssetsLength = await call(fund.vault, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("1");

    const ownedAsset = await call(fund.vault, 'ownedAssets', [0]);
    expect(ownedAsset).toBe(weth.options.address);
  });
});

describe('vault', () => {
  let preTxBlock;
  let makerAsset, makerQuantity, takerAsset, takerQuantity;
  let preFundMlnHoldings, preFundWethHoldings, postFundMlnHoldings, postFundWethHoldings;
  let exchangeIndex;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];

    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      exchanges: [kyberNetworkProxy.options.address],
      exchangeAdapters: [kyberAdapter.options.address],
      initialInvestment: {
        contribAmount: investmentAmount,
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory
    });
    exchangeIndex = 0;

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
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          encodedArgs,
        ],
        defaultTxOpts,
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
    expect(new BN(makerTokenEventValues.newBalance)).bigNumberEq(
      preFundMlnHoldings.add(new BN(makerQuantity))
    );
  });

  it('correctly updates internal accounting', async() => {
    expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings.sub(new BN(takerQuantity)));
    expect(postFundMlnHoldings).bigNumberEq(preFundMlnHoldings.add(new BN(makerQuantity)));
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
    const ownedAssetsLength = await call(fund.vault, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("1");

    const ownedAsset = await call(fund.vault, 'ownedAssets', [0]);
    expect(ownedAsset).toBe(makerAsset);
  });
});

describe('redeem shares', () => {
  let preTxBlock;

  beforeAll(async () => {
    const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY], true);
    const contracts = deployed.contracts;
    fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
    fund = await setupFundWithParams({
      defaultTokens: [mln.options.address, weth.options.address],
      initialInvestment: {
        contribAmount: investmentAmount,
        investor: deployer,
        tokenContract: weth
      },
      quoteToken: weth.options.address,
      fundFactory
    });
    const { shares } = fund;

    preTxBlock = await web3.eth.getBlockNumber();
    await send(shares, 'redeemShares', [], defaultTxOpts);
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
    const ownedAssetsLength = await call(fund.vault, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("0");
  });
});
