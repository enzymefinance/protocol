// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {UpdateType as AddressListUpdateType} from "tests/utils/core/ListRegistryUtils.sol";
import {BytesArrayLib} from "tests/utils/libs/BytesArrayLib.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IKilnStakingContract} from "tests/interfaces/external/IKilnStakingContract.sol";

import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IKilnStakingPositionLib} from "tests/interfaces/internal/IKilnStakingPositionLib.sol";
import {IKilnStakingPositionParser} from "tests/interfaces/internal/IKilnStakingPositionParser.sol";
import {IVault} from "tests/interfaces/internal/IVault.sol";

enum Actions {
    Stake,
    ClaimFees,
    SweepEth,
    Unstake,
    PausePositionValue,
    UnpausePositionValue
}

enum ClaimFeeTypes {
    ExecutionLayer,
    ConsensusLayer,
    All
}

address constant STAKING_CONTRACT_ADDRESS_ETHEREUM = 0x0816DF553a89c4bFF7eBfD778A9706a989Dd3Ce3;

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest {
    using BytesArrayLib for bytes[];

    // External Kiln StakingContract events
    event Deposit(address indexed caller, address indexed withdrawer, bytes publicKey, bytes signature);

    // Internal EP events
    event PositionValuePaused();

    event PositionValueUnpaused();

    event ValidatorsAdded(address stakingContractAddress, uint256 validatorAmount);

    event ValidatorsRemoved(address stakingContractAddress, uint256 validatorAmount);

    IKilnStakingContract internal stakingContract = IKilnStakingContract(STAKING_CONTRACT_ADDRESS_ETHEREUM);
    IKilnStakingPositionLib internal kilnStakingPosition;
    uint256 internal stakingPositionsListId;
    uint256 internal exitedValidatorEthThreshold = 28 ether;

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
        (typeId, stakingPositionsListId) = __deployKilnStakingPositionType();

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

    // DEPLOYMENT HELPERS

    function __deployKilnStakingPositionLib() internal returns (address libAddress_) {
        bytes memory args = abi.encode(wethToken, exitedValidatorEthThreshold);

        return deployCode("KilnStakingPositionLib.sol", args);
    }

    function __deployKilnStakingPositionParser(uint256 _stakingContractsListId)
        internal
        returns (address parserAddress_)
    {
        bytes memory args = abi.encode(core.persistent.addressListRegistry, _stakingContractsListId, wethToken);

        return deployCode("KilnStakingPositionParser.sol", args);
    }

    function __deployKilnStakingPositionType() internal returns (uint256 typeId_, uint256 stakingPositionsListId_) {
        // Create a new AddressListRegistry list for Kiln StakingContract instances
        stakingPositionsListId_ = core.persistent.addressListRegistry.createList({
            _owner: makeAddr("__deployKilnStakingPositionType: StakingContractsListOwner"),
            _updateType: uint8(AddressListUpdateType.AddAndRemove),
            _initialItems: toArray(address(stakingContract))
        });

        // Deploy KilnStakingPosition type contracts
        address kilnStakingPositionLibAddress = __deployKilnStakingPositionLib();
        address kilnStakingPositionParserAddress = __deployKilnStakingPositionParser(stakingPositionsListId_);

        // Register KilnStakingPosition type
        typeId_ = registerExternalPositionType({
            _externalPositionManager: core.release.externalPositionManager,
            _label: "KILN_STAKING",
            _lib: kilnStakingPositionLibAddress,
            _parser: kilnStakingPositionParserAddress
        });

        return (typeId_, stakingPositionsListId_);
    }

    // ACTION HELPERS

    function __claimFees(address _stakingContractAddress, bytes[] memory _publicKeys, ClaimFeeTypes _claimFeesType)
        internal
    {
        bytes memory actionArgs = abi.encode(_stakingContractAddress, _publicKeys, _claimFeesType);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.ClaimFees),
            _actionArgs: actionArgs
        });
    }

    function __pausePositionValue() internal {
        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.PausePositionValue),
            _actionArgs: ""
        });
    }

    function __stake(address _stakingContractAddress, uint256 _validatorAmount) internal {
        bytes memory actionArgs = abi.encode(_stakingContractAddress, _validatorAmount);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.Stake),
            _actionArgs: actionArgs
        });
    }

    function __sweepEth() internal {
        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.SweepEth),
            _actionArgs: ""
        });
    }

    function __unpausePositionValue() internal {
        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.UnpausePositionValue),
            _actionArgs: ""
        });
    }

    function __unstake(address _stakingContractAddress, bytes[] memory _publicKeys) internal {
        bytes memory packedPublicKeys = _publicKeys.encodePacked();
        bytes memory actionArgs = abi.encode(_stakingContractAddress, packedPublicKeys);

        vm.prank(fundOwner);
        callOnExternalPosition({
            _externalPositionManager: core.release.externalPositionManager,
            _comptrollerProxy: comptrollerProxy,
            _externalPositionAddress: address(kilnStakingPosition),
            _actionId: uint256(Actions.Unstake),
            _actionArgs: actionArgs
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

    // Copied verbatim from Kiln StakingContract
    function __getPubKeyRoot(bytes memory _publicKey) internal pure returns (bytes32 pubKeyRoot_) {
        return sha256(abi.encodePacked(_publicKey, bytes16(0)));
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
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: 1});
    }

    function test_success() public {
        uint256 preTxVaultWethBal = wethToken.balanceOf(address(vaultProxy));

        uint256 validatorAmount = 5;
        uint256 ethAmount = validatorAmount * 32 ether;

        // Setup expected event emissions
        expectEmit(address(kilnStakingPosition));
        emit ValidatorsAdded(address(stakingContract), validatorAmount);

        vm.recordLogs();

        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount});

        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        // Assert validators correctly provisioned on Kiln via event emissions.
        // There should be n emissions for n validators.
        bytes[] memory validatorKeys = __parseValidatorKeysFromDepositEvents(logs);
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

        vm.recordLogs();

        __sweepEth();

        // Assert assetsToReceive was correctly formatted (ETH only)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        // Assert vault ETH diff
        assertEq(wethToken.balanceOf(address(vaultProxy)), preTxVaultWethBal + ethToSweep);
    }
}

