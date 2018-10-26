import { initTestEnvironment } from '~/utils/environment';

import { deploy as deployToken, getToken } from '../../dependencies/token/';
import { deployZeroEx } from './deployZeroEx';
import { getContract, Contract } from '~/utils/solidity';

beforeAll(async () => {
  await initTestEnvironment();
});

test('deploy', async () => {
  const zrxTokenAddress = await deployToken('ZRX');
  const zrxToken = await getToken(zrxTokenAddress);
  const address = await deployZeroEx(zrxToken);
  const zeroExContract = getContract(Contract.ZeroEx, address);
  const zrxAssetData = await zeroExContract.methods.ZRX_ASSET_DATA().call();
  expect(address).toBeTruthy();
  expect(zrxTokenAddress.toString().toLowerCase()).toEqual(
    '0x' + zrxAssetData.substr(-40),
  );
});
