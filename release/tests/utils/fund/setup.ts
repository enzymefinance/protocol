import { BytesLike, Signer, utils } from 'ethers';
import {
  AddressLike,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import {
  buyShares,
  BuySharesParams,
  DenominationAssetInterface,
} from './shares';
import {
  ComptrollerLib,
  FundDeployer,
  VaultLib,
} from '../../../utils/contracts';

export type InitialInvestmentParams = Omit<
  BuySharesParams,
  'comptrollerProxy' | 'denominationAsset'
>;

export interface CreateNewFundParams {
  signer: Signer;
  fundDeployer: FundDeployer;
  denominationAsset: DenominationAssetInterface;
  fundOwner?: AddressLike;
  fundName?: string;
  feeManagerConfig?: BytesLike;
  policyManagerConfig?: BytesLike;
  investment?: InitialInvestmentParams;
}

// TODO: should we pass in the fundOwner as a signer also so we can connect comptroller proxy and vault proxy to that acct instead?
export async function createNewFund({
  signer,
  fundDeployer,
  denominationAsset,
  fundOwner = randomAddress(),
  fundName = 'My Fund',
  feeManagerConfig = '0x',
  policyManagerConfig = '0x',
  investment,
}: CreateNewFundParams) {
  const newFundTx = fundDeployer
    .connect(signer)
    .createNewFund(
      fundOwner,
      fundName,
      denominationAsset,
      feeManagerConfig,
      policyManagerConfig,
    );

  const comptrollerDeployedArgs = await assertEvent(
    newFundTx,
    'ComptrollerProxyDeployed',
    {
      comptrollerProxy: expect.any(String) as string,
      deployer: await resolveAddress(signer),
    },
  );

  const comptrollerProxy = new ComptrollerLib(
    comptrollerDeployedArgs.comptrollerProxy,
    provider,
  ).connect(signer);

  const event = comptrollerProxy.abi.getEvent('FundConfigSet');
  const fundConfigSetArgs = await assertEvent(newFundTx, event, {
    vaultProxy: expect.any(String) as string,
    denominationAsset: await resolveAddress(denominationAsset),
    feeManagerConfigData: utils.hexlify(feeManagerConfig),
    policyManagerConfigData: utils.hexlify(policyManagerConfig),
  });

  const vaultProxy = new VaultLib(
    fundConfigSetArgs.vaultProxy,
    provider,
  ).connect(signer);

  await assertEvent(newFundTx, 'NewFundDeployed', {
    caller: await resolveAddress(signer),
    comptrollerProxy: comptrollerProxy.address,
    vaultProxy: vaultProxy.address,
    fundOwner: await resolveAddress(fundOwner),
    fundName,
    denominationAsset: fundConfigSetArgs.denominationAsset,
    feeManagerConfig: fundConfigSetArgs.feeManagerConfigData,
    policyManagerConfig: fundConfigSetArgs.policyManagerConfigData,
  });

  if (investment != null) {
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      ...investment,
    });
  }

  return {
    comptrollerProxy,
    newFundTx,
    vaultProxy,
  };
}
