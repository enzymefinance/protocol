import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import { MockCTokenIntegratee } from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  // Deploy new mock cTokens
  const newCToken1Underlying = randomAddress();
  const newCToken2Underlying = randomAddress();
  const newCToken1 = await MockCTokenIntegratee.deploy(
    config.deployer,
    'Mock cToken 1',
    'cMOCK1',
    8,
    newCToken1Underlying,
    randomAddress(),
    utils.parseEther('1'),
  );
  const newCToken2 = await MockCTokenIntegratee.deploy(
    config.deployer,
    'Mock cToken 2',
    'cMOCK2',
    8,
    newCToken2Underlying,
    randomAddress(),
    utils.parseEther('1'),
  );

  return {
    accounts,
    deployment,
    config,
    newCToken1,
    newCToken2,
    newCToken1Underlying,
    newCToken2Underlying,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        derivatives: {
          compound: { ccomp, cdai, ceth, crep, cusdc, czrx },
        },
      },
      deployment: {
        compoundPriceFeed,
        tokens: { comp, dai, weth, rep, usdc, zrx },
      },
    } = await provider.snapshot(snapshot);

    expect(await compoundPriceFeed.getTokenFromCToken(ccomp)).toMatchAddress(comp);
    expect(await compoundPriceFeed.getTokenFromCToken(cdai)).toMatchAddress(dai);
    expect(await compoundPriceFeed.getTokenFromCToken(ceth)).toMatchAddress(weth);
    expect(await compoundPriceFeed.getTokenFromCToken(crep)).toMatchAddress(rep);
    expect(await compoundPriceFeed.getTokenFromCToken(cusdc)).toMatchAddress(usdc);
    expect(await compoundPriceFeed.getTokenFromCToken(czrx)).toMatchAddress(zrx);
  });
});

describe('addCTokens', () => {
  it('does not allow a random caller', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { compoundPriceFeed },
      newCToken1,
      newCToken2,
    } = await provider.snapshot(snapshot);

    await expect(compoundPriceFeed.connect(randomUser).addCTokens([newCToken1, newCToken2])).rejects.toBeRevertedWith(
      'Only the Dispatcher owner can call this function',
    );
  });

  it('does not allow an empty _cTokens param', async () => {
    const {
      deployment: { compoundPriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(compoundPriceFeed.addCTokens([])).rejects.toBeRevertedWith('Empty _cTokens');
  });

  it('does not allow an already-set cToken', async () => {
    const {
      deployment: {
        compoundPriceFeed,
        compoundTokens: { cdai },
      },
    } = await provider.snapshot(snapshot);

    await expect(compoundPriceFeed.addCTokens([cdai])).rejects.toBeRevertedWith('Value already set');
  });

  it('adds multiple cTokens and emits an event per added cToken', async () => {
    const {
      deployment: { compoundPriceFeed },
      newCToken1,
      newCToken2,
      newCToken1Underlying,
      newCToken2Underlying,
    } = await provider.snapshot(snapshot);

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
