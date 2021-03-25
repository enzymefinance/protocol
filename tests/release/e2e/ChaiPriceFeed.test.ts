import { IMakerDaoPot, StandardToken } from '@enzymefinance/protocol';
import {
  ProtocolDeployment,
  buyShares,
  chaiLend,
  createNewFund,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const [fundOwner, investor] = fork.accounts;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Seed investor and buy shares to add denomination asset
    await weth.transfer(investor, initialTokenAmount);

    await buyShares({
      comptrollerProxy,
      signer: investor,
      buyers: [investor],
      denominationAsset,
      investmentAmounts: [initialTokenAmount],
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund and use max of the dai balance to get chai
    await dai.transfer(vaultProxy, initialTokenAmount);
    await chaiLend({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      chaiAdapter: fork.deployment.chaiAdapter,
      dai,
      daiAmount: initialTokenAmount,
      minChaiAmount: 1,
    });

    // Get the calcGav() cost including chai
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(40000));
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token dai', async () => {
    const pot = new IMakerDaoPot(fork.config.chai.pot, fork.deployer);
    const chai = fork.config.chai.chai;
    const dai = fork.config.chai.dai;
    const chi = await pot.chi();

    const chaiPriceFeed = fork.deployment.chaiPriceFeed;
    const chaiGetPriceFeedReceipt = await chaiPriceFeed.calcUnderlyingValues.args(chai, utils.parseEther('1')).call();

    expect(chaiGetPriceFeedReceipt).toMatchFunctionOutput(chaiPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [chi.div(10 ** 9)],
      underlyings_: [dai],
    });
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const chai = new StandardToken(fork.config.chai.chai, fork.deployer);
    const dai = new StandardToken(fork.config.chai.dai, fork.deployer);
    const valueInterpreter = fork.deployment.valueInterpreter;

    const baseDecimals = await chai.decimals();
    const quoteDecimals = await dai.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // chai/usd price on 11/12/2020 was rated at $1.08.
    // Source: <https://www.coingecko.com/en/coins/chai/historical_data/usd?start_date=2020-11-12&end_date=2020-11-13#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(chai, utils.parseUnits('1', baseDecimals), dai)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('1018008449363110619'),
      isValid_: true,
    });
  });
});
