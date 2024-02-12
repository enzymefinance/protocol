// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {ILidoWithdrawalsPosition as ILidoWithdrawalsPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/lido-withdrawals/ILidoWithdrawalsPosition.sol";

import {VmSafe} from "forge-std/Vm.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {ILidoWithdrawalQueue} from "tests/interfaces/external/ILidoWithdrawalQueue.sol";

import {ILidoWithdrawalsPositionLib} from "tests/interfaces/internal/ILidoWithdrawalsPositionLib.sol";
import {IExternalPositionManager} from "tests/interfaces/internal/IExternalPositionManager.sol";

address constant WITHDRAWAL_QUEUE_ADDRESS = 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1;

////////////////
// TEST BASES //
////////////////

abstract contract TestBase is IntegrationTest {
    event RequestAdded(uint256 indexed id, uint256 amount);

    event RequestRemoved(uint256 indexed id);

    ILidoWithdrawalsPositionLib internal lidoWithdrawalsPosition;
    ILidoWithdrawalQueue internal withdrawalQueue = ILidoWithdrawalQueue(WITHDRAWAL_QUEUE_ADDRESS);
    IERC20 internal stethToken = IERC20(ETHEREUM_STETH);

    address internal fundOwner;
    address internal comptrollerProxyAddress;
    address internal vaultProxyAddress;

    // Set by child contract
    EnzymeVersion internal version;

    function setUp() public virtual override {
        setUpMainnetEnvironment();

        // Create a fund
        (comptrollerProxyAddress, vaultProxyAddress, fundOwner) = createTradingFundForVersion(version);

        // Seed with stETH
        increaseTokenBalance({_token: stethToken, _to: vaultProxyAddress, _amount: 1000 ether});

        // Deploy all position dependencies
        uint256 typeId = __deployPositionType();

        // Create an empty LidoStakingPosition for the fund
        vm.prank(fundOwner);
        lidoWithdrawalsPosition = ILidoWithdrawalsPositionLib(
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
        bytes memory args = abi.encode(address(withdrawalQueue), address(stethToken));

        return deployCode("LidoWithdrawalsPositionLib.sol", args);
    }

    function __deployParser() internal returns (address parserAddress_) {
        bytes memory args = abi.encode(address(stethToken), address(wethToken));

        return deployCode("LidoWithdrawalsPositionParser.sol", args);
    }

    function __deployPositionType() internal returns (uint256 typeId_) {
        // Deploy position contracts
        address libAddress = __deployLib();
        address parserAddress = __deployParser();

        // Register position type
        typeId_ = registerExternalPositionTypeForVersion({
            _version: version,
            _label: "LIDO_WITHDRAWALS",
            _lib: libAddress,
            _parser: parserAddress
        });

        return typeId_;
    }

    // ACTION HELPERS

    function __claimWithdrawals(uint256[] memory _requestIds, uint256[] memory _hints) internal {
        bytes memory actionArgs = abi.encode(_requestIds, _hints);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(lidoWithdrawalsPosition),
            _actionId: uint256(ILidoWithdrawalsPositionProd.Actions.ClaimWithdrawals),
            _actionArgs: actionArgs
        });
    }

    function __requestWithdrawals(uint256[] memory _amounts) internal {
        bytes memory actionArgs = abi.encode(_amounts);

        vm.prank(fundOwner);
        callOnExternalPositionForVersion({
            _version: version,
            _comptrollerProxyAddress: comptrollerProxyAddress,
            _externalPositionAddress: address(lidoWithdrawalsPosition),
            _actionId: uint256(ILidoWithdrawalsPositionProd.Actions.RequestWithdrawals),
            _actionArgs: actionArgs
        });
    }

    // MISC HELPERS

    function __finalizeAllRequests() internal {
        // 1. Get the total amount of "batches" required to finalize all requests
        uint256[] memory batches;
        {
            ILidoWithdrawalQueue.BatchesCalculationState memory batchesState;
            batchesState.remainingEthBudget = type(uint256).max;
            while (!batchesState.finished) {
                batchesState = withdrawalQueue.calculateFinalizationBatches({
                    _maxShareRate: type(uint256).max,
                    _maxTimestamp: type(uint256).max,
                    _maxRequestsPerCall: 100, // arbitrary
                    _state: batchesState
                });
            }

            batches = new uint256[](batchesState.batchesLength);
            for (uint256 i; i < batchesState.batchesLength; i++) {
                batches[i] = batchesState.batches[i];
            }
        }

        // 2. Get the total amount of ETH required to fully finalize all requests
        (uint256 ethRequired,) = withdrawalQueue.prefinalize({_batches: batches, _maxShareRate: type(uint256).max});

        // 3. Find a user who can finalize and seed with enough ETH
        address admin = withdrawalQueue.getRoleMember(withdrawalQueue.FINALIZE_ROLE(), 0);
        increaseNativeAssetBalance(admin, ethRequired);

        // 4. Finalize
        uint256 lastRequestId = withdrawalQueue.getLastRequestId();
        vm.prank(admin);
        withdrawalQueue.finalize{value: ethRequired}({
            _lastRequestIdToBeFinalized: lastRequestId,
            _maxShareRate: type(uint256).max
        });
    }

    function __getCheckpointHints(uint256[] memory _requestIds) internal view returns (uint256[] memory hints_) {
        // Sorting is required but takes some effort; just assume the requestIds are in ascending order
        uint256[] memory sortedRequestIds = _requestIds;

        // Uses widest range of checkpoint indices
        return withdrawalQueue.findCheckpointHints({
            _requestIds: sortedRequestIds,
            _firstIndex: 1,
            _lastIndex: withdrawalQueue.getLastCheckpointIndex()
        });
    }
}

