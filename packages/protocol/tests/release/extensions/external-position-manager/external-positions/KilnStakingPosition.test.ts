import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager, VaultLib } from '@enzymefinance/protocol';
import {
  ITestKilnStakingContract,
  ITestStandardToken,
  KilnStakingPositionActionClaimType,
  KilnStakingPositionLib,
  ONE_HUNDRED_PERCENT_IN_BPS,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  createKilnStakingPosition,
  createNewFund,
  deployProtocolFixture,
  kilnStakingPositionClaimFees,
  kilnStakingPositionStake,
  kilnStakingPositionWithdrawEth,
  setAccountBalance,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const bps = BigNumber.from(ONE_HUNDRED_PERCENT_IN_BPS);
const randomAddressValue = randomAddress();

let externalPositionManager: ExternalPositionManager;
let kilnStakingPosition: KilnStakingPositionLib;
let kilnStakingContract: ITestKilnStakingContract;

let comptrollerProxyUsed: ComptrollerLib;
let vaultProxyUsed: VaultLib;

let fundOwner: SignerWithAddress;

let weth: ITestStandardToken;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  externalPositionManager = fork.deployment.externalPositionManager;
  kilnStakingContract = new ITestKilnStakingContract(fork.config.kiln.stakingContract, provider);

  weth = new ITestStandardToken(fork.config.weth, provider);

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  const { externalPositionProxy } = await createKilnStakingPosition({
    comptrollerProxy,
    externalPositionManager,
    signer: fundOwner,
  });

  kilnStakingPosition = new KilnStakingPositionLib(externalPositionProxy, provider);
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createKilnStakingPosition({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot('461284');
  });
});

describe('Stake', () => {
  it('does not allow an invalid staking contract', async () => {
    await expect(
      kilnStakingPositionStake({
        comptrollerProxy: comptrollerProxyUsed,
        amount: 1,
        externalPositionManager,
        externalPositionProxy: kilnStakingPosition,
        signer: fundOwner,
        stakingContractAddress: randomAddressValue,
      }),
    ).rejects.toBeRevertedWith('Invalid staking contract');
  });

  it('works as expected', async () => {
    const validatorAmount = BigNumber.from('3'); // >1
    const stakedAmount = validatorAmount.mul(utils.parseEther('32'));
    const seedBalance = stakedAmount.mul(10);

    await setAccountBalance({ provider, account: vaultProxyUsed, amount: seedBalance, token: weth });

    // Stake for n (>1) validators
    const receiptMultiStake = await kilnStakingPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      amount: validatorAmount,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    // Parse the publicKeys from the stake event
    const stakeEvents = extractEvent(receiptMultiStake, ITestKilnStakingContract.abi.getEvent('Deposit'));
    const publicKeys = stakeEvents.map((event) => event.args.publicKey);

    // Assert the correct amount of Kiln validators created
    expect(publicKeys.length).toEqBigNumber(validatorAmount);

    // Assert the correct amount of WETH was used from the vault
    const vaultProxyBalanceAfter = await weth.balanceOf(vaultProxyUsed);
    expect(vaultProxyBalanceAfter).toEqBigNumber(seedBalance.sub(stakedAmount));

    // Assert the correct events were emitted
    assertEvent(receiptMultiStake, kilnStakingPosition.abi.getEvent('ValidatorsAdded'), {
      stakingContractAddress: kilnStakingContract.address,
      validatorAmount,
    });

    // Stake for only 1 validator (measure gas only)
    const receiptOneStake = await kilnStakingPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      amount: 1,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    // Gas cost to stake for 1 validator
    expect(receiptOneStake).toMatchInlineGasSnapshot('286151');

    // Gas cost per additional validator
    expect(receiptMultiStake.gasUsed.sub(receiptOneStake.gasUsed).div(validatorAmount.sub(1))).toMatchInlineGasSnapshot(
      '99403',
    );
  });
});

