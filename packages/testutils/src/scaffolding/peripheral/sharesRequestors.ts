import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  AuthUserExecutedSharesRequestorFactory,
  AuthUserExecutedSharesRequestorLib,
  StandardToken,
} from '@enzymefinance/protocol';
import { BigNumberish, utils } from 'ethers';
import { assertEvent } from '../../assertions';

export async function createAuthUserExecutedSharesRequestorProxy({
  signer,
  authUserExecutedSharesRequestorFactory,
  comptrollerProxy,
}: {
  signer: SignerWithAddress;
  authUserExecutedSharesRequestorFactory: AuthUserExecutedSharesRequestorFactory;
  comptrollerProxy: AddressLike;
}) {
  const receipt = await authUserExecutedSharesRequestorFactory
    .connect(signer)
    .deploySharesRequestorProxy(comptrollerProxy);

  const sharesRequestorProxyDeployedArgs = assertEvent(receipt, 'SharesRequestorProxyDeployed', {
    comptrollerProxy,
    sharesRequestorProxy: expect.any(String) as string,
  });

  return {
    authUserExecutedSharesRequestorProxy: new AuthUserExecutedSharesRequestorLib(
      sharesRequestorProxyDeployedArgs.sharesRequestorProxy,
      signer,
    ),
    receipt,
  };
}

export async function createAuthUserExecutedSharesRequest({
  buyer,
  authUserExecutedSharesRequestorProxy,
  denominationAsset,
  investmentAmount = utils.parseEther('1'),
  minSharesQuantity = investmentAmount,
}: {
  buyer: SignerWithAddress;
  authUserExecutedSharesRequestorProxy: AuthUserExecutedSharesRequestorLib;
  denominationAsset: StandardToken;
  investmentAmount?: BigNumberish;
  minSharesQuantity?: BigNumberish;
}) {
  await denominationAsset.connect(buyer).approve(authUserExecutedSharesRequestorProxy, investmentAmount);
  return authUserExecutedSharesRequestorProxy.connect(buyer).createRequest(investmentAmount, minSharesQuantity);
}
