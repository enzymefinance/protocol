import {
  Dispatcher,
  ExternalPositionFactory,
  ExternalPositionManager,
  ExternalPositionType,
  FundDeployer,
} from '@enzymefinance/protocol';
import type { DeployFunction } from 'hardhat-deploy/types';

const fn: DeployFunction = async function (hre) {
  const {
    deployments: { get, getOrNull },
    ethers: { getSigners },
  } = hre;

  const deployer = (await getSigners())[0];

  const aaveV2DebtPositionLib = await getOrNull('AaveDebtPositionLib');
  const aaveV2DebtPositionParser = await getOrNull('AaveDebtPositionParser');
  const arbitraryLoanPositionLib = await getOrNull('ArbitraryLoanPositionLib');
  const arbitraryLoanPositionParser = await getOrNull('ArbitraryLoanPositionParser');
  const compoundDebtPositionLib = await getOrNull('CompoundDebtPositionLib');
  const compoundDebtPositionParser = await getOrNull('CompoundDebtPositionParser');
  const convexVotingPositionLib = await getOrNull('ConvexVotingPositionLib');
  const convexVotingPositionParser = await getOrNull('ConvexVotingPositionParser');
  const dispatcher = await get('Dispatcher');
  const kilnStakingPositionLib = await getOrNull('KilnStakingPositionLib');
  const kilnStakingPositionParser = await getOrNull('KilnStakingPositionParser');
  const externalPositionFactory = await get('ExternalPositionFactory');
  const externalPositionManager = await get('ExternalPositionManager');
  const fundDeployer = await get('FundDeployer');
  const liquityDebtPositionLib = await getOrNull('LiquityDebtPositionLib');
  const liquityDebtPositionParser = await getOrNull('LiquityDebtPositionParser');
  const mapleLiquidityPositionLib = await getOrNull('MapleLiquidityPositionLib');
  const mapleLiquidityPositionParser = await getOrNull('MapleLiquidityPositionParser');
  const solvV2BondBuyerPositionLib = await getOrNull('SolvV2BondBuyerPositionLib');
  const solvV2BondBuyerPositionParser = await getOrNull('SolvV2BondBuyerPositionParser');
  const solvV2BondIssuerPositionLib = await getOrNull('SolvV2BondIssuerPositionLib');
  const solvV2BondIssuerPositionParser = await getOrNull('SolvV2BondIssuerPositionParser');
  const notionalV2PositionLib = await getOrNull('NotionalV2PositionLib');
  const notionalV2PositionParser = await getOrNull('NotionalV2PositionParser');
  const theGraphDelegationPositionLib = await getOrNull('TheGraphDelegationPositionLib');
  const theGraphDelegationPositionParser = await getOrNull('TheGraphDelegationPositionParser');
  const uniswapV3ExternalPositionLib = await getOrNull('UniswapV3LiquidityPositionLib');
  const uniswapV3ExternalPositionParser = await getOrNull('UniswapV3LiquidityPositionParser');

  // AF action: Set the release live, renouncing ownership
  const fundDeployerInstance = new FundDeployer(fundDeployer.address, deployer);

  await fundDeployerInstance.setReleaseLive();

  // Council action: Add the ExternalPositionManager as a "deployer" on the ExternalPositionFactory
  const externalPositionFactoryInstance = new ExternalPositionFactory(externalPositionFactory.address, deployer);

  await externalPositionFactoryInstance.addPositionDeployers([externalPositionManager]);

  // Council action: Add the new external position types to the ExternalPositionFactory
  const positionTypes = [
    ...(compoundDebtPositionLib && compoundDebtPositionParser ? ['COMPOUND_DEBT'] : []),
    ...(uniswapV3ExternalPositionLib && uniswapV3ExternalPositionParser ? ['UNISWAP_V3_LIQUIDITY'] : []),
    ...(aaveV2DebtPositionLib && aaveV2DebtPositionParser ? ['AAVE_V2_DEBT'] : []),
    ...(liquityDebtPositionLib && liquityDebtPositionParser ? ['LIQUITY_DEBT'] : []),
    ...(convexVotingPositionLib && convexVotingPositionParser ? ['CONVEX_VOTING'] : []),
    ...(theGraphDelegationPositionLib && theGraphDelegationPositionParser ? ['THE_GRAPH_DELEGATION'] : []),
    ...(mapleLiquidityPositionLib && mapleLiquidityPositionParser ? ['MAPLE_LIQUIDITY'] : []),
    ...(arbitraryLoanPositionLib && arbitraryLoanPositionParser ? ['ARBITRARY_LOAN'] : []),
    ...(solvV2BondBuyerPositionLib && solvV2BondBuyerPositionParser ? ['SOLV_V2_BOND_BUYER'] : []),
    ...(solvV2BondIssuerPositionLib && solvV2BondIssuerPositionParser ? ['SOLV_V2_BOND_ISSUER'] : []),
    ...(notionalV2PositionLib && notionalV2PositionParser ? ['NOTIONAL_V2'] : []),
    ...(kilnStakingPositionLib && kilnStakingPositionParser ? ['KILN_STAKING'] : []),
  ];

  if (positionTypes.length) {
    await externalPositionFactoryInstance.addNewPositionTypes(positionTypes);
  }

  // Council action: Add the external position contracts (lib + parser) to the ExternalPositionManager
  const externalPositionManagerInstance = new ExternalPositionManager(externalPositionManager.address, deployer);

  // TODO: this can technically fail if the above "&&" statements yield false, because the typeIds will be thrown off.
  // Should either bundle these actions and add new types one-by-one, or more likely create a helper to loop through
  // all position type labels on the factory to find the matching label (e.g., which id is "COMPOUND_DEBT")
  if (compoundDebtPositionLib && compoundDebtPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.CompoundDebtPosition],
      [compoundDebtPositionLib],
      [compoundDebtPositionParser],
    );
  }

  if (uniswapV3ExternalPositionLib && uniswapV3ExternalPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.UniswapV3LiquidityPosition],
      [uniswapV3ExternalPositionLib],
      [uniswapV3ExternalPositionParser],
    );
  }

  if (aaveV2DebtPositionLib && aaveV2DebtPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.AaveV2DebtPosition],
      [aaveV2DebtPositionLib],
      [aaveV2DebtPositionParser],
    );
  }

  if (liquityDebtPositionLib && liquityDebtPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.LiquityDebtPosition],
      [liquityDebtPositionLib],
      [liquityDebtPositionParser],
    );
  }

  if (convexVotingPositionLib && convexVotingPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.ConvexVotingPosition],
      [convexVotingPositionLib],
      [convexVotingPositionParser],
    );
  }

  if (theGraphDelegationPositionLib && theGraphDelegationPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.TheGraphDelegationPosition],
      [theGraphDelegationPositionLib],
      [theGraphDelegationPositionParser],
    );
  }

  if (mapleLiquidityPositionLib && mapleLiquidityPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.MapleLiquidityPosition],
      [mapleLiquidityPositionLib],
      [mapleLiquidityPositionParser],
    );
  }

  if (arbitraryLoanPositionLib && arbitraryLoanPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.ArbitraryLoanPosition],
      [arbitraryLoanPositionLib],
      [arbitraryLoanPositionParser],
    );
  }

  if (kilnStakingPositionLib && kilnStakingPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.KilnStakingPosition],
      [kilnStakingPositionLib],
      [kilnStakingPositionParser],
    );
  }

  if (notionalV2PositionLib && notionalV2PositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.NotionalV2Position],
      [notionalV2PositionLib],
      [notionalV2PositionParser],
    );
  }

  if (solvV2BondBuyerPositionLib && solvV2BondBuyerPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.SolvV2BondBuyerPosition],
      [solvV2BondBuyerPositionLib],
      [solvV2BondBuyerPositionParser],
    );
  }

  if (solvV2BondIssuerPositionLib && solvV2BondIssuerPositionParser) {
    await externalPositionManagerInstance.updateExternalPositionTypesInfo(
      [ExternalPositionType.SolvV2BondIssuerPosition],
      [solvV2BondIssuerPositionLib],
      [solvV2BondIssuerPositionParser],
    );
  }

  // Council action: Set the current FundDeployer on the Dispatcher contract, making the release active
  const dispatcherInstance = new Dispatcher(dispatcher.address, deployer);

  await dispatcherInstance.setCurrentFundDeployer(fundDeployer.address);
};

fn.tags = ['Release'];

// Include PostDeployment so the handoff gets run afterwards
fn.dependencies = ['Dispatcher', 'ExternalPositionFactory', 'ExternalPositions', 'FundDeployer', 'PostDeployment'];
fn.runAtTheEnd = true;

// NOTE: On live networks, this is part of the hand over / release routine.
fn.skip = async (hre) => hre.network.live;

export default fn;
