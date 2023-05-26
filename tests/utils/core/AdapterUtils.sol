// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Test} from "forge-std/Test.sol";
import {TokenUtils} from "tests/utils/common/TokenUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IComptroller} from "tests/interfaces/internal/IComptroller.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";

enum SpendAssetsHandleType {
    None,
    Approve,
    Transfer
}

abstract contract AdapterUtils is Test {
    function callOnIntegration(
        IIntegrationManager _integrationManager,
        IComptroller _comptrollerProxy,
        address _caller,
        bytes memory _callArgs
    ) internal {
        address integrationManager = address(_integrationManager);
        uint256 actionId = uint256(0);

        vm.prank(_caller);
        _comptrollerProxy.callOnExtension(integrationManager, actionId, _callArgs);
    }

    function deployMockedAdapter() public returns (MockedAdapter) {
        return new MockedAdapter();
    }
}

contract MockedAdapter is TokenUtils {
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
