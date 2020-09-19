// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/release/contracts/interfaces/IERC20Extended.sol";
import "@melonproject/release/contracts/extensions/integration-manager/integrations/utils/AdapterBase.sol";

/// @title IMockGenericIntegratee Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IMockGenericIntegratee {
    function swap(
        address[] calldata,
        uint256[] calldata,
        address[] calldata,
        uint256[] calldata
    ) external payable;
}

/// @title MockGenericAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Provides a generic adapter that:
/// 1. Provides three identical swapping functions
/// 2. Directly parses values to swap from provided call data
/// 3. Directly parses values needed by the integration manager from provided call data
contract MockGenericAdapter is AdapterBase {
    address public immutable INTEGRATEE;

    // No need to specify the IntegrationManager
    constructor(address _integratee) public AdapterBase(address(0)) {
        INTEGRATEE = _integratee;
    }

    function identifier() external override pure returns (string memory) {
        return "MOCK_GENERIC";
    }

    function parseAssetsForMethod(bytes4, bytes calldata _callArgs)
        external
        override
        view
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_,

        ) = __decodeCallArgs(_callArgs);
    }

    function swapA(
        address _vaultProxy,
        bytes calldata _callArgs,
        bytes calldata _assetTransferArgs
    ) external fundAssetsTransferHandler(_vaultProxy, _assetTransferArgs) {
        __decodeCallArgsAndSwap(_callArgs);
    }

    function swapB(
        address _vaultProxy,
        bytes calldata _callArgs,
        bytes calldata _assetTransferArgs
    ) external fundAssetsTransferHandler(_vaultProxy, _assetTransferArgs) {
        __decodeCallArgsAndSwap(_callArgs);
    }

    function swapC(
        address _vaultProxy,
        bytes calldata _callArgs,
        bytes calldata _assetTransferArgs
    ) external fundAssetsTransferHandler(_vaultProxy, _assetTransferArgs) {
        __decodeCallArgsAndSwap(_callArgs);
    }

    function __decodeCallArgs(bytes memory _callArgs)
        internal
        pure
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_,
            uint256[] memory incomingAssetAmounts_
        )
    {
        return abi.decode(_callArgs, (address[], uint256[], address[], uint256[], uint256[]));
    }

    function __decodeCallArgsAndSwap(bytes memory _callArgs) internal {
        (
            address[] memory spendAssets,
            uint256[] memory spendAssetAmounts,
            address[] memory incomingAssets,
            ,
            uint256[] memory incomingAssetAmounts
        ) = __decodeCallArgs(_callArgs);

        for (uint256 i; i < spendAssets.length; i++) {
            IERC20Extended(spendAssets[i]).approve(INTEGRATEE, spendAssetAmounts[i]);
        }
        IMockGenericIntegratee(INTEGRATEE).swap(
            spendAssets,
            spendAssetAmounts,
            incomingAssets,
            incomingAssetAmounts
        );
    }
}