contract PausePositionValueTest is TestBase {
    function test_failWithAlreadyPaused() public {
        __pausePositionValue();

        // This doesn't match the error correctly without formatError()
        vm.expectRevert(formatError("__pausePositionValue: Already paused"));
        __pausePositionValue();
    }

    function test_success() public {
        assertFalse(kilnStakingPosition.positionValueIsPaused(), "already paused");

        expectEmit(address(kilnStakingPosition));
        emit PositionValuePaused();

        vm.recordLogs();

        __pausePositionValue();

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        assertTrue(kilnStakingPosition.positionValueIsPaused(), "not paused");
    }
}

contract UnpausePositionValueTest is TestBase {
    function test_failWithNotPaused() public {
        // This doesn't match the error correctly without formatError()
        vm.expectRevert(formatError("__unpausePositionValue: Not paused"));
        __unpausePositionValue();
    }

    function test_success() public {
        __pausePositionValue();

        expectEmit(address(kilnStakingPosition));
        emit PositionValueUnpaused();

        vm.recordLogs();

        __unpausePositionValue();

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        assertFalse(kilnStakingPosition.positionValueIsPaused(), "not unpaused");
    }
}

contract ClaimFeesTest is PostStakeTestBase {
    bytes[] internal validatorKeysWithRewards;
    uint256 internal clRewardAmount = 3 ether;
    uint256 internal elRewardAmount = 2 ether;
    uint256 internal preClaimValidatorCount;
    uint256 internal preClaimVaultWethBal;

    function setUp() public override {
        super.setUp();

        assertTrue(clRewardAmount < exitedValidatorEthThreshold, "CL rewards greater than exited threshold");

        validatorKeysWithRewards = toArray(validatorKeys[0], validatorKeys[1]);

        for (uint256 i; i < validatorKeysWithRewards.length; i++) {
            bytes memory validatorKey = validatorKeysWithRewards[i];

            // Seed the validator fee recipients with the arbitrary amounts to spoof earned rewards
            vm.deal(stakingContract.getCLFeeRecipient(validatorKey), clRewardAmount);
            vm.deal(stakingContract.getELFeeRecipient(validatorKey), elRewardAmount);
        }

        // Record pre-claim values
        preClaimValidatorCount = kilnStakingPosition.getValidatorCount();
        preClaimVaultWethBal = wethToken.balanceOf(address(vaultProxy));
    }

    function test_failWithInvalidStakingContract() public {
        __delistStakingContract();

        vm.expectRevert("__validateStakingContract: Invalid staking contract");
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: validatorKeysWithRewards,
            _claimFeesType: ClaimFeeTypes.All
        });
    }

    function test_successWithAll() public {
        vm.recordLogs();

        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: validatorKeysWithRewards,
            _claimFeesType: ClaimFeeTypes.All
        });

        // Assert assetsToReceive was correctly formatted (WETH only)
        // No need to test in subsequent success tests
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: toArray(address(wethToken))
        });

        // Assert vault received the fees, minus operator fee
        uint256 totalRewards = (clRewardAmount + elRewardAmount) * validatorKeysWithRewards.length;
        uint256 kilnFee = __calcKilnFeeForRewardAmount(totalRewards);
        uint256 netRewards = totalRewards - kilnFee;
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netRewards, "Vault balance");

        // Validator count should be unchanged
        assertEq(kilnStakingPosition.getValidatorCount(), preClaimValidatorCount, "Validator count");
    }

    function test_successWithConsensusLayerNotExited() public {
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: validatorKeysWithRewards,
            _claimFeesType: ClaimFeeTypes.ConsensusLayer
        });

        // Assert vault received the fees, minus operator fee
        uint256 totalRewards = clRewardAmount * validatorKeysWithRewards.length;
        uint256 kilnFee = __calcKilnFeeForRewardAmount(totalRewards);
        uint256 netRewards = totalRewards - kilnFee;
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netRewards, "Vault balance");

        // Validator count should be unchanged
        assertEq(kilnStakingPosition.getValidatorCount(), preClaimValidatorCount, "Validator count");
    }

    function test_successWithConsensusLayerExited() public {
        // Only tests exited validator detection

        // Set up:
        uint256 validatorsToRemove = 2;
        bytes memory requestExitValidatorKey = validatorKeys[0];
        bytes memory slashedValidatorKey = validatorKeys[1];
        // (1) A validator that has requested exit
        __unstake({_stakingContractAddress: address(stakingContract), _publicKeys: toArray(requestExitValidatorKey)});
        vm.deal(stakingContract.getCLFeeRecipient(requestExitValidatorKey), 32 ether);
        // (2) A validator that been forcibly exited (i.e., slashed)
        vm.deal(stakingContract.getCLFeeRecipient(slashedValidatorKey), exitedValidatorEthThreshold);

        // Setup expected event emissions
        expectEmit(address(kilnStakingPosition));
        emit ValidatorsRemoved(address(stakingContract), validatorsToRemove);

        // Claim for all validator keys, to loop through some without rewards
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: toArray(requestExitValidatorKey, slashedValidatorKey),
            _claimFeesType: ClaimFeeTypes.ConsensusLayer
        });

        // Validator count should be updated
        assertEq(
            kilnStakingPosition.getValidatorCount(), preClaimValidatorCount - validatorsToRemove, "Validator count"
        );
    }

    function test_successWithExecutionLayer() public {
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: validatorKeysWithRewards,
            _claimFeesType: ClaimFeeTypes.ExecutionLayer
        });

        // Assert vault received the fees, minus operator fee
        uint256 totalRewards = elRewardAmount * validatorKeysWithRewards.length;
        uint256 kilnFee = __calcKilnFeeForRewardAmount(totalRewards);
        uint256 netRewards = totalRewards - kilnFee;
        assertEq(wethToken.balanceOf(address(vaultProxy)), preClaimVaultWethBal + netRewards, "Vault balance");
    }
}

