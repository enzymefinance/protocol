// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {VmSafe} from "forge-std/Vm.sol";

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";
import {CommonUtils} from "tests/utils/CommonUtils.sol";
import {Bytes32Lib} from "tests/utils/libs/Bytes32Lib.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {
    IIntegrationAdapter,
    IIntegrationManager as IIntegrationManagerTypeLibrary
} from "tests/interfaces/internal/IIntegrationAdapter.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";

// Not a production type
enum Actions {
    CallOnIntegration,
    AddTrackedAssetsToVault,
    RemoveTrackedAssetsFromVault
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

    /// @dev This doesn't work when the `_vaultProxy` value of `parseAssetsForAction` is used to query live balances,
    /// since this assertion runs _after_ action and state changes have been made. `assertParseAssetsForAction()` should generally be preferred
    function assertAdapterAssetsForAction(
        VmSafe.Log[] memory _logs,
        uint8 _spendAssetsHandleTypeUint8,
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
        address adapterAddress = targetEvent.topics[2].toAddress();
        bytes4 actionSelector = targetEvent.topics[3].toBytes4();
        (, bytes memory integrationData,,,,) =
            abi.decode(targetEvent.data, (address, bytes, address[], uint256[], address[], uint256[]));

        // Simulate actually-called parseAssetsForAction()
        assertParseAssetsForAction({
            _vaultProxyAddress: vaultProxyAddress,
            _adapterAddress: adapterAddress,
            _actionSelector: actionSelector,
            _integrationData: integrationData,
            _expectedSpendAssetsHandleTypeUint8: _spendAssetsHandleTypeUint8,
            _expectedSpendAssets: _spendAssets,
            _expectedMaxSpendAssetAmounts: _maxSpendAssetAmounts,
            _expectedIncomingAssets: _incomingAssets,
            _expectedMinIncomingAssetAmounts: _minIncomingAssetAmounts
        });
    }

    function assertParseAssetsForAction(
        address _vaultProxyAddress,
        address _adapterAddress,
        bytes4 _actionSelector,
        bytes memory _integrationData,
        uint8 _expectedSpendAssetsHandleTypeUint8,
        address[] memory _expectedSpendAssets,
        uint256[] memory _expectedMaxSpendAssetAmounts,
        address[] memory _expectedIncomingAssets,
        uint256[] memory _expectedMinIncomingAssetAmounts
    ) internal {
        (
            IIntegrationManagerTypeLibrary.SpendAssetsHandleType actualSpendAssetsHandleType,
            address[] memory actualSpendAssets,
            uint256[] memory actualMaxSpendAssetAmounts,
            address[] memory actualIncomingAssets,
            uint256[] memory actualMinIncomingAssetAmounts
        ) = IIntegrationAdapter(_adapterAddress)
            .parseAssetsForAction({
                _vaultProxy: _vaultProxyAddress, _selector: _actionSelector, _encodedCallArgs: _integrationData
            });

        assertEq(
            _expectedSpendAssetsHandleTypeUint8,
            IIntegrationManagerTypeLibrary.SpendAssetsHandleType.unwrap(actualSpendAssetsHandleType),
            "assertParseAssetsForAction: _spendAssetsHandleType mismatch"
        );
        assertEq(_expectedSpendAssets, actualSpendAssets, "assertParseAssetsForAction: _spendAssets mismatch");
        assertEq(
            _expectedMaxSpendAssetAmounts,
            actualMaxSpendAssetAmounts,
            "assertParseAssetsForAction: _maxSpendAssetAmounts mismatch"
        );
        assertEq(_expectedIncomingAssets, actualIncomingAssets, "assertParseAssetsForAction: _incomingAssets mismatch");
        assertEq(
            _expectedMinIncomingAssetAmounts,
            actualMinIncomingAssetAmounts,
            "assertParseAssetsForAction: _minIncomingAssetAmounts mismatch"
        );
    }
}

contract MockedAdapter is CommonUtils {
    constructor() {}

    function encodeAssetsForAction(
        uint8 _spendAssetsHandleTypeUint8,
        address[] memory _spendAssets,
        uint256[] memory _spendAssetAmounts,
        address[] memory _incomingAssets,
        uint256[] memory _minIncomingAssetAmounts
    ) public pure returns (bytes memory actionData_) {
        return abi.encode(
            _spendAssetsHandleTypeUint8, _spendAssets, _spendAssetAmounts, _incomingAssets, _minIncomingAssetAmounts
        );
    }

    function parseAssetsForAction(address, bytes4, bytes calldata _actionData)
        public
        pure
        returns (
            uint8 spendAssetsHandleTypeUint8_,
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
            uint8 spendAssetsHandleTypeUint8_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            spendAssetsHandleTypeUint8_, spendAssets_, spendAssetAmounts_, incomingAssets_, minIncomingAssetAmounts_
        ) = abi.decode(_integrationData, (uint8, address[], uint256[], address[], uint256[]));
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
