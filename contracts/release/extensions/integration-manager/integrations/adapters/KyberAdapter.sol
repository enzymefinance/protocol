// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/IKyberNetworkProxy.sol";
import "../../../../interfaces/IWETH.sol";
import "../../../../utils/MathHelpers.sol";
import "../utils/AdapterBase.sol";

/// @title KyberAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with Kyber Network
contract KyberAdapter is AdapterBase, MathHelpers {
    address private immutable EXCHANGE;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _exchange,
        address _wethToken
    ) public AdapterBase(_integrationManager) {
        EXCHANGE = _exchange;
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH from swap
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "KYBER_NETWORK";
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
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForMethod: _selector invalid");

        (
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        require(
            incomingAsset != outgoingAsset,
            "parseAssetsForMethod: incomingAsset and outgoingAsset asset cannot be the same"
        );
        require(outgoingAssetAmount > 0, "parseAssetsForMethod: outgoingAssetAmount must be >0");

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingAsset;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;
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

    /// @notice Trades assets on Kyber
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
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        uint256 minExpectedRate = __calcNormalizedRate(
            ERC20(outgoingAsset).decimals(),
            outgoingAssetAmount,
            ERC20(incomingAsset).decimals(),
            minIncomingAssetAmount
        );

        if (outgoingAsset == WETH_TOKEN) {
            __swapNativeAssetToToken(incomingAsset, outgoingAssetAmount, minExpectedRate);
        } else if (incomingAsset == WETH_TOKEN) {
            __swapTokenToNativeAsset(outgoingAsset, outgoingAssetAmount, minExpectedRate);
        } else {
            __swapTokenToToken(incomingAsset, outgoingAsset, outgoingAssetAmount, minExpectedRate);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded call arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address incomingAsset_,
            uint256 minIncomingAssetAmount_,
            address outgoingAsset_,
            uint256 outgoingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, uint256, address, uint256));
    }

    /// @dev Executes a swap of ETH to ERC20
    function __swapNativeAssetToToken(
        address _incomingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    ) private {
        IWETH(payable(WETH_TOKEN)).withdraw(_outgoingAssetAmount);

        IKyberNetworkProxy(EXCHANGE).swapEtherToToken{value: _outgoingAssetAmount}(
            _incomingAsset,
            _minExpectedRate
        );
    }

    /// @dev Executes a swap of ERC20 to ETH
    function __swapTokenToNativeAsset(
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    ) private {
        __approveMaxAsNeeded(_outgoingAsset, EXCHANGE, _outgoingAssetAmount);

        IKyberNetworkProxy(EXCHANGE).swapTokenToEther(
            _outgoingAsset,
            _outgoingAssetAmount,
            _minExpectedRate
        );

        IWETH(payable(WETH_TOKEN)).deposit{value: payable(address(this)).balance}();
    }

    /// @dev Executes a swap of ERC20 to ERC20
    function __swapTokenToToken(
        address _incomingAsset,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    ) private {
        __approveMaxAsNeeded(_outgoingAsset, EXCHANGE, _outgoingAssetAmount);

        IKyberNetworkProxy(EXCHANGE).swapTokenToToken(
            _outgoingAsset,
            _outgoingAssetAmount,
            _incomingAsset,
            _minExpectedRate
        );
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXCHANGE` variable
    /// @return exchange_ The `EXCHANGE` variable value
    function getExchange() external view returns (address exchange_) {
        return EXCHANGE;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
