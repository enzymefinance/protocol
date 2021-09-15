import { extractEvent } from '@enzymefinance/ethers';
import { MockSynthetixIntegratee, MockSynthetixPriceSource, MockSynthetixToken } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const {
    deployment: { synthetixPriceFeed },
    accounts: [arbitraryUser],
    config: {
      primitives,
      synthetix: { synths, susd, addressResolver },
    },
    deployer,
  } = await deployProtocolFixture();

  // Deploy new Synths
  const newSynth1Symbol = 'sMOCK1';
  const newSynth1CurrencyKey = utils.formatBytes32String(newSynth1Symbol);
  const newSynth1 = await MockSynthetixToken.deploy(
    deployer,
    'Mock Synth 1',
    newSynth1Symbol,
    18,
    newSynth1CurrencyKey,
  );

  const newSynth2Symbol = 'sMOCK2';
  const newSynth2CurrencyKey = utils.formatBytes32String(newSynth2Symbol);
  const newSynth2 = await MockSynthetixToken.deploy(
    deployer,
    'Mock Synth 2',
    newSynth2Symbol,
    18,
    newSynth2CurrencyKey,
  );

  return {
    susd,
    synths,
    synthetixPriceFeed,
    addressResolver,
    newSynth1,
    newSynth1CurrencyKey,
    newSynth2,
    newSynth2CurrencyKey,
    deployer,
    primitives,
    arbitraryUser,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const { addressResolver, synths, susd, synthetixPriceFeed } = await provider.snapshot(snapshot);

    expect(await synthetixPriceFeed.getAddressResolver()).toMatchAddress(addressResolver);
    expect(await synthetixPriceFeed.getSUSD()).toMatchAddress(susd);

    // TODO: can check this more precisely by calling Synthetix
    for (const synth of Object.values(synths)) {
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(synth)).not.toBe(constants.HashZero);
    }
  });
});

describe('calcUnderlyingValues', () => {
  // TODO: Do not use a mock contract for these.
  xit('revert on invalid rate', async () => {
    const {
      deployer,
      addressResolver: addressResolverAddress,
      synthetixPriceFeed,
      newSynth1,
      newSynth1CurrencyKey,
    } = await provider.snapshot(snapshot);

    await synthetixPriceFeed.addSynths([newSynth1]);

    const addressResolver = new MockSynthetixIntegratee(addressResolverAddress, deployer);
    const exchangeRatesAddress = await addressResolver.requireAndGetAddress(
      utils.formatBytes32String('ExchangeRates'),
      '',
    );

    const exchangeRates = new MockSynthetixPriceSource(exchangeRatesAddress, deployer);
    await exchangeRates.setRate(newSynth1CurrencyKey, '0');

    const calcUnderlyingValues = synthetixPriceFeed.calcUnderlyingValues.args(newSynth1, utils.parseEther('1')).call();
    await expect(calcUnderlyingValues).rejects.toBeRevertedWith('calcUnderlyingValues: _derivative rate is not valid');
  });

  // TODO: Do not use a mock contract for these.
  xit('returns valid rate', async () => {
    const {
      deployer,
      susd,
      addressResolver: addressResolverAddress,
      synthetixPriceFeed,
      newSynth1,
      newSynth1CurrencyKey,
    } = await provider.snapshot(snapshot);

    await synthetixPriceFeed.addSynths([newSynth1]);
    const expectedAmount = utils.parseEther('1');

    const addressResolver = new MockSynthetixIntegratee(addressResolverAddress, deployer);
    const exchangeRatesAddress = await addressResolver.requireAndGetAddress(
      utils.formatBytes32String('ExchangeRates'),
      '',
    );
    const exchangeRates = new MockSynthetixPriceSource(exchangeRatesAddress, deployer);

    await exchangeRates.setRate(newSynth1CurrencyKey, expectedAmount);

    const calcUnderlyingValues = await synthetixPriceFeed.calcUnderlyingValues
      .args(newSynth1, utils.parseEther('1'))
      .call();

    expect(calcUnderlyingValues).toMatchFunctionOutput(synthetixPriceFeed.calcUnderlyingValues, {
      underlyingAmounts_: [expectedAmount],
      underlyings_: [susd],
    });
  });
});

describe('isSupportedAsset', () => {
  it('return false on invalid synth', async () => {
    const {
      synthetixPriceFeed,
      primitives: { dai },
    } = await provider.snapshot(snapshot);

    const isSupportedAsset = await synthetixPriceFeed.isSupportedAsset(dai);

    expect(isSupportedAsset).toBe(false);
  });

  it('returns true on valid synth', async () => {
    const {
      synths: { sbtc },
      synthetixPriceFeed,
    } = await provider.snapshot(snapshot);

    const isSupportedAsset = await synthetixPriceFeed.isSupportedAsset(sbtc);

    expect(isSupportedAsset).toBe(true);
  });
});