contract UnstakeTest is PostStakeTestBase {
    bytes[] validatorKeysToUnstake;

    function setUp() public override {
        super.setUp();

        // Choose two arbitrary validators to unstake
        validatorKeysToUnstake.push(validatorKeys[0]);
        validatorKeysToUnstake.push(validatorKeys[2]);
    }

    function test_failWithInvalidStakingContract() public {
        __delistStakingContract();

        vm.expectRevert("__validateStakingContract: Invalid staking contract");
        __unstake({_stakingContractAddress: address(stakingContract), _publicKeys: validatorKeysToUnstake});
    }

    function test_success() public {
        vm.recordLogs();

        __unstake({_stakingContractAddress: address(stakingContract), _publicKeys: validatorKeysToUnstake});

        // Assert assetsToReceive was correctly formatted (No assets)
        assertExternalPositionAssetsToReceive({
            _logs: vm.getRecordedLogs(),
            _externalPositionManager: core.release.externalPositionManager,
            _assets: new address[](0)
        });

        // Assert the validators are marked to be exited on Kiln
        for (uint256 i; i < validatorKeysToUnstake.length; i++) {
            bytes32 pubKeyRoot = __getPubKeyRoot(validatorKeysToUnstake[i]);
            assertTrue(stakingContract.getExitRequestedFromRoot(pubKeyRoot));
        }
    }
}

