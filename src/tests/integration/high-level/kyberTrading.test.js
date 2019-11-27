import { BN, padLeft, toWei } from 'web3-utils';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { kyberEthAddress } from '~/utils/constants/kyberEthAddress';
import { takeOrderSignatureBytes } from '~/utils/constants/orderSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { BNExpMul, BNExpInverse } from '../../utils/new/BNmath';
import { CONTRACT_NAMES, EXCHANGES } from '../../utils/new/constants';
const setupInvestedTestFund = require('../../utils/new/setupInvestedTestFund');
const web3 = require('../../../../deploy/utils/get-web3');
const deploySystem = require('../../../../deploy/scripts/deploy-system');

describe('Happy Path', () => {
  let user, defaultTxOpts;
  let mln, weth;
  let fund;
  let accounting, kyberNetworkProxy, trading, policyManager, conversionRates;
  let testingPriceFeed;
  let exchangeIndex;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = {from: user, gas: 8000000};

    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    const contracts = deployment.contracts;

    fund = await setupInvestedTestFund(contracts, user);

    weth = contracts.WETH;
    mln = contracts.MLN;
    kyberNetworkProxy = contracts.KyberNetworkProxy;
    conversionRates = contracts.ConversionRates;
    testingPriceFeed = contracts.TestingPriceFeed;
    policyManager = fund.policyManager;
    trading = fund.trading;
    accounting = fund.accounting;

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e => e.toLowerCase() === contracts.KyberAdapter.options.address.toLowerCase()
    );

    await policyManager.methods
      .register(
        takeOrderSignatureBytes,
        contracts.PriceTolerance.options.address
      ).send(defaultTxOpts);

    // Setting rates on kyber reserve
    const { 0: mlnPrice } = await testingPriceFeed.methods
      .getPrice(mln.options.address)
      .call();
    const ethPriceInMln = BNExpInverse(new BN(mlnPrice.toString())).toString()

    const blockNumber = (await web3.eth.getBlock('latest')).number;

    await conversionRates.methods
      .setBaseRate(
        [mln.options.address],
        [ethPriceInMln],
        [mlnPrice],
        ['0x0000000000000000000000000000'],
        ['0x0000000000000000000000000000'],
        blockNumber,
        [0],
      )
      .send(defaultTxOpts);
  });

  test('Trade on kyber', async () => {
    const takerAsset = weth.options.address;
    const takerQuantity = toWei('0.1', 'ether');

    const { 1: expectedRate } = await kyberNetworkProxy.methods
      .getExpectedRate(kyberEthAddress, mln.options.address, takerQuantity)
      .call(defaultTxOpts);

    // Minimum quantity of dest asset expected to get in return in the trade
    const makerAsset = mln.options.address;
    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(expectedRate.toString()),
    ).toString();

    const preMlnBalance = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        FunctionSignatures.takeOrder,
        [
          emptyAddress,
          emptyAddress,
          makerAsset,
          takerAsset,
          emptyAddress,
          emptyAddress,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        padLeft('0x0', 64),
        padLeft('0x0', 64),
        padLeft('0x0', 64),
        padLeft('0x0', 64),
      )
      .send(defaultTxOpts);

    const postMlnBalance = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    const mlnBalanceDiff = new BN(postMlnBalance.toString()).sub(new BN(preMlnBalance.toString()));
    expect(mlnBalanceDiff.gt(new BN(makerQuantity))).toBe(true);

    const holdingsRes = await accounting.methods.getFundHoldings().call();
    const holdings = holdingsRes[1].map((address, i) => {
      return { address, value: holdingsRes[0][i] };
    });

    const wethHolding = holdings.find(
      holding => holding.address === weth.options.address,
    );
    expect(
      new BN(wethHolding.value.toString())
        .add(new BN(takerQuantity.toString()))
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
          FunctionSignatures.takeOrder,
          [
            emptyAddress,
            emptyAddress,
            makerAsset,
            takerAsset,
            emptyAddress,
            emptyAddress,
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
