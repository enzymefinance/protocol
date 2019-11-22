import { encodeFunctionSignature } from 'web3-eth-abi';
import { BN, padLeft, toWei } from 'web3-utils';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { increaseTime } from '~/utils/evm/increaseTime';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';
import { BNExpMul } from '../../utils/new/BNmath';
import { getFunctionSignature } from '../../utils/new/metadata';
import { CONTRACT_NAMES, EXCHANGES } from '../../utils/new/constants';

describe('Happy Path', () => {
  let environment, user, defaultTxOpts;
  let engine, mln, priceSource, trading, weth;
  let routes;
  let mlnTokenInfo, wethTokenInfo;
  let exchangeIndex, mlnPrice, takerQuantity;
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    environment = await deployAndInitTestEnv();
    expect(environment.track).toBe(Tracks.TESTING);

    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );
    takeOrderSignatureBytes = encodeFunctionSignature(
      takeOrderSignature
    );

    const { exchangeConfigs, melonContracts } = environment.deployment;

    engine = getContract(
      environment,
      CONTRACT_NAMES.ENGINE,
      melonContracts.engine.toString(),
    );
    await engine.methods.setAmguPrice(toWei('1000', 'gwei')).send(defaultTxOpts);

    routes = await setupInvestedTestFund(environment);

    priceSource = getContract(
      environment,
      CONTRACT_NAMES.TESTING_PRICEFEED,
      melonContracts.priceSource.toString(),
    );

    trading = getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      routes.tradingAddress.toString(),
    );

    mlnTokenInfo = getTokenBySymbol(environment, 'MLN');
    wethTokenInfo = getTokenBySymbol(environment, 'WETH');

    mln = getContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      mlnTokenInfo.address,
    );
    weth = getContract(environment, CONTRACT_NAMES.WETH, wethTokenInfo.address);

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

    const exchangeInfo = await trading.methods.getExchangeInfo().call();
    exchangeIndex = exchangeInfo[1].findIndex(
      e =>
        e.toLowerCase() ===
        exchangeConfigs[EXCHANGES.MELON_ENGINE].adapter.toLowerCase(),
    );
    mlnPrice = (await priceSource.methods
      .getPrice(mlnTokenInfo.address)
      .call())[0];
    takerQuantity = toWei('0.001', 'ether'); // Mln sell qty
  });

  it('Trade on Melon Engine', async () => {
    await increaseTime(environment, 86400 * 32);

    await engine.methods.thaw().send(defaultTxOpts);

    const makerQuantity = BNExpMul(
      new BN(takerQuantity),
      new BN(mlnPrice),
    ).toString();

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
        takeOrderSignature,
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

    expect(
      new BN(preFundMln).sub(new BN(postFundMln)).eq(new BN(takerQuantity))
    ).toBe(true);
    expect(
      new BN(postFundWeth).sub(new BN(preFundWeth)).eq(
        new BN(preliquidEther).sub(new BN(postliquidEther))
      )
    ).toBe(true);
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
          takeOrderSignature,
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
