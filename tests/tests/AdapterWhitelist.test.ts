import { utils } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import {
  engineTakeOrderArgs,
  setupFundWithParams,
  takeOrderSignature,
  adapterWhitelistPolicy,
} from '../utils';

async function snapshot(provider: BuidlerProvider) {
  return configureTestDeployment()(provider);
}

let tx;

describe('AdapterWhitelist', () => {
  describe('constructor', () => {
    it('registry is set', async () => {
      const {
        system: { adapterWhitelist, registry },
      } = await provider.snapshot(snapshot);

      tx = adapterWhitelist.REGISTRY();
      await expect(tx).resolves.toBe(registry.address);
    });
  });

  describe('identifier', () => {
    it('return identifier', async () => {
      const {
        system: { adapterWhitelist },
      } = await provider.snapshot(snapshot);

      tx = adapterWhitelist.identifier();
      await expect(tx).resolves.toBe('ADAPTER_WHITELIST');
    });
  });

  describe('validateRule', () => {
    it('return false when the rule fails', async () => {
      const {
        system: {
          engineAdapter,
          kyberAdapter,
          sharesRequestor,
          fundFactory,
          adapterWhitelist,
        },
        config: {
          tokens: { mln },
        },
      } = await provider.snapshot(snapshot);

      const mlnAmount = utils.parseEther('1');

      const fund = await setupFundWithParams({
        denominationAsset: mln,
        factory: fundFactory,
        adapters: [engineAdapter],
        policies: [
          adapterWhitelistPolicy(
            [kyberAdapter.address],
            adapterWhitelist.address,
          ),
        ],
        investment: {
          sharesRequestor,
          investmentAmount: mlnAmount,
        },
      });

      const encodedArgs = await engineTakeOrderArgs(1, mlnAmount);
      tx = fund.vault.callOnIntegration(
        engineAdapter,
        takeOrderSignature,
        encodedArgs,
      );

      await expect(tx).rejects.toBeRevertedWith(
        'Rule evaluated to false: ADAPTER_WHITELIST',
      );
    });

    it('return true when the rule passes', async () => {
      const {
        system: {
          engineAdapter,
          sharesRequestor,
          fundFactory,
          adapterWhitelist,
        },
        config: {
          tokens: { mln },
        },
      } = await provider.snapshot(snapshot);

      const mlnAmount = utils.parseEther('1');

      const fund = await setupFundWithParams({
        denominationAsset: mln,
        factory: fundFactory,
        adapters: [engineAdapter],
        policies: [
          adapterWhitelistPolicy(
            [engineAdapter.address],
            adapterWhitelist.address,
          ),
        ],
        investment: {
          sharesRequestor,
          investmentAmount: mlnAmount,
        },
      });

      const encodedArgs = await engineTakeOrderArgs(1, mlnAmount);
      tx = fund.vault.callOnIntegration(
        engineAdapter,
        takeOrderSignature,
        encodedArgs,
      );

      // this revert message is reached only when the pre-validate policies pass
      await expect(tx).rejects.toBeRevertedWith('Not enough liquid ether to send');
    });
  });
});
