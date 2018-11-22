import { Contracts } from '~/Contracts';

import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import { emptyAddress } from '~/utils/constants';
import { randomAddress } from '~/utils/helpers';
import { share } from 'rxjs/operators';
import {
  subtract,
  add,
  greaterThan,
  isEqual,
  BigInteger,
} from '@melonproject/token-math/bigInteger';

let shared: any = {};

// Mock data
const mockDefaultAssets = [randomAddress(), randomAddress()];

const mockQuoteAsset = randomAddress();

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  shared.accounting = getContract(
    Contracts.Accounting,
    await deploy(Contracts.Accounting, [
      shared.hub.options.address,
      mockQuoteAsset,
      mockDefaultAssets,
    ]),
  );
});

test('Accounting is properly initialized', async () => {
  for (const i of Array.from(Array(mockDefaultAssets.length).keys())) {
    const defaultAsset = await shared.accounting.methods.ownedAssets(i).call();
    expect(defaultAsset.toLowerCase()).toBe(mockDefaultAssets[i]);
    await expect(
      shared.accounting.methods.isInAssetList(mockDefaultAssets[i]).call(),
    ).toBeTruthy();
  }
});