////////////////////
// POSITION VALUE //
////////////////////

contract GetManagedAssetsTest is TestBase {
    function test_failWithPausedPositionValue() public {
        __pausePositionValue();

        vm.expectRevert("getManagedAssets: Valuation paused");
        kilnStakingPosition.getManagedAssets();
    }

    function test_success() public {
        // Stakes twice to confirm deposits are tracked additively

        uint256 validatorAmount1 = 3;
        uint256 validatorAmount2 = 5;
        uint256 totalEthAmount = (validatorAmount1 + validatorAmount2) * 32 ether;

        vm.recordLogs();

        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount1});
        __stake({_stakingContractAddress: address(stakingContract), _validatorAmount: validatorAmount2});

        bytes[] memory allValidatorKeys = __parseValidatorKeysFromDepositEvents(vm.getRecordedLogs());

        // Assert EP value while all validators are staked
        {
            (address[] memory assets, uint256[] memory amounts) = kilnStakingPosition.getManagedAssets();
            assertEq(assets, toArray(address(wethToken)));
            assertEq(amounts, toArray(totalEthAmount));
        }

        // Choose a couple arbitrary validators to exit
        bytes[] memory validatorKeysToExit = toArray(allValidatorKeys[0], allValidatorKeys[1]);

        // Queue the validators for exit, and then send their fee recipients enough ETH to count as an exit
        __unstake({_stakingContractAddress: address(stakingContract), _publicKeys: validatorKeysToExit});
        for (uint256 i; i < validatorKeysToExit.length; i++) {
            deal(stakingContract.getCLFeeRecipient(validatorKeysToExit[i]), 32 ether);
        }

        // Claim CL fees to trigger the removal of validators who have exited
        __claimFees({
            _stakingContractAddress: address(stakingContract),
            _publicKeys: validatorKeysToExit,
            _claimFeesType: ClaimFeeTypes.ConsensusLayer
        });

        // Assert the final EP value
        {
            (address[] memory assets, uint256[] memory amounts) = kilnStakingPosition.getManagedAssets();
            assertEq(assets, toArray(address(wethToken)));
            uint256 exitedEthAmount = validatorKeysToExit.length * 32 ether;
            assertEq(amounts, toArray(totalEthAmount - exitedEthAmount));
        }
    }
}
