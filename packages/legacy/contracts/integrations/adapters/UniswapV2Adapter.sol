// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../interfaces/IUniswapV2Router2.sol";
import "../utils/AdapterBase.sol";

/// @title UniswapV2Adapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for interacting with Uniswap v2
contract UniswapV2Adapter is AdapterBase {
    address public immutable ROUTER;

    constructor(address _registry, address _router) public AdapterBase(_registry) {
        ROUTER = _router;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external override pure returns (string memory) {
        return "UNISWAP_V2";
    }

    /// @notice Parses the expected assets to receive from a call on integration
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedCallArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _encodedCallArgs)
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
        if (_selector == TAKE_ORDER_SELECTOR) {
            (
                address[] memory path,
                uint256 minIncomingAssetAmount,
                uint256 outgoingAssetAmount
            ) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = path[0];
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = path[path.length - 1];
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        } else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Trades assets on Uniswap
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function takeOrder(bytes calldata _encodedCallArgs, bytes calldata _encodedAssetTransferArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedAssetTransferArgs)
    {
        (
            address[] memory path,
            uint256 minIncomingAssetAmount,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        // Validate args
        require(path.length >= 2, "takeOrder: path must be >=2");
        require(minIncomingAssetAmount > 0, "takeOrder: minIncomingAssetAmount must be >0");
        require(outgoingAssetAmount > 0, "takeOrder: outgoingAssetAmount must be >0");

        // Execute fill
        IERC20(path[0]).approve(ROUTER, outgoingAssetAmount);
        IUniswapV2Router2(ROUTER).swapExactTokensForTokens(
            outgoingAssetAmount,
            minIncomingAssetAmount,
            path,
            msg.sender,
            block.timestamp.add(1)
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address[] memory path_,
            uint256 minIncomingAssetAmount_,
            uint256 outgoingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address[], uint256, uint256));
    }
}
