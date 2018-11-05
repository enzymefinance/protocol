import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';

import { deploy, getContract, Contract } from '~/utils/solidity';
import { assetDataUtils } from '0x.js';
import { getGlobalEnvironment } from '~/utils/environment';

export const deployZeroEx = async (
  zrxToken: TokenInterface,
  environment: Environment = getGlobalEnvironment(),
) => {
  const address = await deploy('exchanges/Exchange.sol', [], environment);
  const zeroExContract = getContract(Contract.ZeroEx, address);
  await zeroExContract.methods
    .changeZRXAssetData(
      assetDataUtils.encodeERC20AssetData(zrxToken.address.toString()),
    )
    .send({ from: environment.wallet.address.toString() });
  return address;
};
