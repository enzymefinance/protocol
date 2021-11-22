import { randomAddress } from '@enzymefinance/ethers';
import { StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { aaveLend, buyShares, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

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
      denominationAsset,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Buy shares to add denomination asset
    await buyShares({
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      investmentAmount: initialTokenAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund and use max of the dai balance to get adai
    await dai.transfer(vaultProxy, initialTokenAmount);
    await aaveLend({
      aToken: new StandardToken(fork.config.aave.atokens.adai[0], provider),
      aaveAdapter: fork.deployment.aaveAdapter,
      amount: initialTokenAmount,
      comptrollerProxy,
      fundOwner,
      integrationManager,
    });

    // Get the calcGav() cost including adai
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostAround(calcGavBaseGas.add(72500));
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    // FundDeployerOwnerMixin
    expect(await fork.deployment.aavePriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('addDerivatives', () => {
  it('correctly adds an existing aToken to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = ['0x101cc05f4A51C0319f570d5E146a8C625198e636']; // aTUSD
    const underlyings = ['0x0000000000085d4780b73119b644ae5ecd22b376']; // TUSD
    await aavePriceFeed.addDerivatives(derivatives, underlyings);
  });

  it('reverts when adding an invalid underlying token to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = ['0x101cc05f4A51C0319f570d5E146a8C625198e636']; // aTUSD
    const underlyings = [fork.config.primitives.dai];
    await expect(aavePriceFeed.addDerivatives(derivatives, underlyings)).rejects.toBeRevertedWith(
      'Invalid aToken or token provided',
    );
  });

  // TODO: Move this assertion to unit tests
  it('reverts when adding an invalid aToken to the derivativeRegistry', async () => {
    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const derivatives = [randomAddress()];
    const underlyings = [fork.config.aave.atokens.ausdc[0]];
    await expect(aavePriceFeed.addDerivatives(derivatives, underlyings)).rejects.toBeReverted();
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token USDC', async () => {
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], fork.deployer);
    const oneUnit = utils.parseUnits('1', await ausdc.decimals());

    const aavePriceFeed = fork.deployment.aavePriceFeed;
    const underlyingValues = await aavePriceFeed.calcUnderlyingValues.args(ausdc, oneUnit).call();

    expect(underlyingValues).toMatchFunctionOutput(aavePriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [oneUnit],
      underlyings_: [fork.config.primitives.usdc],
    });
  });

  // TODO: Move this assertion to unit tests
  it('only supports atokens', async () => {
    const invalidAddress = randomAddress();
    const aavePriceFeed = fork.deployment.aavePriceFeed;

    await expect(aavePriceFeed.calcUnderlyingValues.args(invalidAddress, 1).call()).rejects.toBeRevertedWith(
      'Not a supported derivative',
    );
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const adai = new StandardToken(fork.config.aave.atokens.adai[0], provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const baseDecimals = await adai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // aDAI should always be pegged to dai price. Thus, its value should be exactly 1 DAI
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(adai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toEqBigNumber(utils.parseUnits('1', quoteDecimals));
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const ausdc = new StandardToken(fork.config.aave.atokens.ausdc[0], provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const baseDecimals = await ausdc.decimals();
    const quoteDecimals = await usdc.decimals();

    expect(baseDecimals).toEqBigNumber(6);
    expect(quoteDecimals).toEqBigNumber(6);

    // aUSDC should always be pegged to dai price. Thus, its value should be exactly 1 USDC
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(ausdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toEqBigNumber(utils.parseUnits('1', quoteDecimals));
  });
});
