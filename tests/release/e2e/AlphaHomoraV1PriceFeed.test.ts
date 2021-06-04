import { randomAddress } from '@enzymefinance/ethers';
import { IAlphaHomoraV1Bank, StandardToken } from '@enzymefinance/protocol';
import {
  alphaHomoraV1Lend,
  buyShares,
  createNewFund,
  ProtocolDeployment,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('calcUnderlyingValues', () => {
  it('does not allow unsupported asset', async () => {
    const alphaHomoraPriceFeed = fork.deployment.alphaHomoraV1PriceFeed;
    await expect(alphaHomoraPriceFeed.calcUnderlyingValues.args(randomAddress(), 1).call()).rejects.toBeRevertedWith(
      'Only ibETH is supported',
    );
  });

  it('returns rate for underlying token', async () => {
    const alphaHomoraPriceFeed = fork.deployment.alphaHomoraV1PriceFeed;
    const alphaHomoraBank = new IAlphaHomoraV1Bank(fork.config.alphaHomoraV1.ibeth, provider);
    const ibeth = new StandardToken(fork.config.alphaHomoraV1.ibeth, provider);
    const weth = new StandardToken(fork.config.weth, provider);

    // Calc expected rate for 1 unit of ibETH
    const ibethUnit = utils.parseUnits('1', await ibeth.decimals());
    const expectedRate = ibethUnit.mul(await alphaHomoraBank.totalETH()).div(await alphaHomoraBank.totalSupply());

    // Assert the expected rate and that WETH is the underlying asset
    const feedRate = await alphaHomoraPriceFeed.calcUnderlyingValues.args(ibeth, ibethUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(weth);
  });
});

describe('isSupportedAsset', () => {
  it('returns false for non-ibeth asset', async () => {
    const alphaHomoraPriceFeed = fork.deployment.alphaHomoraV1PriceFeed;
    expect(await alphaHomoraPriceFeed.isSupportedAsset(fork.config.weth)).toBe(false);
  });

  it('returns true for ibeth', async () => {
    const alphaHomoraPriceFeed = fork.deployment.alphaHomoraV1PriceFeed;
    expect(await alphaHomoraPriceFeed.isSupportedAsset(fork.config.alphaHomoraV1.ibeth)).toBe(true);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const ibeth = new StandardToken(fork.config.alphaHomoraV1.ibeth, provider);
    const weth = new StandardToken(fork.config.weth, provider);

    // ibeth/weth price should generally be just above 10^18 to account for accrued interest
    // TODO: find better live price reference
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(ibeth, utils.parseUnits('1', await ibeth.decimals()), weth)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('1063397516312767510'),
      isValid_: true,
    });
  });
});

describe('derivative gas costs', () => {
  it('adds to calcGav for weth-denominated fund', async () => {
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const [fundOwner, investor] = fork.accounts;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: weth,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Seed fund and buy shares to add denomination asset
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

    // Lend arbitrary partial weth balance to receive some ibETH
    await alphaHomoraV1Lend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      alphaHomoraV1Adapter: fork.deployment.alphaHomoraV1Adapter,
      wethAmount: initialTokenAmount.div(2),
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(25000));
  });
});
