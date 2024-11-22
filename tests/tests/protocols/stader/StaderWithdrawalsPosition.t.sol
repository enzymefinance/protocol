// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IStaderWithdrawalsPosition as IStaderWithdrawalsPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/stader-withdrawals/IStaderWithdrawalsPosition.sol";

import {VmSafe} from "forge-std/Vm.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IStaderConfig} from "tests/interfaces/external/IStaderConfig.sol";
import {IStaderUserWithdrawalManager} from "tests/interfaces/external/IStaderUserWithdrawalManager.sol";

import {IStaderWithdrawalsPositionLib} from "tests/interfaces/internal/IStaderWithdrawalsPositionLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";

address constant STAKE_POOLS_MANAGER = 0xcf5EA1b38380f6aF39068375516Daf40Ed70D299;
address constant USER_WITHDRAWAL_MANAGER = 0x9F0491B32DBce587c50c4C43AB303b06478193A7;
address constant ETHEREUM_ETHX = 0xA35b1B31Ce002FBF2058D22F30f95D405200A15b;

////////////////
// TEST BASES //
////////////////

abstract contract StaderWithdrawalsPositionTestBase is IntegrationTest {
    IStaderUserWithdrawalManager staderUserWithdrawalManager = IStaderUserWithdrawalManager(USER_WITHDRAWAL_MANAGER);
    IERC20 ethxToken = IERC20(ETHEREUM_ETHX);

    IStaderWithdrawalsPositionLib staderWithdrawalsPosition;

    address fundOwner;
    address comptrollerProxyAddress;
    address vaultProxyAddress;

    // Set by child contract
    EnzymeVersion version;

    function __initialize(EnzymeVersion _version) internal {
        setUpMainnetEnvironment();

        version = _version;

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed with ETHx
        increaseTokenBalance({_token: ethxToken, _to: vaultProxyAddress, _amount: 10 ether});

        // Deploy all position dependencies
        uint256 typeId = __deployPositionType();

        // Create an empty LidoStakingPosition for the fund
        vm.prank(fundOwner);
        staderWithdrawalsPosition = IStaderWithdrawalsPositionLib(
            createExternalPositionForVersion({
                _version: version,
                _comptrollerProxyAddress: comptrollerProxyAddress,
                _typeId: typeId,
                _initializationData: ""
            })
        );
    }

    // DEPLOYMENT HELPERS

    function __deployLib() internal returns (address libAddress_) {
        bytes memory args = abi.encode(USER_WITHDRAWAL_MANAGER, address(ethxToken), address(wethToken));

        return deployCode("StaderWithdrawalsPositionLib.sol", args);
    }

    function __deployParser() internal returns (address parserAddress_) {
        bytes memory args = abi.encode(address(ethxToken), address(wethToken));

        return deployCode("StaderWithdrawalsPositionParser.sol", args);
    }

    function __deployPositionType() internal returns (uint256 typeId_) {
        // Deploy position contracts
        address libAddress = __deployLib();
        address parserAddress = __deployParser();

        // Register position type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "STADER_WITHDRAWALS",
            _lib: libAddress,
            _parser: parserAddress
        });

        return typeId_;
    }

    // ACTION HELPERS

    function __claimWithdrawal(uint256 _requestId) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(staderWithdrawalsPosition),
            _actionId: uint256(IStaderWithdrawalsPositionProd.Actions.ClaimWithdrawal),
            _actionArgs: abi.encode(IStaderWithdrawalsPositionProd.ClaimWithdrawalActionArgs({requestId: _requestId}))
        });
    }

    function __requestWithdrawal(uint256 _ethXAmount) internal {
        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(staderWithdrawalsPosition),
            _actionId: uint256(IStaderWithdrawalsPositionProd.Actions.RequestWithdrawal),
            _actionArgs: abi.encode(IStaderWithdrawalsPositionProd.RequestWithdrawalActionArgs({ethXAmount: _ethXAmount}))
        });
    }

    // MISC HELPERS

    // Finalization conditions:
    // 1. will stop once poolManager no longer has enough ETH
    // 2. will stop once `staderConfig.getMinBlockDelayToFinalizeWithdrawRequest()` fails
    // 3. in one call, can only finalize a total of requests up-to `finalizationBatchLimit`
    function __finalizeRequests() internal {
        // Guarantee that all finalization conditions are met
        // Condition 1: Seed with a lot of ETH
        deal(STAKE_POOLS_MANAGER, 100_000 ether);
        // Condition 2: Warp forward beyond the min block delay
        uint256 minBlockDelay =
            IStaderConfig(staderUserWithdrawalManager.staderConfig()).getMinBlockDelayToFinalizeWithdrawRequest();
        vm.roll(block.number + minBlockDelay);

        // Condition 3: Re-run until there are no more requests to finalize
        bool requestsPending = true;
        while (requestsPending) {
            staderUserWithdrawalManager.finalizeUserWithdrawalRequest();

            requestsPending =
                staderUserWithdrawalManager.nextRequestIdToFinalize() < staderUserWithdrawalManager.nextRequestId();
        }
    }

    // TESTS - ACTIONS

    function test_requestWithdrawals_success() public {
        uint256 preTxVaultEthxBal = ethxToken.balanceOf(vaultProxyAddress);
        uint256 requestAmount = preTxVaultEthxBal / 11;

        vm.recordLogs();

        // Request withdrawal
        __requestWithdrawal({_ethXAmount: requestAmount});

        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // Assert vault ETHx diff
        assertEq(ethxToken.balanceOf(vaultProxyAddress), preTxVaultEthxBal - requestAmount, "Incorrect ETHx balance");
    }

    function test_claimWithdrawals_success() public {
        // Grab the requestId prior to making the request
        uint256 nextRequestId = staderUserWithdrawalManager.nextRequestId();

        // Request a withdrawal
        uint256 preTxVaultEthxBal = ethxToken.balanceOf(vaultProxyAddress);
        uint256 requestAmount = preTxVaultEthxBal / 11;
        __requestWithdrawal({_ethXAmount: requestAmount});

        // Finalize requests in Stader
        __finalizeRequests();

        uint256 ethExpected = staderUserWithdrawalManager.userWithdrawRequests(nextRequestId).ethFinalized;
        assertGt(ethExpected, 0, "No ETH was finalized");

        uint256 preTxVaultWethBal = wethToken.balanceOf(vaultProxyAddress);

        vm.recordLogs();

        // Claim the withdrawals
        __claimWithdrawal({_requestId: nextRequestId});

        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(wethToken))
        });

        // Assert the vault received the WETH
        uint256 postTxVaultWethBal = wethToken.balanceOf(vaultProxyAddress);
        assertEq(postTxVaultWethBal, preTxVaultWethBal + ethExpected, "Incorrect WETH balance");
    }

    // TESTS - POSITION VALUE

    function test_getManagedAssets_successWithNoRequests() public {
        // Should return empty arrays

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            staderWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets.length, 0, "Incorrect managedAssets length");
        assertEq(managedAssetAmounts.length, 0, "Incorrect managedAssetAmounts length");
    }

    function test_getManagedAssets_successWithUnfinalizedRequest() public {
        // Make a withdrawal request
        uint256 preTxVaultEthxBal = ethxToken.balanceOf(vaultProxyAddress);
        uint256 requestAmount = preTxVaultEthxBal / 11;
        __requestWithdrawal({_ethXAmount: requestAmount});

        // Value should be the request amount, denominated in ETHx

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            staderWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(ethxToken)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(requestAmount), "Incorrect managedAssetAmounts");
    }

    function test_getManagedAssets_successWithFinalizedRequest() public {
        // Grab the requestId prior to making the request
        uint256 requestId = staderUserWithdrawalManager.nextRequestId();

        uint256 preTxVaultEthxBal = ethxToken.balanceOf(vaultProxyAddress);

        // Make the withdrawal request
        uint256 requestAmount = preTxVaultEthxBal / 11;
        __requestWithdrawal({_ethXAmount: requestAmount});

        // Finalize request in Stader
        __finalizeRequests();

        // Value should be the finalized ETH (wETH) amount of the request

        uint256 ethFinalized = staderUserWithdrawalManager.userWithdrawRequests(requestId).ethFinalized;
        assertGt(requestId, 0, "No ETH was finalized");

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            staderWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(wethToken)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(ethFinalized), "Incorrect managedAssetAmounts");
    }

    // Includes both finalized and unfinalized requests
    function test_getManagedAssets_successWithMultipleFinalizedAndUnfinalizedRequests() public {
        // Grab the requestId prior to making the request
        uint256 nextRequestId = staderUserWithdrawalManager.nextRequestId();
        uint256 finalizedRequestId1 = nextRequestId++;
        uint256 finalizedRequestId2 = nextRequestId++;

        uint256 preTxVaultEthxBal = ethxToken.balanceOf(vaultProxyAddress);

        // Make withdrawal requests to finalize
        uint256 finalizedRequestAmount1 = preTxVaultEthxBal / 11;
        uint256 finalizedRequestAmount2 = preTxVaultEthxBal / 5;
        __requestWithdrawal({_ethXAmount: finalizedRequestAmount1});
        __requestWithdrawal({_ethXAmount: finalizedRequestAmount2});

        // Finalize requests in Stader
        __finalizeRequests();

        // Make unfinalized withdrawal requests
        uint256 unfinalizedRequestAmount1 = preTxVaultEthxBal / 8;
        uint256 unfinalizedRequestAmount2 = preTxVaultEthxBal / 3;
        __requestWithdrawal({_ethXAmount: unfinalizedRequestAmount1});
        __requestWithdrawal({_ethXAmount: unfinalizedRequestAmount2});

        // Value should be (1) the sum of the unfinalized requests denominated in ETHx and (2) the sum of the finalized requests denominated in WETH

        uint256 ethFinalized1 = staderUserWithdrawalManager.userWithdrawRequests(finalizedRequestId1).ethFinalized;
        assertGt(finalizedRequestId1, 0, "finalizedRequestId1: No ETH was finalized");

        uint256 ethFinalized2 = staderUserWithdrawalManager.userWithdrawRequests(finalizedRequestId2).ethFinalized;
        assertGt(finalizedRequestId2, 0, "finalizedRequestId2: No ETH was finalized");

        uint256 wethAmount = ethFinalized1 + ethFinalized2;
        uint256 ethxAmount = unfinalizedRequestAmount1 + unfinalizedRequestAmount2;

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            staderWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets, toArray(address(ethxToken), address(wethToken)), "Incorrect managedAssets");
        assertEq(managedAssetAmounts, toArray(ethxAmount, wethAmount), "Incorrect managedAssetAmounts");
    }
}

contract StaderWithdrawalsPositionTest is StaderWithdrawalsPositionTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.Current});
    }
}

contract StaderWithdrawalsPositionTestV4 is StaderWithdrawalsPositionTestBase {
    function setUp() public override {
        __initialize({_version: EnzymeVersion.V4});
    }
}
