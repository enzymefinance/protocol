/*
 * @file Tests a fund trading with the Melon Engine
 *
 * @test A fund can take an order once liquid ETH is thawed
 * @test The amount of WETH being asked for by the fund is respected as a minimum
 */

import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, toWei } from 'web3-utils';

import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import web3 from '~/deploy/utils/get-web3';

import { BNExpMul } from '~/tests/utils/BNmath';
import {
  CONTRACT_NAMES,
  EMPTY_ADDRESS,
  TRACKS,
} from '~/tests/utils/constants';
import { getFunctionSignature } from '~/tests/utils/metadata';
import { increaseTime } from '~/tests/utils/rpc';
import setupInvestedTestFund from '~/tests/utils/setupInvestedTestFund';

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
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION, CONTRACT_NAMES.ENGINE]);
    const contracts = deployed.contracts;
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
  test('Trade on Melon Engine', async () => {
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
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          weth.options.address,
          mln.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
        ['0x0', '0x0', '0x0', '0x0'],
        '0x0',
        '0x0',
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
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            weth.options.address,
            mln.options.address,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS,
            EMPTY_ADDRESS
          ],
          [makerQuantity, takerQuantity, 0, 0, 0, 0, takerQuantity, 0],
          ['0x0', '0x0', '0x0', '0x0'],
          '0x0',
          '0x0',
        )
        .send(defaultTxOpts),
    ).rejects.toThrow();
  });
});
