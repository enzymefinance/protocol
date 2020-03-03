import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, randomHex, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { call, deploy, send } from '~/deploy/utils/deploy-contract';
import getAccounts from '~/deploy/utils/getAccounts';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import { getFunctionSignature } from '~/tests/utils/metadata';

let deployer;
let defaultTxOpts;
let weth, mln;
let fundFactory;
let fund;
let takeOrderSignature;
let mockExchangeAddress, mockAdapterAddress;
let investmentAmount;

beforeAll(async () => {
  [deployer] = await getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };

  const deployed = await partialRedeploy([CONTRACT_NAMES.FUND_FACTORY]);
  const contracts = deployed.contracts;

  const registry = contracts[CONTRACT_NAMES.REGISTRY];
  fundFactory = contracts[CONTRACT_NAMES.FUND_FACTORY];
  weth = contracts.WETH;
  mln = contracts.MLN;

  // Register a mock exchange and adapter
  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder'
  );
  mockExchangeAddress = randomHex(20);
  const mockAdapter = await deploy(CONTRACT_NAMES.MOCK_ADAPTER);
  mockAdapterAddress = mockAdapter.options.address;
  await send(
    registry,
    'registerExchangeAdapter',
    [
      mockExchangeAddress,
      mockAdapterAddress,
      [encodeFunctionSignature(takeOrderSignature)]
    ],
    defaultTxOpts
  );

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
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
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

  it('correctly updates accounting', async() => {
    const { accounting } = fund;

    const fundWethHoldings = await call(accounting, 'assetBalances', [weth.options.address]);
    expect(fundWethHoldings).toBe(investmentAmount);
  });

  it('emits correct AssetAddition event', async() => {
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
      'AssetAddition',
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
    const { accounting } = fund;

    const ownedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("1");

    const ownedAsset = await call(accounting, 'ownedAssets', [0]);
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
      exchanges: [mockExchangeAddress],
      exchangeAdapters: [mockAdapterAddress],
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
    makerQuantity = new BN(investmentAmount).mul(new BN(2)).toString();
    takerAsset = weth.options.address;
    takerQuantity = investmentAmount;
  });

  it('cannot take a trade that decreases an asset balance below 0', async() => {
    const { vault } = fund;

    const makerAddress = EMPTY_ADDRESS;
    const takerAddress = EMPTY_ADDRESS;
    const makerFeeAsset = EMPTY_ADDRESS;
    const takerFeeAsset = EMPTY_ADDRESS;
    const badTakerQuantity = new BN(investmentAmount).add(new BN(1)).toString();
    const fillAmount = badTakerQuantity;

    const orderAddresses = [];
    const orderValues = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = takerAddress;
    orderAddresses[2] = makerAsset;
    orderAddresses[3] = takerAsset;
    orderAddresses[4] = makerFeeAsset;
    orderAddresses[5] = takerFeeAsset;
    orderValues[0] = makerQuantity;
    orderValues[1] = badTakerQuantity;
    orderValues[2] = fillAmount;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs = web3.utils.hexToBytes(hex);

    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        defaultTxOpts,
      )
    ).rejects.toThrowFlexible("new balance cannot be less than 0");
  });

  it('can take a trade that decreases asset balance to exactly 0', async() => {
    const { accounting, vault } = fund;

    preFundMlnHoldings = new BN(
      await call(accounting, 'assetBalances', [mln.options.address])
    );
    preFundWethHoldings = new BN(
      await call(accounting, 'assetBalances', [weth.options.address])
    );

    preTxBlock = await web3.eth.getBlockNumber();

    const makerAddress = EMPTY_ADDRESS;
    const takerAddress = EMPTY_ADDRESS;
    const makerFeeAsset = EMPTY_ADDRESS;
    const takerFeeAsset = EMPTY_ADDRESS;
    const fillAmount = takerQuantity;

    const orderAddresses = [];
    const orderValues = [];

    orderAddresses[0] = makerAddress;
    orderAddresses[1] = takerAddress;
    orderAddresses[2] = makerAsset;
    orderAddresses[3] = takerAsset;
    orderAddresses[4] = makerFeeAsset;
    orderAddresses[5] = takerFeeAsset;
    orderValues[0] = makerQuantity;
    orderValues[1] = takerQuantity;
    orderValues[2] = fillAmount;

    const hex = web3.eth.abi.encodeParameters(
      ['address[6]', 'uint256[3]'],
      [orderAddresses, orderValues],
    );
    const encodedArgs = web3.utils.hexToBytes(hex);

    await expect(
      send(
        vault,
        'callOnExchange',
        [
          exchangeIndex,
          takeOrderSignature,
          '0x0',
          encodedArgs,
        ],
        defaultTxOpts,
      )
    ).resolves.not.toThrow();

    postFundMlnHoldings = new BN(
      await call(accounting, 'assetBalances', [mln.options.address])
    );
    postFundWethHoldings = new BN(
      await call(accounting, 'assetBalances', [weth.options.address])
    );
    expect(postFundWethHoldings).bigNumberEq(new BN(0));
  })

  it('emits correct AssetBalanceUpdated events', async() => {
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
      'AssetBalanceUpdated',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(2);

    const takerTokenEvents = await accounting.getPastEvents(
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

    const makerTokenEvents = await accounting.getPastEvents(
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

  it('correctly updates accounting', async() => {
    expect(postFundWethHoldings).bigNumberEq(preFundWethHoldings.sub(new BN(takerQuantity)));
    expect(postFundMlnHoldings).bigNumberEq(preFundMlnHoldings.add(new BN(makerQuantity)));
  });

  it('emits correct AssetAddition event', async() => {
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
      'AssetAddition',
      {
        fromBlock: Number(preTxBlock)+1,
        toBlock: 'latest'
      }
    );
    expect(events.length).toBe(1);

    const eventValues = events[0].returnValues;
    expect(eventValues.asset).toBe(makerAsset);
  });

  it('emits correct AssetRemoval event', async() => {
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
      'AssetRemoval',
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
    const { accounting } = fund;

    const ownedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("1");

    const ownedAsset = await call(accounting, 'ownedAssets', [0]);
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
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
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

  it('correctly updates accounting', async() => {
    const { accounting } = fund;

    const fundWethHoldings = await call(accounting, 'assetBalances', [weth.options.address]);
    expect(Number(fundWethHoldings)).toBe(0);
  });

  it('emits correct AssetRemoval event', async() => {
    const { accounting } = fund;

    const events = await accounting.getPastEvents(
      'AssetRemoval',
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
    const { accounting } = fund;

    const ownedAssetsLength = await call(accounting, 'getOwnedAssetsLength');
    expect(ownedAssetsLength).toBe("0");
  });
});
