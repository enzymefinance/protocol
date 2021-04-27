// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../interfaces/IUniswapV2Factory.sol";
import "../utils/actions/UniswapV2ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title UniswapV2Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Uniswap v2
contract UniswapV2Adapter is AdapterBase, UniswapV2ActionsMixin {
    address private immutable FACTORY;

    constructor(
        address _integrationManager,
        address _router,
        address _factory
    ) public AdapterBase(_integrationManager) UniswapV2ActionsMixin(_router) {
        FACTORY = _factory;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "UNISWAP_V2";
    }

    /// @notice Lends assets for pool tokens on Uniswap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    function lend(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            address[2] memory outgoingAssets,
            uint256[2] memory maxOutgoingAssetAmounts,
            uint256[2] memory minOutgoingAssetAmounts,

        ) = __decodeLendCallArgs(_encodedCallArgs);

        __uniswapV2Lend(
            _vaultProxy,
            outgoingAssets[0],
            outgoingAssets[1],
            maxOutgoingAssetAmounts[0],
            maxOutgoingAssetAmounts[1],
            minOutgoingAssetAmounts[0],
            minOutgoingAssetAmounts[1]
        );
    }

    /// @notice Redeems pool tokens on Uniswap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function redeem(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    ) external onlyIntegrationManager {
        (
            uint256 outgoingAssetAmount,
            address[2] memory incomingAssets,
            uint256[2] memory minIncomingAssetAmounts
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        // More efficient to parse pool token from _encodedAssetTransferArgs than external call
        (, address[] memory spendAssets, , ) = __decodeEncodedAssetTransferArgs(
            _encodedAssetTransferArgs
        );

        __uniswapV2Redeem(
            _vaultProxy,
            spendAssets[0],
            outgoingAssetAmount,
            incomingAssets[0],
            incomingAssets[1],
            minIncomingAssetAmounts[0],
            minIncomingAssetAmounts[1]
        );
    }

    /// @notice Trades assets on Uniswap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            address[] memory path,
            uint256 outgoingAssetAmount,
            uint256 minIncomingAssetAmount
        ) = __decodeTakeOrderCallArgs(_encodedCallArgs);

        __uniswapV2Swap(_vaultProxy, outgoingAssetAmount, minIncomingAssetAmount, path);
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(
        address,
        bytes4 _selector,
        bytes calldata _encodedCallArgs
    )
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_encodedCallArgs);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_encodedCallArgs);
        } else if (_selector == TAKE_ORDER_SELECTOR) {
            return __parseAssetsForTakeOrder(_encodedCallArgs);
        }

        revert("parseAssetsForMethod: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _encodedCallArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            address[2] memory outgoingAssets,
            uint256[2] memory maxOutgoingAssetAmounts,
            ,
            uint256 minIncomingAssetAmount
        ) = __decodeLendCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](2);
        spendAssets_[0] = outgoingAssets[0];
        spendAssets_[1] = outgoingAssets[1];

        spendAssetAmounts_ = new uint256[](2);
        spendAssetAmounts_[0] = maxOutgoingAssetAmounts[0];
        spendAssetAmounts_[1] = maxOutgoingAssetAmounts[1];

        incomingAssets_ = new address[](1);
        // No need to validate not address(0), this will be caught in IntegrationManager
        incomingAssets_[0] = IUniswapV2Factory(FACTORY).getPair(
            outgoingAssets[0],
            outgoingAssets[1]
        );

        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during redeem() calls
    function __parseAssetsForRedeem(bytes calldata _encodedCallArgs)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            uint256 outgoingAssetAmount,
            address[2] memory incomingAssets,
            uint256[2] memory minIncomingAssetAmounts
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        spendAssets_ = new address[](1);
        // No need to validate not address(0), this will be caught in IntegrationManager
        spendAssets_[0] = IUniswapV2Factory(FACTORY).getPair(incomingAssets[0], incomingAssets[1]);

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](2);
        incomingAssets_[0] = incomingAssets[0];
        incomingAssets_[1] = incomingAssets[1];

        minIncomingAssetAmounts_ = new uint256[](2);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmounts[0];
        minIncomingAssetAmounts_[1] = minIncomingAssetAmounts[1];

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during takeOrder() calls
    function __parseAssetsForTakeOrder(bytes calldata _encodedCallArgs)
        private
        pure
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (
            address[] memory path,
            uint256 outgoingAssetAmount,
            uint256 minIncomingAssetAmount
        ) = __decodeTakeOrderCallArgs(_encodedCallArgs);

        require(path.length >= 2, "__parseAssetsForTakeOrder: _path must be >= 2");

        spendAssets_ = new address[](1);
        spendAssets_[0] = path[0];
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = path[path.length - 1];
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the lend encoded call arguments
    function __decodeLendCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address[2] memory outgoingAssets_,
            uint256[2] memory maxOutgoingAssetAmounts_,
            uint256[2] memory minOutgoingAssetAmounts_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address[2], uint256[2], uint256[2], uint256));
    }

    /// @dev Helper to decode the redeem encoded call arguments
    function __decodeRedeemCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            uint256 outgoingAssetAmount_,
            address[2] memory incomingAssets_,
            uint256[2] memory minIncomingAssetAmounts_
        )
    {
        return abi.decode(_encodedCallArgs, (uint256, address[2], uint256[2]));
    }

    /// @dev Helper to decode the take order encoded call arguments
    function __decodeTakeOrderCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address[] memory path_,
            uint256 outgoingAssetAmount_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address[], uint256, uint256));
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FACTORY` variable
    /// @return factory_ The `FACTORY` variable value
    function getFactory() external view returns (address factory_) {
        return FACTORY;
    }
}
