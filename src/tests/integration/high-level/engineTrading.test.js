import { BN, padLeft, toWei } from 'web3-utils';

import { Contracts, Exchanges } from '~/Contracts';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { takeOrderSignatureBytes } from '~/utils/constants/orderSignatures';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { increaseTime } from '~/utils/evm/increaseTime';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let engine, mln, priceSource, trading, weth;
  let routes;
  let mlnTokenInfo, wethTokenInfo;
  let exchangeIndex, mlnPrice, takerQuantity;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(Tracks.TESTING);

    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    const { exchangeConfigs, melonContracts } = environment.deployment;

    engine = getContract(
      environment,
      Contracts.Engine,
      melonContracts.engine.toString(),
    );
    await engine.methods.setAmguPrice(toWei('1000', 'gwei')).send(defaultTxOpts);

    routes = await setupInvestedTestFund(environment);

    priceSource = getContract(
      environment,
      Contracts.TestingPriceFeed,
      melonContracts.priceSource.toString(),
    );

    trading = getContract(
      environment,
      Contracts.Trading,
      routes.tradingAddress.toString(),
    );

    mlnTokenInfo = getTokenBySymbol(environment, 'MLN');
    wethTokenInfo = getTokenBySymbol(environment, 'WETH');

    mln = getContract(
      environment,
      Contracts.PreminedToken,
      mlnTokenInfo.address,
    );
    weth = getContract(environment, Contracts.Weth, wethTokenInfo.address);

    const policyManager = getContract(
      environment,
      Contracts.PolicyManager,
      routes.policyManagerAddress.toString(),
    );
    await policyManager.methods
      .register(
        takeOrderSignatureBytes,
        melonContracts.policies.priceTolerance.toString(),
      )
      .send(defaultTxOpts);

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e =>
        e.toLowerCase() ===
        exchangeConfigs[Exchanges.MelonEngine].adapter.toLowerCase(),
    );
    mlnPrice = (await priceSource.methods
      .getPrice(mlnTokenInfo.address)
      .call())[0];
    takerQuantity = toWei('0.001', 'ether'); // Mln sell qty
  });

  it('Trade on Melon Engine', async () => {
    await increaseTime(environment, 86400 * 32);

    await engine.methods.thaw().send(defaultTxOpts);

    const makerQuantity = new BN(takerQuantity)
      .mul(new BN(mlnPrice))
      .div(new BN(toWei('1', 'ether')))
      .toString();

    await mln.methods
      .transfer(routes.vaultAddress.toString(), takerQuantity)
      .send(defaultTxOpts);

    const preliquidEther = await engine.methods.liquidEther().call();
    const preFundWeth = await weth.methods
      .balanceOf(routes.vaultAddress.toString())
      .call();
    const preFundMln = await mln.methods
      .balanceOf(routes.vaultAddress.toString())
      .call();

    await trading.methods
      .callOnExchange(
        exchangeIndex,
        FunctionSignatures.takeOrder,
        [
          emptyAddress,
          emptyAddress,
          wethTokenInfo.address,
          mlnTokenInfo.address,
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
      .balanceOf(routes.vaultAddress.toString())
      .call();
    const postFundMln = await mln.methods
      .balanceOf(routes.vaultAddress.toString())
      .call();

    expect(preFundMln - postFundMln).toEqual(Number(takerQuantity));
    expect(postFundWeth - preFundWeth).toEqual(
      preliquidEther - postliquidEther,
    );
  });

  test('Maker quantity as minimum returned WETH is respected', async () => {
    const makerQuantity = new BN(mlnPrice).div(new BN(2)).toString();

    await mln.methods
      .transfer(routes.vaultAddress.toString(), takerQuantity)
      .send(defaultTxOpts);

    await expect(
      trading.methods
        .callOnExchange(
          exchangeIndex,
          FunctionSignatures.takeOrder,
          [
            emptyAddress,
            emptyAddress,
            wethTokenInfo.address,
            mlnTokenInfo.address,
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
