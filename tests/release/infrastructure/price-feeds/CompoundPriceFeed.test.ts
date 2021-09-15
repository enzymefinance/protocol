import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { MockCTokenIntegratee } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [arbitraryUser],
    deployment: { compoundPriceFeed },
    deployer,
    config: {
      weth,
      primitives,
      compound: { ctokens, ceth },
    },
  } = await deployProtocolFixture();

  // Deploy new mock cTokens
  const newCToken1Underlying = randomAddress();
  const newCToken2Underlying = randomAddress();
  const newCToken1 = await MockCTokenIntegratee.deploy(
    deployer,
    'Mock cToken 1',
    'cMOCK1',
    8,
    newCToken1Underlying,
    randomAddress(),
    utils.parseEther('1'),
  );

  const newCToken2 = await MockCTokenIntegratee.deploy(
    deployer,
    'Mock cToken 2',
    'cMOCK2',
    8,
    newCToken2Underlying,
    randomAddress(),
    utils.parseEther('1'),
  );

  return {
    ctokens,
    ceth,
    weth,
    primitives,
    newCToken1,
    newCToken2,
    newCToken1Underlying,
    newCToken2Underlying,
    compoundPriceFeed,
    arbitraryUser,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      compoundPriceFeed,
      ceth,
      weth,
      ctokens: { ccomp, cdai, cusdc, czrx },
      primitives: { comp, dai, usdc, zrx },
    } = await provider.snapshot(snapshot);

    expect(await compoundPriceFeed.getTokenFromCToken(ccomp)).toMatchAddress(comp);
    expect(await compoundPriceFeed.getTokenFromCToken(cdai)).toMatchAddress(dai);
    expect(await compoundPriceFeed.getTokenFromCToken(ceth)).toMatchAddress(weth);
    expect(await compoundPriceFeed.getTokenFromCToken(cusdc)).toMatchAddress(usdc);
    expect(await compoundPriceFeed.getTokenFromCToken(czrx)).toMatchAddress(zrx);
  });
});

describe('addCTokens', () => {
  it('does not allow a random caller', async () => {
    const { arbitraryUser, compoundPriceFeed, newCToken1, newCToken2 } = await provider.snapshot(snapshot);

    await expect(
      compoundPriceFeed.connect(arbitraryUser).addCTokens([newCToken1, newCToken2]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow an empty _cTokens param', async () => {
    const { compoundPriceFeed } = await provider.snapshot(snapshot);

    await expect(compoundPriceFeed.addCTokens([])).rejects.toBeRevertedWith('Empty _cTokens');
  });

  it('does not allow an already-set cToken', async () => {
    const {
      compoundPriceFeed,
      ctokens: { cdai },
    } = await provider.snapshot(snapshot);

    await expect(compoundPriceFeed.addCTokens([cdai])).rejects.toBeRevertedWith('Value already set');
  });

  it('adds multiple cTokens and emits an event per added cToken', async () => {
    const { compoundPriceFeed, newCToken1, newCToken2, newCToken1Underlying, newCToken2Underlying } =
      await provider.snapshot(snapshot);

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
