// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../release/extensions/integration-manager/integrations/utils/AdapterBase.sol";

/// @title IMockGenericIntegratee Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMockGenericIntegratee {
    function swap(
        address[] calldata,
        uint256[] calldata,
        address[] calldata,
        uint256[] calldata
    ) external payable;

    function swapOnBehalf(
        address payable,
        address[] calldata,
        uint256[] calldata,
        address[] calldata,
        uint256[] calldata
    ) external payable;
}

/// @title MockGenericAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Provides a generic adapter that:
/// 1. Provides swapping functions that use various `SpendAssetsTransferType` values
/// 2. Directly parses the _actual_ values to swap from provided call data (e.g., `actualIncomingAssetAmounts`)
/// 3. Directly parses values needed by the IntegrationManager from provided call data (e.g., `minIncomingAssetAmounts`)
contract MockGenericAdapter is AdapterBase {
    address public immutable INTEGRATEE;

    // No need to specify the IntegrationManager
    constructor(address _integratee) public AdapterBase(address(0)) {
        INTEGRATEE = _integratee;
    }

    function identifier() external pure override returns (string memory) {
        return "MOCK_GENERIC";
    }

    function parseAssetsForMethod(bytes4 _selector, bytes calldata _callArgs)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory maxSpendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            spendAssets_,
            maxSpendAssetAmounts_,
            ,
            incomingAssets_,
            minIncomingAssetAmounts_,

        ) = __decodeCallArgs(_callArgs);

        return (
            __getSpendAssetsHandleTypeForSelector(_selector),
            spendAssets_,
            maxSpendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Assumes SpendAssetsHandleType.Transfer unless otherwise specified
    function __getSpendAssetsHandleTypeForSelector(bytes4 _selector)
        private
        pure
        returns (IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_)
    {
        if (_selector == bytes4(keccak256("removeOnly(address,bytes,bytes)"))) {
            return IIntegrationManager.SpendAssetsHandleType.Remove;
        }
        if (_selector == bytes4(keccak256("swapDirectFromVault(address,bytes,bytes)"))) {
            return IIntegrationManager.SpendAssetsHandleType.None;
        }
        if (_selector == bytes4(keccak256("swapViaApproval(address,bytes,bytes)"))) {
            return IIntegrationManager.SpendAssetsHandleType.Approve;
        }
        return IIntegrationManager.SpendAssetsHandleType.Transfer;
    }

    function removeOnly(
        address,
        bytes calldata,
        bytes calldata
    ) external {}

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

    function swapDirectFromVault(
        address _vaultProxy,
        bytes calldata _callArgs,
        bytes calldata
    ) external {
        (
            address[] memory spendAssets,
            ,
            uint256[] memory actualSpendAssetAmounts,
            address[] memory incomingAssets,
            ,
            uint256[] memory actualIncomingAssetAmounts
        ) = __decodeCallArgs(_callArgs);

        IMockGenericIntegratee(INTEGRATEE).swapOnBehalf(
            payable(_vaultProxy),
            spendAssets,
            actualSpendAssetAmounts,
            incomingAssets,
            actualIncomingAssetAmounts
        );
    }

    function swapViaApproval(
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
            uint256[] memory maxSpendAssetAmounts_,
            uint256[] memory actualSpendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_,
            uint256[] memory actualIncomingAssetAmounts_
        )
    {
        return
            abi.decode(
                _callArgs,
                (address[], uint256[], uint256[], address[], uint256[], uint256[])
            );
    }

    function __decodeCallArgsAndSwap(bytes memory _callArgs) internal {
        (
            address[] memory spendAssets,
            ,
            uint256[] memory actualSpendAssetAmounts,
            address[] memory incomingAssets,
            ,
            uint256[] memory actualIncomingAssetAmounts
        ) = __decodeCallArgs(_callArgs);

        for (uint256 i; i < spendAssets.length; i++) {
            ERC20(spendAssets[i]).approve(INTEGRATEE, actualSpendAssetAmounts[i]);
        }
        IMockGenericIntegratee(INTEGRATEE).swap(
            spendAssets,
            actualSpendAssetAmounts,
            incomingAssets,
            actualIncomingAssetAmounts
        );
    }
}
