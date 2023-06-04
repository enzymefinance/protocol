// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {
    Actions,
    ClaimFeeTypes,
    KilnDeploymentUtils,
    STAKING_CONTRACT_ADDRESS_ETHEREUM
} from "tests/utils/protocols/kiln/KilnUtils.sol";

import {IKilnStakingContract} from "tests/interfaces/external/IKilnStakingContract.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IKilnStakingPositionLib} from "tests/interfaces/internal/IKilnStakingPositionLib.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest, KilnDeploymentUtils {
    // Kiln StakingContract event
    event Deposit(address indexed caller, address indexed withdrawer, bytes publicKey, bytes signature);

    IKilnStakingContract internal stakingContract = IKilnStakingContract(STAKING_CONTRACT_ADDRESS_ETHEREUM);
    IKilnStakingPositionLib internal kilnStakingPosition;
    uint256 internal stakingPositionsListId;

    address internal fundOwner;
    IComptroller internal comptrollerProxy;
    IVault internal vaultProxy;

    function setUp() public virtual override {
        // Must be a block when there are enough validators provisioned in StakingContract.
        // Switch to a specific block if this becomes an issue.
        setUpMainnetEnvironment();

        // TODO: REMOVE THIS AFTER SUCCESSFUL CONTRACT UPGRADE ON MAINNET
        // Update our Kiln contracts to their latest versions
        address councilSafeAddress = 0xb270FE91e8E4b80452fBF1b4704208792A350f53;
        vm.startPrank(councilSafeAddress);
        // Upgrade CLFeeDispatcher
        {
            address clFeeDispatcherAddress = 0x1c4Ad85fF36D76172Eb8015a3B36858197bb1320;
            address nextCLFeeDispatcherImplementation = 0x462Dd07A79e5DDfBe0C171449C5c01788d5d03C3;
            (bool success,) = clFeeDispatcherAddress.call(
                abi.encodeWithSignature("upgradeTo(address)", nextCLFeeDispatcherImplementation)
            );
            require(success);
        }
        // Upgrade StakingContract
        {
            address nextStakingContractImplementation = 0x0A7272e8573aea8359FEC143ac02AED90F822bD0;
            bytes memory nextStakingContractUpgradeData =
                abi.encodeWithSignature("initialize_2(uint256,uint256)", 10000, 10000);
            (bool success,) = address(stakingContract).call(
                abi.encodeWithSignature(
                    "upgradeToAndCall(address,bytes)", nextStakingContractImplementation, nextStakingContractUpgradeData
                )
            );
            require(success);
        }
        vm.stopPrank();

        // Create a fund, seeded with WETH
        fundOwner = makeAddr("FundOwner");
        (comptrollerProxy, vaultProxy) = createVaultAndBuyShares({
            _fundDeployer: core.release.fundDeployer,
            _vaultOwner: fundOwner,
            _denominationAsset: address(wethToken),
            _amountToDeposit: 1000 ether,
            _sharesBuyer: fundOwner
        });

        // Deploy all KilnStakingPosition dependencies
        uint256 typeId;
        (typeId, stakingPositionsListId) = deployKilnStakingPositionType({
            _addressListRegistry: core.persistent.addressListRegistry,
            _externalPositionManager: core.release.externalPositionManager,
            _stakingContract: address(stakingContract),
            _wethToken: wethToken
        });

        // Create an empty KilnStakingPosition for the fund
        vm.prank(fundOwner);
        kilnStakingPosition = IKilnStakingPositionLib(
            createExternalPosition({
                _externalPositionManager: core.release.externalPositionManager,
                _comptrollerProxy: comptrollerProxy,
                _typeId: typeId,
                _initializationData: "",
                _callOnExternalPositionCallArgs: ""
            })
        );
    }

    // ACTION HELPERS

    function __claimFees(address _stakingContractAddress, bytes[] memory _publicKeys, ClaimFeeTypes _claimFeesType)
        internal
    {
        bytes memory actionArgs = abi.encode(_stakingContractAddress, _publicKeys, _claimFeesType);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.ClaimFees),
            _actionArgs: actionArgs
        });
    }

    function __stake(address _stakingContractAddress, uint256 _validatorAmount) internal {
        bytes memory actionArgs = abi.encode(_stakingContractAddress, _validatorAmount);

        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.Stake),
            _actionArgs: actionArgs
        });
    }

    function __sweepEth() internal {
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.SweepEth),
            _actionArgs: ""
        });
    }

    // MISC HELPERS

    function __calcKilnFeeForRewardAmount(uint256 _rewardAmount) internal view returns (uint256 kilnFee_) {
        return (_rewardAmount * stakingContract.getGlobalFee()) / BPS_ONE_HUNDRED_PERCENT;
    }

    function __delistStakingContract() internal {
        // Remove StakingContract from allowlist
        address listOwner = core.persistent.addressListRegistry.getListOwner(stakingPositionsListId);

        vm.prank(listOwner);
        core.persistent.addressListRegistry.removeFromList({
            _id: stakingPositionsListId,
            _items: toArray(address(stakingContract))
        });
    }

    function __parseValidatorKeysFromDepositEvents(VmSafe.Log[] memory _logs)
        internal
        view
        returns (bytes[] memory validatorKeys_)
    {
        VmSafe.Log[] memory depositEvents =
            filterLogsMatchingSelector({_logs: _logs, _selector: Deposit.selector, _emitter: address(stakingContract)});

        validatorKeys_ = new bytes[](depositEvents.length);
        for (uint256 i; i < depositEvents.length; i++) {
            (validatorKeys_[i],) = abi.decode(depositEvents[i].data, (bytes, bytes));
        }

        return validatorKeys_;
    }

    function __stakeForExternalUser() internal returns (bytes memory validatorKey_) {
        address externalDepositor = makeAddr("__stakeForExternalUser: ExternalDepositor");

        uint256 ethToDeposit = 32 ether;
        vm.deal(externalDepositor, ethToDeposit);

        vm.recordLogs();
        vm.prank(externalDepositor);
        stakingContract.deposit{value: 32 ether}();

        return __parseValidatorKeysFromDepositEvents(vm.getRecordedLogs())[0];
    }
}

