// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";
import {CommonUtils} from "tests/utils/CommonUtils.sol";
import {Bytes32Lib} from "tests/utils/libs/Bytes32Lib.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IIntegrationAdapter} from "tests/interfaces/internal/IIntegrationAdapter.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";

enum Actions {
    CallOnIntegration,
    AddTrackedAssetsToVault,
    RemoveTrackedAssetsFromVault
}

enum SpendAssetsHandleType {
    None,
    Approve,
    Transfer
}

abstract contract AdapterUtils is CoreUtilsBase {
    using Bytes32Lib for bytes32;

    function callOnIntegration(
        IIntegrationManager _integrationManager,
        IComptrollerLib _comptrollerProxy,
        address _adapter,
        bytes4 _selector,
        bytes memory _actionArgs
    ) internal {
        bytes memory callArgs = abi.encode(_adapter, _selector, _actionArgs);

        _comptrollerProxy.callOnExtension(address(_integrationManager), uint256(Actions.CallOnIntegration), callArgs);
    }

    function callOnIntegration(
        IIntegrationManager _integrationManager,
        IComptrollerLib _comptrollerProxy,
        address _caller,
        bytes memory _callArgs
    ) internal {
        address integrationManager = address(_integrationManager);
        uint256 actionId = uint256(0);

        vm.prank(_caller, _caller);
        _comptrollerProxy.callOnExtension(integrationManager, actionId, _callArgs);
    }

    function deployMockedAdapter() internal returns (MockedAdapter) {
        return new MockedAdapter();
    }

    // MISC

    function assertAdapterAssetsForAction(
        VmSafe.Log[] memory _logs,
        SpendAssetsHandleType _spendAssetsHandleType,
        address[] memory _spendAssets,
        uint256[] memory _maxSpendAssetAmounts,
        address[] memory _incomingAssets,
        uint256[] memory _minIncomingAssetAmounts
    ) internal {
        // Find target event
        VmSafe.Log memory targetEvent;
        {
            bytes32 eventSelector = bytes32(
                keccak256(
                    "CallOnIntegrationExecutedForFund(address,address,address,bytes4,bytes,address[],uint256[],address[],uint256[])"
                )
            );

            VmSafe.Log[] memory matchingLogs = filterLogsMatchingSelector({_logs: _logs, _selector: eventSelector});
            assertEq(matchingLogs.length, 1, "assertAdapterAssetsForAction: event not found");

            targetEvent = matchingLogs[0];
        }

        // Parse necessary data from event
        address vaultProxyAddress = IComptrollerLib(targetEvent.topics[1].toAddress()).getVaultProxy();
        IIntegrationAdapter adapter = IIntegrationAdapter(targetEvent.topics[2].toAddress());
        bytes4 actionSelector = targetEvent.topics[3].toBytes4();
        (, bytes memory integrationData,,,,) =
            abi.decode(targetEvent.data, (address, bytes, address[], uint256[], address[], uint256[]));

        // Simulate actually-called parseAssetsForAction()
        (
            uint8 actualSpendAssetsHandleType,
            address[] memory actualSpendAssets,
            uint256[] memory actualMaxSpendAssetAmounts,
            address[] memory actualIncomingAssets,
            uint256[] memory actualMinIncomingAssetAmounts
        ) = adapter.parseAssetsForAction({
            _vaultProxy: vaultProxyAddress,
            _selector: actionSelector,
            _encodedCallArgs: integrationData
        });

        assertEq(
            uint256(_spendAssetsHandleType),
            uint256(actualSpendAssetsHandleType),
            "assertAdapterAssetsForAction: _spendAssetsHandleType mismatch"
        );
        assertEq(_spendAssets, actualSpendAssets, "assertAdapterAssetsForAction: _spendAssets mismatch");
        assertEq(
            _maxSpendAssetAmounts,
            actualMaxSpendAssetAmounts,
            "assertAdapterAssetsForAction: _maxSpendAssetAmounts mismatch"
        );
        assertEq(_incomingAssets, actualIncomingAssets, "assertAdapterAssetsForAction: _incomingAssets mismatch");
        assertEq(
            _minIncomingAssetAmounts,
            actualMinIncomingAssetAmounts,
            "assertAdapterAssetsForAction: _minIncomingAssetAmounts mismatch"
        );
    }
}

contract MockedAdapter is CommonUtils {
    constructor() {}

    function encodeAssetsForAction(
        SpendAssetsHandleType _spendAssetsHandleType,
        address[] memory _spendAssets,
        uint256[] memory _spendAssetAmounts,
        address[] memory _incomingAssets,
        uint256[] memory _minIncomingAssetAmounts
    ) public pure returns (bytes memory actionData_) {
        return abi.encode(
            _spendAssetsHandleType, _spendAssets, _spendAssetAmounts, _incomingAssets, _minIncomingAssetAmounts
        );
    }

    function parseAssetsForAction(address, bytes4, bytes calldata _actionData)
        public
        pure
        returns (
            SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        return __decodeIntegrationData(_actionData);
    }

    function action(address _vaultProxy, bytes calldata _integrationData, bytes calldata _assetData) external {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_assetData);

        (,,,, uint256[] memory minIncomingAssetAmounts_) = __decodeIntegrationData(_integrationData);

        for (uint256 i; i < spendAssets.length; ++i) {
            IERC20(spendAssets[i]).transfer(makeAddr("externalProtocol"), spendAssetAmounts[i]);
        }

        for (uint256 i; i < incomingAssets.length; ++i) {
            increaseTokenBalance(IERC20(incomingAssets[i]), _vaultProxy, minIncomingAssetAmounts_[i]);
        }
    }

    function __decodeIntegrationData(bytes memory _integrationData)
        internal
        pure
        returns (
            SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (spendAssetsHandleType_, spendAssets_, spendAssetAmounts_, incomingAssets_, minIncomingAssetAmounts_) =
            abi.decode(_integrationData, (SpendAssetsHandleType, address[], uint256[], address[], uint256[]));
    }

    /// @dev Helper to decode the _assetData param passed to adapter call
    function __decodeAssetData(bytes memory _assetData)
        internal
        pure
        returns (address[] memory spendAssets_, uint256[] memory spendAssetAmounts_, address[] memory incomingAssets_)
    {
        return abi.decode(_assetData, (address[], uint256[], address[]));
    }
}
