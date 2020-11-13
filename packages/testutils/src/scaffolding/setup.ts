import { AddressLike, randomAddress, SignerWithAddress } from '@crestproject/crestproject';
import { ComptrollerLib, ComptrollerProxy, encodeFunctionData, FundDeployer, VaultLib } from '@melonproject/protocol';
import { BigNumber, BigNumberish, BytesLike, utils } from 'ethers';
import { assertEvent } from '../assertions';
import { buyShares, BuySharesParams, DenominationAssetInterface } from './shares';

export type InitialInvestmentParams = Omit<BuySharesParams, 'comptrollerProxy' | 'denominationAsset'>;

export interface CreateMigratedFundConfigParams {
  signer: SignerWithAddress;
  fundDeployer: FundDeployer;
  denominationAsset: DenominationAssetInterface;
  sharesActionTimelock?: BigNumberish;
  allowedBuySharesCallers?: AddressLike[];
  feeManagerConfigData?: BytesLike;
  policyManagerConfigData?: BytesLike;
}

export interface CreateNewFundParams {
  signer: SignerWithAddress;
  fundDeployer: FundDeployer;
  denominationAsset: DenominationAssetInterface;
  sharesActionTimelock?: BigNumberish;
  allowedBuySharesCallers?: AddressLike[];
  fundOwner?: AddressLike;
  fundName?: string;
  feeManagerConfig?: BytesLike;
  policyManagerConfig?: BytesLike;
  investment?: InitialInvestmentParams;
}

export async function createComptrollerProxy({
  signer,
  comptrollerLib,
  denominationAsset,
  sharesActionTimelock = 0,
  allowedBuySharesCallers = [],
}: {
  signer: SignerWithAddress;
  comptrollerLib: ComptrollerLib;
  denominationAsset: AddressLike;
  sharesActionTimelock?: BigNumberish;
  allowedBuySharesCallers?: AddressLike[];
}) {
  const constructData = encodeFunctionData(comptrollerLib.init.fragment, [
    denominationAsset,
    sharesActionTimelock,
    allowedBuySharesCallers,
  ]);

  const comptrollerProxyContract = await ComptrollerProxy.deploy(signer, constructData, comptrollerLib);

  return {
    comptrollerProxy: new ComptrollerLib(comptrollerProxyContract, signer),
    receipt: comptrollerProxyContract.deployment!,
  };
}

export async function createMigratedFundConfig({
  signer,
  fundDeployer,
  denominationAsset,
  sharesActionTimelock = 0,
  allowedBuySharesCallers = [],
  feeManagerConfigData = '0x',
  policyManagerConfigData = '0x',
}: CreateMigratedFundConfigParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createMigratedFundConfig(
      denominationAsset,
      sharesActionTimelock,
      allowedBuySharesCallers,
      feeManagerConfigData,
      policyManagerConfigData,
    );

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    creator: signer,
    comptrollerProxy: expect.any(String) as string,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    allowedBuySharesCallers,
    feeManagerConfigData: utils.hexlify(feeManagerConfigData),
    policyManagerConfigData: utils.hexlify(policyManagerConfigData),
    forMigration: true,
  });

  return {
    receipt,
    comptrollerProxy: new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer),
  };
}

// TODO: should we pass in the fundOwner as a signer also so we can connect comptroller proxy and vault proxy to that acct instead?
export async function createNewFund({
  signer,
  fundDeployer,
  denominationAsset,
  sharesActionTimelock = 0,
  allowedBuySharesCallers = [],
  fundOwner = randomAddress(),
  fundName = 'My Fund',
  feeManagerConfig = '0x',
  policyManagerConfig = '0x',
  investment,
}: CreateNewFundParams) {
  const receipt = await fundDeployer
    .connect(signer)
    .createNewFund(
      fundOwner,
      fundName,
      denominationAsset,
      sharesActionTimelock,
      allowedBuySharesCallers,
      feeManagerConfig,
      policyManagerConfig,
    );

  const comptrollerDeployedArgs = assertEvent(receipt, 'ComptrollerProxyDeployed', {
    creator: signer,
    comptrollerProxy: expect.any(String) as string,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    allowedBuySharesCallers,
    feeManagerConfigData: utils.hexlify(feeManagerConfig),
    policyManagerConfigData: utils.hexlify(policyManagerConfig),
    forMigration: false,
  });

  const comptrollerProxy = new ComptrollerLib(comptrollerDeployedArgs.comptrollerProxy, signer);

  const newFundDeployedArgs = assertEvent(receipt, 'NewFundCreated', {
    creator: signer,
    comptrollerProxy,
    vaultProxy: expect.any(String) as string,
    fundOwner,
    fundName,
    denominationAsset,
    sharesActionTimelock: BigNumber.from(sharesActionTimelock),
    allowedBuySharesCallers,
    feeManagerConfigData: utils.hexlify(feeManagerConfig),
    policyManagerConfigData: utils.hexlify(policyManagerConfig),
  });

  const vaultProxy = new VaultLib(newFundDeployedArgs.vaultProxy, signer);

  if (investment != null) {
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      ...investment,
    });
  }

  return {
    receipt,
    comptrollerProxy,
    vaultProxy,
  };
}