abstract contract PostStakeTestBase is TestBase {
    bytes[] internal validatorKeys;

    function setUp() public virtual override {
        super.setUp();

        // Stake to an arbitrary number of validators
        uint256 validatorAmount = 5;

        vm.recordLogs();
        vm.prank(fundOwner);
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount});

        validatorKeys = __parseValidatorKeysFromDepositEvents(vm.getRecordedLogs());
    }
}

/////////////
// ACTIONS //
/////////////

contract StakeTest is TestBase {
    function test_failWithInvalidStakingContract() public {
        __delistStakingContract();

        vm.expectRevert("__validateStakingContract: Invalid staking contract");
        vm.prank(fundOwner);
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: 1});
    }

    function test_success() public {
        uint256 preTxVaultWethBal = wethToken.balanceOf(address(vaultProxy));

        uint256 validatorAmount = 5;
        uint256 ethAmount = validatorAmount * 32 ether;

        vm.recordLogs();
        vm.prank(fundOwner);
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount});

        // Assert validators correctly provisioned on Kiln via event emissions.
        // There should be n emissions for n validators.
        bytes[] memory validatorKeys = __parseValidatorKeysFromDepositEvents(vm.getRecordedLogs());
        assertEq(validatorKeys.length, validatorAmount);

        // Assert vault ETH diff
        assertEq(wethToken.balanceOf(address(vaultProxy)), preTxVaultWethBal - ethAmount);

        // Assert EP storage
        assertEq(kilnStakingPosition.getValidatorCount(), validatorAmount);
    }
}

