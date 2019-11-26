import { BN, padLeft, toWei } from 'web3-utils';

import { encodeFunctionSignature } from 'web3-eth-abi';
import { getFunctionSignature } from '~/tests/utils/new/metadata';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';
import { BNExpMul, BNExpInverse } from '../../utils/new/BNmath';
import {
  CONTRACT_NAMES,
  EXCHANGES,
  EMPTY_ADDRESS,
  KYBER_ETH_ADDRESS,
  TRACKS,
} from '../../utils/new/constants';

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let mln, weth;
  let routes;
  let accounting, kyberNetworkProxy, trading;
  let exchangeIndex;
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(TRACKS.TESTING);

    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );
    takeOrderSignatureBytes = encodeFunctionSignature(
      makeOrderSignature
    );

    const {
      exchangeConfigs,
      melonContracts,
      thirdPartyContracts,
    } = environment.deployment;

    const wethTokenInfo = getTokenBySymbol(environment, 'WETH');
    const mlnTokenInfo = getTokenBySymbol(environment, 'MLN');

    mln = getContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      mlnTokenInfo.address,
    );
    weth = getContract(environment, CONTRACT_NAMES.WETH, wethTokenInfo.address);

    routes = await setupInvestedTestFund(environment);

    accounting = getContract(
      environment,
      CONTRACT_NAMES.ACCOUNTING,
      routes.accountingAddress.toString(),
    );

    kyberNetworkProxy = getContract(
      environment,
      CONTRACT_NAMES.KYBER_NETWORK_PROXY,
      exchangeConfigs[EXCHANGES.KYBER].exchange.toString(),
    );

    trading = getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      routes.tradingAddress.toString(),
    );

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e =>
        e.toLowerCase() ===
        exchangeConfigs[EXCHANGES.KYBER].adapter.toLowerCase(),
    );

    const policyManager = getContract(
      environment,
      CONTRACT_NAMES.POLICY_MANAGER,
      routes.policyManagerAddress.toString(),
    );

    await policyManager.methods
      .register(
        takeOrderSignatureBytes,
        melonContracts.policies.priceTolerance.toString(),
      )
      .send(defaultTxOpts);

    // Setting rates on kyber reserve
    const priceSource = getContract(
      environment,
      CONTRACT_NAMES.PRICE_SOURCE_INTERFACE,
      melonContracts.priceSource.toString(),
    );
    const { 0: mlnPrice } = await priceSource.methods
      .getPrice(mlnTokenInfo.address)
      .call();
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice)).toString()

    const blockNumber = (await environment.eth.getBlock('latest')).number;
    const conversionRates = getContract(
      environment,
      CONTRACT_NAMES.CONVERSION_RATES,
      thirdPartyContracts.exchanges.kyber.conversionRates.toString(),
    );
    await conversionRates.methods
      .setBaseRate(
        [mlnTokenInfo.address],
        [ethPriceInMln],
        [mlnPrice],
        ['0x0'],
        ['0x0'],
        blockNumber,
        [0],
      )
      .send(defaultTxOpts);
  });

  test('Trade on kyber', async () => {
    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');

    const { 1: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(KYBER_ETH_ADDRESS, mln.options.address, takerQuantity)
      .call(defaultTxOpts);

    // Minimum quantity of dest asset expected to get in return in the trade
    const makerAsset = mln.options.address;
    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate),
    ).toString();

    const preMlnBalance = await mln.methods
      .balanceOf(routes.vaultAddress.toString())
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          makerAsset,
          takerAsset,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        padLeft('0x0', 64),
        padLeft('0x0', 64),
        padLeft('0x0', 64),
        padLeft('0x0', 64),
      )
      .send(defaultTxOpts);

    const postMlnBalance = await mln.methods
      .balanceOf(routes.vaultAddress.toString())
      .call();

    const mlnBalanceDiff = new BN(postMlnBalance).sub(new BN(preMlnBalance));
    expect(mlnBalanceDiff.gt(new BN(makerQuantity))).toBe(true);

    const holdingsRes = await accounting.methods.getFundHoldings().call();
    const holdings = holdingsRes[1].map((address, i) => {
      return { address, value: holdingsRes[0][i] };
    });

    const wethHolding = holdings.find(
      holding => holding.address === weth.options.address,
    );
    expect(
      new BN(wethHolding.value)
        .add(new BN(takerQuantity))
        .eq(new BN(toWei('1', 'ether'))),
    ).toBe(true);
  });

  test('Price tolerance prevents ill priced trade', async () => {
    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');

    // Minimum quantity of dest asset expected to get in return in the trade
    const makerAsset = mln.options.address;
    const makerQuantity = '0';

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            makerAsset,
            takerAsset,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          padLeft('0x0', 64),
          padLeft('0x0', 64),
          padLeft('0x0', 64),
          padLeft('0x0', 64),
        )
        .send(defaultTxOpts),
    ).rejects.toThrow();
  });
});