/////////////
// ACTIONS //
/////////////

abstract contract RequestWithdrawalsTest is TestBase {
    function test_requestWithdrawals_success() public {
        uint256 preTxVaultStethBal = stethToken.balanceOf(vaultProxyAddress);

        // Define request amounts
        uint256 requestAmount1 = 3 * assetUnit(stethToken);
        uint256 requestAmount2 = 11 * assetUnit(stethToken);
        uint256 totalRequestsAmount = requestAmount1 + requestAmount2;
        assertTrue(totalRequestsAmount < preTxVaultStethBal, "not enough stETH in vault");

        uint256 preTxLastRequestId = withdrawalQueue.getLastRequestId();
        uint256 expectedRequestId1 = preTxLastRequestId + 1;
        uint256 expectedRequestId2 = preTxLastRequestId + 2;

        // Define local EP event assertions
        expectEmit(address(lidoWithdrawalsPosition));
        emit RequestAdded(expectedRequestId1, requestAmount1);
        expectEmit(address(lidoWithdrawalsPosition));
        emit RequestAdded(expectedRequestId2, requestAmount2);

        vm.recordLogs();

        // Request withdrawals
        __requestWithdrawals({_amounts: toArray(requestAmount1, requestAmount2)});

        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted (no assets in this case)
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: new address[](0)
        });

        // Assert EP storage
        ILidoWithdrawalsPositionLib.Request[] memory requests = lidoWithdrawalsPosition.getRequests();
        assertEq(requests.length, 2);
        assertEq(requests[0].id, uint128(expectedRequestId1));
        assertEq(requests[0].amount, uint128(requestAmount1));
        assertEq(requests[1].id, uint128(expectedRequestId2));
        assertEq(requests[1].amount, uint128(requestAmount2));

        // Lido's requests storage is not easily accessible,
        // and we don't assert their event since not all param values were known pre-tx.
        // The claimWithdrawals tests suffice to prove that the requests were correctly registered.

        // Assert vault stETH diff
        // Give a buffer of 1 wei per request for rounding errors
        assertApproxEqAbs(
            stethToken.balanceOf(vaultProxyAddress), preTxVaultStethBal - totalRequestsAmount, requests.length
        );
    }
}