contract SweepEthTest is TestBase {
    function test_success() public {
        // Send some ETH to the EP
        uint256 ethToSweep = 3 ether;
        vm.deal(address(kilnStakingPosition), ethToSweep);

        uint256 preTxVaultWethBal = wethToken.balanceOf(address(vaultProxy));

        vm.prank(fundOwner);
        __sweepEth();

        // Assert vault ETH diff
        assertEq(wethToken.balanceOf(address(vaultProxy)), preTxVaultWethBal + ethToSweep);
    }
}

contract ClaimFeesTest is PostStakeTestBase {
    bytes internal validatorKeyWithRewards;
    uint256 internal clRewardAmount;
    uint256 internal elRewardAmount;
    uint256 internal preClaimVaultWethBal;

    function setUp() public override {
        super.setUp();

        validatorKeyWithRewards = validatorKeys[0];

        // Seed the validator fee recipients with arbitrary amounts to spoof earned rewards
        clRewardAmount = 3 ether;
        elRewardAmount = 5 ether;
        vm.deal(stakingContract.getCLFeeRecipient(validatorKeyWithRewards), clRewardAmount);
        vm.deal(stakingContract.getELFeeRecipient(validatorKeyWithRewards), elRewardAmount);

        // Record the pre-claim VaultProxy WETH balance
        preClaimVaultWethBal = wethToken.balanceOf(address(vaultProxy));
    }

    function test_failWithInvalidStakingContract() public {
        __delistStakingContract();

        vm.expectRevert("__validateStakingContract: Invalid staking contract");
        vm.prank(fundOwner);
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(validatorKeyWithRewards),
            _claimFeesType: ClaimFeeTypes.All
        });
    }

    function test_failWithInvalidValidator() public {
        bytes memory randomPartyValidator = __stakeForExternalUser();

        vm.expectRevert("parseAssetsForAction: Invalid validator");
        vm.prank(fundOwner);
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(randomPartyValidator),
            _claimFeesType: ClaimFeeTypes.All
        });
    }

    function test_successWithAll() public {
        vm.prank(fundOwner);
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(validatorKeyWithRewards),
            _claimFeesType: ClaimFeeTypes.All
        });

        // Assert vault received the fees, minus operator fee
        uint256 kilnClFee = __calcKilnFeeForRewardAmount(clRewardAmount);
        uint256 kilnElFee = __calcKilnFeeForRewardAmount(elRewardAmount);
        uint256 netFees = (clRewardAmount - kilnClFee) + (elRewardAmount - kilnElFee);
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netFees);
    }

    function test_successWithConsensusLayer() public {
        vm.prank(fundOwner);
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(validatorKeyWithRewards),
            _claimFeesType: ClaimFeeTypes.ConsensusLayer
        });

        // Assert vault received the fees, minus operator fee
        uint256 kilnFee = __calcKilnFeeForRewardAmount(clRewardAmount);
        uint256 netFees = clRewardAmount - kilnFee;
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netFees);
    }

    function test_successWithExecutionLayer() public {
        vm.prank(fundOwner);
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(validatorKeyWithRewards),
            _claimFeesType: ClaimFeeTypes.ExecutionLayer
        });

        // Assert vault received the fees, minus operator fee
        uint256 kilnFee = __calcKilnFeeForRewardAmount(elRewardAmount);
        uint256 netFees = elRewardAmount - kilnFee;
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netFees);
    }
}

////////////////////
// POSITION VALUE //
////////////////////

contract GetManagedAssetsTest is TestBase {
    function test_success() public {
        // Stakes twice to confirm deposits are tracked additively

        uint256 validatorAmount1 = 3;
        uint256 validatorAmount2 = 5;
        uint256 totalEthAmount = (validatorAmount1 + validatorAmount2) * 32 ether;

        vm.startPrank(fundOwner);
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount1});
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount2});
        vm.stopPrank();

        // Assert EP value
        (address[] memory assets_, uint256[] memory amounts_) = kilnStakingPosition.getManagedAssets();

        assertEq(assets_, toArray(address(wethToken)));
        assertEq(amounts_, toArray(totalEthAmount));
    }
}
