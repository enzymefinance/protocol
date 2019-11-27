import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, padLeft, toWei } from 'web3-utils';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { getContract } from '~/utils/solidity/getContract';
import { BNExpMul } from '../../utils/new/BNmath';
import { getFunctionSignature } from '../../utils/new/metadata';
import { CONTRACT_NAMES, EXCHANGES } from '../../utils/new/constants';
const {increaseTime} = require('../../utils/new/rpc');
const setupInvestedTestFund = require('../../utils/new/setupInvestedTestFund');
const web3 = require('../../../../deploy/utils/get-web3');
const deploySystem = require('../../../../deploy/scripts/deploy-system');

describe('Happy Path', () => {
  let user, defaultTxOpts;
  let engine, mln, fund, weth, engineAdapter, priceSource, priceTolerance;
  let routes;
  let exchangeIndex, mlnPrice, takerQuantity;
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    const deployment = await deploySystem(JSON.parse(require('fs').readFileSync(process.env.CONF))); // TODO: change from reading file each time
    const contracts = deployment.contracts;
    engine = contracts.Engine;
    engineAdapter = contracts.EngineAdapter;
    priceSource = contracts.TestingPriceFeed;
    priceTolerance = contracts.PriceTolerance;
    mln = contracts.MLN;
    weth = contracts.WETH;

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );
    takeOrderSignatureBytes = encodeFunctionSignature(
      takeOrderSignature
    );

    await engine.methods.setAmguPrice(toWei('1000', 'gwei')).send(defaultTxOpts);

    fund = await setupInvestedTestFund(contracts, user);

    await fund.policyManager.methods
      .register(
        takeOrderSignatureBytes,
        priceTolerance.options.address,
      )
      .send(defaultTxOpts);

    const exchangeInfo = await fund.trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e =>
        e.toLowerCase() ===
        engineAdapter.options.address.toLowerCase(),
    );
    mlnPrice = (await priceSource.methods
      .getPrice(mln.options.address)
      .call())[0];
    takerQuantity = toWei('0.001', 'ether'); // Mln sell qty
  });

  // TODO: fix failure due to web3 2.0 RPC interface (see increaseTime.js)
  it('Trade on Melon Engine', async () => {
    await increaseTime(86400 * 32);

    await engine.methods.thaw().send(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity.toString()),
      new BN(mlnPrice.toString()),
    ).toString();

    await mln.methods
      .transfer(fund.vault.options.address, takerQuantity)
      .send(defaultTxOpts);

    const preliquidEther = await engine.methods.liquidEther().call();
    const preFundWeth = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const preFundMln = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    await fund.trading.methods
      .callOnExchange(
        exchangeIndex,
        takeOrderSignature,
        [
          emptyAddress,
          emptyAddress,
          weth.options.address,
          mln.options.address,
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

    const postliquidEther = await engine.methods.liquidEther().call();
    const postFundWeth = await weth.methods
      .balanceOf(fund.vault.options.address)
      .call();
    const postFundMln = await mln.methods
      .balanceOf(fund.vault.options.address)
      .call();

    expect(
      new BN(preFundMln.toString())
        .sub(new BN(postFundMln.toString()))
        .eq(new BN(takerQuantity.toString()))
    ).toBe(true);
    expect(
      new BN(postFundWeth.toString()).sub(new BN(preFundWeth.toString())).eq(
        new BN(preliquidEther.toString()).sub(new BN(postliquidEther.toString()))
      )
    ).toBe(true);
  });

  test('Maker quantity as minimum returned WETH is respected', async () => {
    const makerQuantity = new BN(mlnPrice.toString()).div(new BN(2)).toString();

    await mln.methods
      .transfer(fund.vault.options.address, takerQuantity)
      .send(defaultTxOpts);

    await expect(
      fund.trading.methods
        .callOnExchange(
          exchangeIndex,
          takeOrderSignature,
          [
            emptyAddress,
            emptyAddress,
            weth.options.address,
            mln.options.address,
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