abstract contract ClaimWithdrawalsTest is TestBase {
    function test_claimWithdrawals_success() public {
        // Request a few withdrawals
        uint256 requestAmount1 = 3 * assetUnit(stethToken);
        uint256 requestAmount2 = 11 * assetUnit(stethToken);
        uint256 requestAmount3 = 7 * assetUnit(stethToken);
        __requestWithdrawals({_amounts: toArray(requestAmount1, requestAmount2, requestAmount3)});

        // Finalize requests in Lido
        __finalizeAllRequests();

        uint256 preTxVaultWethBal = wethToken.balanceOf(vaultProxyAddress);

        // Define a subset of requests to withdraw
        ILidoWithdrawalsPositionLib.Request[] memory preTxRequests = lidoWithdrawalsPosition.getRequests();
        ILidoWithdrawalsPositionLib.Request memory requestToKeep = preTxRequests[1];
        uint256[] memory requestIdsToClaim = toArray(preTxRequests[0].id, preTxRequests[2].id);
        uint256 totalClaimsAmount = preTxRequests[0].amount + preTxRequests[2].amount;

        // Find the hints to pass in
        uint256[] memory hints = __getCheckpointHints(requestIdsToClaim);

        // Define local EP event assertions
        expectEmit(address(lidoWithdrawalsPosition));
        emit RequestRemoved(requestIdsToClaim[0]);
        expectEmit(address(lidoWithdrawalsPosition));
        emit RequestRemoved(requestIdsToClaim[1]);

        vm.recordLogs();

        // Claim the withdrawals
        __claimWithdrawals({_requestIds: requestIdsToClaim, _hints: hints});

        VmSafe.Log[] memory logs = vm.getRecordedLogs();

        // Assert assetsToReceive was correctly formatted
        assertExternalPositionAssetsToReceive({
            _logs: logs,
            _externalPositionManager: IExternalPositionManager(getExternalPositionManagerAddressForVersion(version)),
            _assets: toArray(address(wethToken))
        });

        // Assert the requests were removed from storage
        ILidoWithdrawalsPositionLib.Request[] memory postTxRequests = lidoWithdrawalsPosition.getRequests();
        assertEq(postTxRequests.length, 1);
        assertEq(postTxRequests[0].id, requestToKeep.id);
        assertEq(postTxRequests[0].amount, requestToKeep.amount);

        // Assert the vault received the WETH
        uint256 postTxVaultWethBal = wethToken.balanceOf(vaultProxyAddress);
        assertEq(postTxVaultWethBal, preTxVaultWethBal + totalClaimsAmount);
    }
}

////////////////////
// POSITION VALUE //
////////////////////

abstract contract GetManagedAssetsTest is TestBase {
    function test_getManagedAssets_successWithNoRequests() public {
        // Should return empty arrays

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            lidoWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets.length, 0);
        assertEq(managedAssetAmounts.length, 0);
    }

    function test_getManagedAssets_successWithMultipleRequests() public {
        // Make a couple withdrawal requests
        uint256 requestAmount1 = 3 * assetUnit(stethToken);
        uint256 requestAmount2 = 11 * assetUnit(stethToken);
        __requestWithdrawals({_amounts: toArray(requestAmount1, requestAmount2)});

        // Value should be the sum of the requests, denominated in stETH

        (address[] memory managedAssets, uint256[] memory managedAssetAmounts) =
            lidoWithdrawalsPosition.getManagedAssets();

        assertEq(managedAssets.length, 1);
        assertEq(managedAssets[0], address(stethToken));
        assertEq(managedAssetAmounts.length, 1);
        assertEq(managedAssetAmounts[0], requestAmount1 + requestAmount2);
    }
}

contract LidoWithdrawalsPositionTest is RequestWithdrawalsTest, ClaimWithdrawalsTest, GetManagedAssetsTest {}

contract LidoWithdrawalsPositionTestV4 is LidoWithdrawalsPositionTest {
    function setUp() public override {
        version = EnzymeVersion.V4;

        super.setUp();
    }
}
