import { CompoundPriceFeed, ICERC20, StandardToken } from '@enzymefinance/protocol';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  ProtocolDeployment,
  buyShares,
  compoundLend,
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
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;

    const { vaultProxy, comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Buy shares to add denomination asset
    await buyShares({
      comptrollerProxy,
      buyer: investor,
      denominationAsset,
      investmentAmount: initialTokenAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Use max of the dai balance to get cDai
    await dai.transfer(vaultProxy, initialTokenAmount);
    await compoundLend({
      comptrollerProxy,
      integrationManager,
      fundOwner,
      compoundAdapter: fork.deployment.compoundAdapter,
      cToken: new ICERC20(fork.config.compound.ctokens.cdai, provider),
      tokenAmount: initialTokenAmount,
      cTokenAmount: BigNumber.from('1'),
    });

    // Get the calcGav() cost including the pool token
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(59000));
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;

    expect(await compoundPriceFeed.getTokenFromCToken(fork.config.compound.ctokens.ccomp)).toMatchAddress(
      fork.config.primitives.comp,
    );
    expect(await compoundPriceFeed.getTokenFromCToken(fork.config.compound.ctokens.cdai)).toMatchAddress(
      fork.config.primitives.dai,
    );
    expect(await compoundPriceFeed.getTokenFromCToken(fork.config.compound.ceth)).toMatchAddress(fork.config.weth);
    expect(await compoundPriceFeed.getTokenFromCToken(fork.config.compound.ctokens.cusdc)).toMatchAddress(
      fork.config.primitives.usdc,
    );
    expect(await compoundPriceFeed.getTokenFromCToken(fork.config.compound.ctokens.czrx)).toMatchAddress(
      fork.config.primitives.zrx,
    );
  });
});

describe('addCTokens', () => {
  it('does not allow a random caller', async () => {
    const [arbitraryUser] = fork.accounts;
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;

    await expect(
      compoundPriceFeed.connect(arbitraryUser).addCTokens([randomAddress(), randomAddress()]),
    ).rejects.toBeRevertedWith('Only the Dispatcher owner can call this function');
  });

  it('does not allow an empty _cTokens param', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;

    await expect(compoundPriceFeed.addCTokens([])).rejects.toBeRevertedWith('Empty _cTokens');
  });

  it('does not allow an already-set cToken', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;

    await expect(compoundPriceFeed.addCTokens([fork.config.compound.ctokens.cdai])).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  it('adds multiple cTokens and emits an event per added cToken', async () => {
    const newCToken1 = fork.config.compound.ctokens.ccomp;
    const newCToken2 = fork.config.compound.ctokens.cdai;
    const newCToken1Underlying = fork.config.primitives.comp;
    const newCToken2Underlying = fork.config.primitives.dai;

    const compoundPriceFeed = await CompoundPriceFeed.deploy(
      fork.deployer,
      fork.deployment.dispatcher,
      fork.config.weth,
      fork.config.compound.ceth,
      [],
    );

    // The cTokens should not be supported assets initially
    expect(await compoundPriceFeed.isSupportedAsset(newCToken1)).toBe(false);
    expect(await compoundPriceFeed.isSupportedAsset(newCToken2)).toBe(false);

    // Add the new cTokens
    const addCTokensTx = await compoundPriceFeed.addCTokens([newCToken1, newCToken2]);

    // The underlying tokens should be stored for each cToken
    expect(await compoundPriceFeed.getTokenFromCToken(newCToken1)).toMatchAddress(newCToken1Underlying);
    expect(await compoundPriceFeed.getTokenFromCToken(newCToken2)).toMatchAddress(newCToken2Underlying);

    // The tokens should now be supported assets
    expect(await compoundPriceFeed.isSupportedAsset(newCToken1)).toBe(true);
    expect(await compoundPriceFeed.isSupportedAsset(newCToken2)).toBe(true);

    // The correct event should have been emitted for each cToken
    const events = extractEvent(addCTokensTx, 'CTokenAdded');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      cToken: newCToken1,
      token: newCToken1Underlying,
    });

    expect(events[1]).toMatchEventArgs({
      cToken: newCToken2,
      token: newCToken2Underlying,
    });
  });
});

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token (cERC20)', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(cdai, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await cdai.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(cdai, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(dai);

    // Rounding up from 38938
    expect(getRatesReceipt).toCostLessThan('39000');
  });

  it('returns rate for underlying token (cETH)', async () => {
    const compoundPriceFeed = fork.deployment.compoundPriceFeed;
    const ceth = new ICERC20(fork.config.compound.ceth, provider);
    const weth = new StandardToken(fork.config.weth, provider);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(ceth, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await ceth.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(ceth, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(weth);

    // Rounding up from 30991
    expect(getRatesReceipt).toCostLessThan('32000');
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const cdai = new ICERC20(fork.config.compound.ctokens.cdai, provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const baseDecimals = await cdai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(18);

    // cDai/usd price on Apr 6, 2021 was about 0,0213 USD.
    // Source: <https://www.coingecko.com/en/coins/compound-dai/historical_data/usd?start_date=2021-04-06&end_date=2021-04-06>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cdai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      isValid_: true,
      value_: BigNumber.from('21312825947605158'),
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const cusdc = new ICERC20(fork.config.compound.ctokens.cusdc, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const baseDecimals = await cusdc.decimals();
    const quoteDecimals = await usdc.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(6);

    // cUsdc/usd price on Apr 6, 2021 was about 0,0218 USD.
    // source: https://www.coingecko.com/en/coins/compound-usd-coin/historical_data/usd?start_date=2021-04-06&end_date=2021-04-06>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cusdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('21854'),
      isValid_: true,
    });
  });
});
