import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  encodeArgs,
  externalPositionActionArgs,
  CompoundDebtPositionActionId,
  StandardToken,
} from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import hre from 'hardhat';
import { createExternalPosition } from '@enzymefinance/testutils/src/scaffolding/extensions/external-positions';
import { randomAddress } from '@enzymefinance/ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
  const [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy } = await createNewFund({
    signer: fundOwner as SignerWithAddress,
    fundOwner,
    fundDeployer: fork.deployment.fundDeployer,
    denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
  });

  await createExternalPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    fundOwner,
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;

    expect(await compoundDebtPositionParser.getCompoundPriceFeed()).toMatchAddress(fork.deployment.compoundPriceFeed);
    expect(await compoundDebtPositionParser.getCompToken()).toMatchAddress(fork.config.primitives.comp);
    expect(await compoundDebtPositionParser.getValueInterpreter()).toMatchAddress(fork.deployment.valueInterpreter);
  });
});

describe('parseAssetsForAction', () => {
  it('generates expected output for addCollateral', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [randomAddress()];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = await compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.AddCollateralAssets, actionArgs)
      .call();

    expect(result).toMatchFunctionOutput(compoundDebtPositionParser.parseAssetsForAction, {
      assetsToTransfer_: assets,
      amountsToTransfer_: amounts,
      assetsToReceive_: [],
    });
  });

  it('generates expected output for removeCollateral', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [randomAddress()];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = await compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.RemoveCollateralAssets, actionArgs)
      .call();

    expect(result).toMatchFunctionOutput(compoundDebtPositionParser.parseAssetsForAction, {
      assetsToTransfer_: [],
      amountsToTransfer_: [],
      assetsToReceive_: assets,
    });
  });

  it('generates expected output for borrow', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [fork.config.compound.ctokens.cdai];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = await compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.BorrowAsset, actionArgs)
      .call();

    expect(result).toMatchFunctionOutput(compoundDebtPositionParser.parseAssetsForAction, {
      assetsToTransfer_: [],
      amountsToTransfer_: [],
      assetsToReceive_: assets,
    });
  });

  it('generates expected output for claimComp', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: '0x',
    });

    const result = await compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.ClaimComp, actionArgs)
      .call();

    expect(result).toMatchFunctionOutput(compoundDebtPositionParser.parseAssetsForAction, {
      assetsToTransfer_: [],
      amountsToTransfer_: [],
      assetsToReceive_: [fork.config.primitives.comp],
    });
  });

  it('reverts if receives a wrong combination token-cToken for borrow', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [randomAddress()];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.BorrowAsset, actionArgs)
      .call();

    await expect(result).rejects.toBeRevertedWith('Bad token cToken pair');
  });

  it('generates expected output for repayBorrow', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [fork.config.compound.ctokens.cdai];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = await compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.RepayBorrowedAssets, actionArgs)
      .call();

    expect(result).toMatchFunctionOutput(compoundDebtPositionParser.parseAssetsForAction, {
      assetsToTransfer_: assets,
      amountsToTransfer_: amounts,
      assetsToReceive_: [],
    });
  });

  it('reverts if it receives a wrong token-cToken combination for repayBorrow', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [fork.config.primitives.dai];
    const amounts = [1];
    const cTokens = [randomAddress()];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.RepayBorrowedAssets, actionArgs)
      .call();

    await expect(result).rejects.toBeRevertedWith('Bad token cToken pair');
  });

  it('reverts if it receives an invalid asset', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    const assets = [randomAddress()];
    const amounts = [1];
    const cTokens = [fork.config.compound.ctokens.cdai];

    const actionArgs = externalPositionActionArgs({
      assets,
      amounts,
      data: encodeArgs(['address[]'], [cTokens]),
    });

    const result = compoundDebtPositionParser.parseAssetsForAction
      .args(CompoundDebtPositionActionId.BorrowAsset, actionArgs)
      .call();
    await expect(result).rejects.toBeRevertedWith('Unsupported asset');
  });
});

describe('parseInitArgs', () => {
  it('return expected result', async () => {
    const compoundDebtPositionParser = fork.deployment.compoundDebtPositionParser;
    expect(await compoundDebtPositionParser.parseInitArgs.args(randomAddress(), '0x00').call()).toEqual('0x');
  });
});
