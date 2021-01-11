// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IUniswapV2Factory.sol";
import "../../../../interfaces/IUniswapV2Router2.sol";
import "../utils/AdapterBase.sol";

/// @title UniswapV2Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Uniswap v2
contract UniswapV2Adapter is AdapterBase {
    using SafeMath for uint256;

    address private immutable FACTORY;
    address private immutable ROUTER;

    constructor(
        address _integrationManager,
        address _router,
        address _factory
    ) public AdapterBase(_integrationManager) {
        FACTORY = _factory;
        ROUTER = _router;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "UNISWAP_V2";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
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
        } else if (_selector == REDEEM_SELECTOR) {
            (
                uint256 outgoingAssetAmount,
                address[2] memory incomingAssets,
                uint256[2] memory minIncomingAssetAmounts
            ) = __decodeRedeemCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            // No need to validate not address(0), this will be caught in IntegrationManager
            spendAssets_[0] = IUniswapV2Factory(FACTORY).getPair(
                incomingAssets[0],
                incomingAssets[1]
            );

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            incomingAssets_ = new address[](2);
            incomingAssets_[0] = incomingAssets[0];
            incomingAssets_[1] = incomingAssets[1];

            minIncomingAssetAmounts_ = new uint256[](2);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmounts[0];
            minIncomingAssetAmounts_[1] = minIncomingAssetAmounts[1];
        } else if (_selector == TAKE_ORDER_SELECTOR) {
            (
                address[] memory path,
                uint256 outgoingAssetAmount,
                uint256 minIncomingAssetAmount
            ) = __decodeTakeOrderCallArgs(_encodedCallArgs);

            require(path.length >= 2, "parseAssetsForMethod: _path must be >= 2");

            spendAssets_ = new address[](1);
            spendAssets_[0] = path[0];
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = path[path.length - 1];
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        } else {
            revert("parseAssetsForMethod: _selector invalid");
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Lends assets for pool tokens on Uniswap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function lend(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            address[2] memory outgoingAssets,
            uint256[2] memory maxOutgoingAssetAmounts,
            uint256[2] memory minOutgoingAssetAmounts,

        ) = __decodeLendCallArgs(_encodedCallArgs);

        __lend(
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
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            uint256 outgoingAssetAmount,
            address[2] memory incomingAssets,
            uint256[2] memory minIncomingAssetAmounts
        ) = __decodeRedeemCallArgs(_encodedCallArgs);

        // More efficient to parse pool token from _encodedAssetTransferArgs than external call
        (, address[] memory spendAssets, , ) = __decodeEncodedAssetTransferArgs(
            _encodedAssetTransferArgs
        );

        __redeem(
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
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata _encodedAssetTransferArgs
    )
        external
        onlyIntegrationManager
        fundAssetsTransferHandler(_vaultProxy, _encodedAssetTransferArgs)
    {
        (
            address[] memory path,
            uint256 outgoingAssetAmount,
            uint256 minIncomingAssetAmount
        ) = __decodeTakeOrderCallArgs(_encodedCallArgs);

        __takeOrder(_vaultProxy, outgoingAssetAmount, minIncomingAssetAmount, path);
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

    /// @dev Helper to execute lend. Avoids stack-too-deep error.
    function __lend(
        address _vaultProxy,
        address _tokenA,
        address _tokenB,
        uint256 _amountADesired,
        uint256 _amountBDesired,
        uint256 _amountAMin,
        uint256 _amountBMin
    ) private {
        __approveMaxAsNeeded(_tokenA, ROUTER, _amountADesired);
        __approveMaxAsNeeded(_tokenB, ROUTER, _amountBDesired);

        // Execute lend on Uniswap
        IUniswapV2Router2(ROUTER).addLiquidity(
            _tokenA,
            _tokenB,
            _amountADesired,
            _amountBDesired,
            _amountAMin,
            _amountBMin,
            _vaultProxy,
            block.timestamp.add(1)
        );
    }

    /// @dev Helper to execute redeem. Avoids stack-too-deep error.
    function __redeem(
        address _vaultProxy,
        address _poolToken,
        uint256 _poolTokenAmount,
        address _tokenA,
        address _tokenB,
        uint256 _amountAMin,
        uint256 _amountBMin
    ) private {
        __approveMaxAsNeeded(_poolToken, ROUTER, _poolTokenAmount);

        // Execute redeem on Uniswap
        IUniswapV2Router2(ROUTER).removeLiquidity(
            _tokenA,
            _tokenB,
            _poolTokenAmount,
            _amountAMin,
            _amountBMin,
            _vaultProxy,
            block.timestamp.add(1)
        );
    }

    /// @dev Helper to execute takeOrder. Avoids stack-too-deep error.
    function __takeOrder(
        address _vaultProxy,
        uint256 _outgoingAssetAmount,
        uint256 _minIncomingAssetAmount,
        address[] memory _path
    ) private {
        __approveMaxAsNeeded(_path[0], ROUTER, _outgoingAssetAmount);

        // Execute fill
        IUniswapV2Router2(ROUTER).swapExactTokensForTokens(
            _outgoingAssetAmount,
            _minIncomingAssetAmount,
            _path,
            _vaultProxy,
            block.timestamp.add(1)
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FACTORY` variable
    /// @return factory_ The `FACTORY` variable value
    function getFactory() external view returns (address factory_) {
        return FACTORY;
    }

    /// @notice Gets the `ROUTER` variable
    /// @return router_ The `ROUTER` variable value
    function getRouter() external view returns (address router_) {
        return ROUTER;
    }
}