describe('synths registry', () => {
  describe('addSynths', () => {
    it('does not allow a random caller', async () => {
      const { arbitraryUser, synthetixPriceFeed, newSynth1, newSynth2 } = await provider.snapshot(snapshot);

      await expect(
        synthetixPriceFeed.connect(arbitraryUser).addSynths([newSynth1, newSynth2]),
      ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow an empty _synths param', async () => {
      const { synthetixPriceFeed } = await provider.snapshot(snapshot);

      await expect(synthetixPriceFeed.addSynths([])).rejects.toBeRevertedWith('Empty _synths');
    });

    it('does not allow an already-set Synth', async () => {
      const {
        synths: { sbtc },
        synthetixPriceFeed,
      } = await provider.snapshot(snapshot);

      await expect(synthetixPriceFeed.addSynths([sbtc])).rejects.toBeRevertedWith('Value already set');
    });

    it.todo('does not allow an asset without a currencyKey');

    it('adds multiple Synths and emits an event per added Synth', async () => {
      const { synthetixPriceFeed, newSynth1, newSynth2, newSynth1CurrencyKey, newSynth2CurrencyKey } =
        await provider.snapshot(snapshot);

      // The Synths should not be supported assets initially
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth1)).toBe(false);
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth2)).toBe(false);

      // Add the new Synths
      const addSynthsTx = await synthetixPriceFeed.addSynths([newSynth1, newSynth2]);

      // The currencyKey should be stored for each Synth
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(newSynth1)).toBe(newSynth1CurrencyKey);
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(newSynth2)).toBe(newSynth2CurrencyKey);
      expect(await synthetixPriceFeed.getCurrencyKeysForSynths([newSynth1, newSynth2])).toMatchFunctionOutput(
        synthetixPriceFeed.getCurrencyKeysForSynths,
        [newSynth1CurrencyKey, newSynth2CurrencyKey],
      );

      // The tokens should now be supported assets
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth1)).toBe(true);
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth2)).toBe(true);

      // The correct event should have been emitted for each Synth
      const events = extractEvent(addSynthsTx, 'SynthAdded');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        synth: newSynth1,
        currencyKey: newSynth1CurrencyKey,
      });
      expect(events[1]).toMatchEventArgs({
        synth: newSynth2,
        currencyKey: newSynth2CurrencyKey,
      });
    });
  });

  describe('updateSynthCurrencyKeys', () => {
    it('does not allow an empty _synths param', async () => {
      const { synthetixPriceFeed } = await provider.snapshot(snapshot);

      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([])).rejects.toBeRevertedWith('Empty _synths');
    });

    it('does not allow an unset Synth', async () => {
      const { synthetixPriceFeed, newSynth1 } = await provider.snapshot(snapshot);

      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([newSynth1])).rejects.toBeRevertedWith('Synth not set');
    });

    it('does not allow a Synth that has the correct currencyKey', async () => {
      const {
        synths: { sbtc },
        synthetixPriceFeed,
      } = await provider.snapshot(snapshot);

      await expect(synthetixPriceFeed.updateSynthCurrencyKeys([sbtc])).rejects.toBeRevertedWith(
        'Synth has correct currencyKey',
      );
    });

    it('updates multiple Synths and emits an event per updated Synth (called by random user)', async () => {
      const { arbitraryUser, synthetixPriceFeed, newSynth1, newSynth2, newSynth1CurrencyKey, newSynth2CurrencyKey } =
        await provider.snapshot(snapshot);

      // Add the new Synths so they are supported
      await synthetixPriceFeed.addSynths([newSynth1, newSynth2]);
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth1)).toBe(true);
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth2)).toBe(true);

      // Update the Synth currency keys in Synthetix
      const altSynth1CurrencyKey = utils.formatBytes32String('sMOCK1-ALT');
      const altSynth2CurrencyKey = utils.formatBytes32String('sMOCK2-ALT');
      await newSynth1.setCurrencyKey(altSynth1CurrencyKey);
      await newSynth2.setCurrencyKey(altSynth2CurrencyKey);

      // Update the new Synths (from a random user)
      const updateSynthsTx = await synthetixPriceFeed
        .connect(arbitraryUser)
        .updateSynthCurrencyKeys([newSynth1, newSynth2]);

      // The new currencyKey should be stored for each Synth
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(newSynth1)).toBe(altSynth1CurrencyKey);
      expect(await synthetixPriceFeed.getCurrencyKeyForSynth(newSynth2)).toBe(altSynth2CurrencyKey);
      expect(await synthetixPriceFeed.getCurrencyKeysForSynths([newSynth1, newSynth2])).toMatchFunctionOutput(
        synthetixPriceFeed.getCurrencyKeysForSynths,
        [altSynth1CurrencyKey, altSynth2CurrencyKey],
      );

      // The tokens should still be supported assets
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth1)).toBe(true);
      expect(await synthetixPriceFeed.isSupportedAsset(newSynth2)).toBe(true);

      // The correct event should have been emitted for each Synth
      const events = extractEvent(updateSynthsTx, 'SynthCurrencyKeyUpdated');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        synth: newSynth1,
        prevCurrencyKey: newSynth1CurrencyKey,
        nextCurrencyKey: altSynth1CurrencyKey,
      });
      expect(events[1]).toMatchEventArgs({
        synth: newSynth2,
        prevCurrencyKey: newSynth2CurrencyKey,
        nextCurrencyKey: altSynth2CurrencyKey,
      });
    });
  });
});