// NOTE: Consensus Layer Fees claiming cannot be tested since their dispatch() code is still undeveloped
// https://github.com/kilnfi/staking-contracts/blob/dd41162155a5e944731d544229f2763d1a99eb9e/src/contracts/ConsensusLayerFeeDispatcher.sol#L60
describe('ClaimFees', () => {
  it('does not allow an invalid staking contract', async () => {
    await expect(
      kilnStakingPositionClaimFees({
        comptrollerProxy: comptrollerProxyUsed,
        publicKeys: [utils.hexlify(utils.randomBytes(100))],
        claimType: KilnStakingPositionActionClaimType.ExecutionLayer,
        externalPositionManager,
        externalPositionProxy: kilnStakingPosition,
        signer: fundOwner,
        stakingContractAddress: randomAddressValue,
      }),
    ).rejects.toBeRevertedWith('Invalid staking contract');
  });

  it('does not allow a validator that is not owned by the EP', async () => {
    await expect(
      kilnStakingPositionClaimFees({
        comptrollerProxy: comptrollerProxyUsed,
        publicKeys: [utils.hexlify(utils.randomBytes(100))],
        claimType: KilnStakingPositionActionClaimType.ExecutionLayer,
        externalPositionManager,
        externalPositionProxy: kilnStakingPosition,
        signer: fundOwner,
        stakingContractAddress: kilnStakingContract,
      }),
    ).rejects.toBeReverted();
  });

  it('works as expected (execution rewards)', async () => {
    const validatorAmount = BigNumber.from('2');
    const stakedAmount = validatorAmount.mul(utils.parseEther('32'));
    const seedBalance = stakedAmount.mul(10);

    const executionRewardsAmount = utils.parseEther('1');

    await setAccountBalance({ provider, account: vaultProxyUsed, amount: seedBalance, token: weth });

    const stakeReceipt = await kilnStakingPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      amount: validatorAmount,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    // Parse the publicKeys from the stake event
    const stakeEvents = extractEvent(stakeReceipt, ITestKilnStakingContract.abi.getEvent('Deposit'));
    const publicKeys = stakeEvents.map((event) => event.args.publicKey);

    const elFeesRecipients = await Promise.all(
      publicKeys.map(async (publicKey) => kilnStakingContract.getELFeeRecipient(publicKey)),
    );

    // 1. Claim rewards for all of n nodes for the first time.
    // This will also deploy the ELFeeRecipient for each validator.

    for (const receipt of elFeesRecipients) {
      await fundOwner.sendTransaction({
        to: receipt,
        value: executionRewardsAmount,
      });
    }

    const vaultProxyWethBalanceBefore = await weth.balanceOf(vaultProxyUsed);

    await kilnStakingPositionClaimFees({
      comptrollerProxy: comptrollerProxyUsed,
      publicKeys,
      claimType: KilnStakingPositionActionClaimType.ExecutionLayer,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    const vaultProxyWethBalanceAfter = await weth.balanceOf(vaultProxyUsed);

    // Assert the VaultProxy received the expected amount of rewards
    const globalFee = await kilnStakingContract.getGlobalFee();
    // TODO: for some reason, operator fee is not yet being deducted.
    // Replace this once tests start to error.
    // const operatorFee = await kilnStakingContract.getOperatorFee();
    const operatorFee = 0;
    const executionFeesGeneratedWithoutFees = executionRewardsAmount
      .mul(validatorAmount)
      .mul(bps.sub(globalFee).sub(operatorFee))
      .div(bps);

    expect(vaultProxyWethBalanceAfter.sub(vaultProxyWethBalanceBefore)).toEqBigNumber(
      executionFeesGeneratedWithoutFees,
    );

    // 2. Seed and claim rewards for all of n nodes again, just to measure gas

    for (const receipt of elFeesRecipients) {
      await fundOwner.sendTransaction({
        to: receipt,
        value: executionRewardsAmount,
      });
    }

    const receiptNNodes = await kilnStakingPositionClaimFees({
      comptrollerProxy: comptrollerProxyUsed,
      publicKeys,
      claimType: KilnStakingPositionActionClaimType.ExecutionLayer,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    // 3. Seed and claim rewards for only 1 node, just to measure gas

    const oneNodePublicKey = publicKeys[0];
    const oneNodeElFeesRecipient = elFeesRecipients[0];

    await fundOwner.sendTransaction({
      to: oneNodeElFeesRecipient,
      value: executionRewardsAmount,
    });

    const receiptOneNode = await kilnStakingPositionClaimFees({
      comptrollerProxy: comptrollerProxyUsed,
      publicKeys: [oneNodePublicKey],
      claimType: KilnStakingPositionActionClaimType.ExecutionLayer,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
      stakingContractAddress: kilnStakingContract,
    });

    // Gas cost for tx with only 1 node (post-feeRecipient deployment)
    expect(receiptOneNode).toMatchInlineGasSnapshot('270541');

    // Gas cost per subsequent node (post-feeRecipient deployment)
    const subsequentGasPerNode = receiptNNodes.gasUsed.sub(receiptOneNode.gasUsed).div(validatorAmount.sub(1));
    expect(subsequentGasPerNode).toMatchInlineGasSnapshot('75115');
  });
});

describe('WithdrawEth', () => {
  it('works as expected', async () => {
    const value = 123;

    // Seed the EP with some ETH
    await fundOwner.sendTransaction({
      to: kilnStakingPosition.address,
      value,
    });

    const vaultProxyWethBalanceBefore = await weth.balanceOf(vaultProxyUsed);

    const receipt = await kilnStakingPositionWithdrawEth({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: kilnStakingPosition,
      signer: fundOwner,
    });

    const vaultProxyWethBalanceAfter = await weth.balanceOf(vaultProxyUsed);
    expect(vaultProxyWethBalanceAfter.sub(vaultProxyWethBalanceBefore)).toEqBigNumber(value);

    expect(receipt).toMatchInlineGasSnapshot('197304');
  });
});

describe('position value', () => {
  describe('getManagedAssets', () => {
    it('works as expected', async () => {
      const validatorAmount = BigNumber.from('2');
      const stakedAmount = validatorAmount.mul(utils.parseEther('32'));
      const seedBalance = stakedAmount.mul(10);

      await setAccountBalance({ provider, account: vaultProxyUsed, amount: seedBalance, token: weth });

      await kilnStakingPositionStake({
        comptrollerProxy: comptrollerProxyUsed,
        amount: validatorAmount,
        externalPositionManager,
        externalPositionProxy: kilnStakingPosition,
        signer: fundOwner,
        stakingContractAddress: kilnStakingContract,
      });

      // The position holds no ETH, only validators
      expect(await kilnStakingPosition.getManagedAssets.call()).toMatchFunctionOutput(
        kilnStakingPosition.getManagedAssets.fragment,
        {
          amounts_: [stakedAmount],
          assets_: [weth.address],
        },
      );

      // Send it some ETH
      const ethToSend = 123;
      await fundOwner.sendTransaction({
        to: kilnStakingPosition.address,
        value: ethToSend,
      });

      // The position value should now include the ETH balance
      expect(await kilnStakingPosition.getManagedAssets.call()).toMatchFunctionOutput(
        kilnStakingPosition.getManagedAssets.fragment,
        {
          amounts_: [stakedAmount.add(ethToSend)],
          assets_: [weth.address],
        },
      );
    });
  });
});
