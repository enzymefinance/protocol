// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../dependencies/WETH.sol";
import "../../utils/MathHelpers.sol";
import "../interfaces/IKyberNetworkProxy.sol";
import "../utils/AdapterBase.sol";

/// @title KyberAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for interacting with Kyber Network
contract KyberAdapter is AdapterBase, MathHelpers {
    address immutable public EXCHANGE;

    constructor(address _registry, address _exchange) public AdapterBase(_registry) {
        EXCHANGE = _exchange;
    }

    /// @dev Needed to receive ETH from swap
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return An identifier string
    function identifier() external pure override returns (string memory) {
        return "KYBER_NETWORK";
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
        view
        override
        returns (
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == TAKE_ORDER_SELECTOR) {
            (
                address incomingAsset,
                uint256 minIncomingAssetAmount,
                address outgoingAsset,
                uint256 outgoingAssetAmount
            ) = __decodeCallArgs(_encodedCallArgs);

            spendAssets_ = new address[](1);
            spendAssets_[0] = outgoingAsset;
            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;

            incomingAssets_ = new address[](1);
            incomingAssets_[0] = incomingAsset;
            minIncomingAssetAmounts_ = new uint256[](1);
            minIncomingAssetAmounts_[0] = minIncomingAssetAmount;
        }
        else {
            revert("parseIncomingAssets: _selector invalid");
        }
    }

    /// @notice Trades assets on Kyber
    /// @param _encodedCallArgs Encoded order parameters
    /// @param _encodedAssetTransferArgs Encoded args for expected assets to spend and receive
    function takeOrder(bytes calldata _encodedCallArgs, bytes calldata _encodedAssetTransferArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedAssetTransferArgs)
    {
        (
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        // Validate args
        require(minIncomingAssetAmount > 0, "takeOrder: minIncomingAssetAmount must be >0");
        require(outgoingAssetAmount > 0, "takeOrder: outgoingAssetAmount must be >0");
        require(incomingAsset != outgoingAsset, "takeOrder: incomingAsset and outgoingAsset asset cannot be the same");
        require(incomingAsset != address(0), "takeOrder: incomingAsset cannot be empty");
        require(outgoingAsset != address(0), "takeOrder: outgoingAsset cannot be empty");

        // Execute fill
        uint256 minExpectedRate = __calcRate(
            outgoingAsset,
            outgoingAssetAmount,
            minIncomingAssetAmount
        );

        address nativeAsset = Registry(__getRegistry()).WETH_TOKEN();
        if (outgoingAsset == nativeAsset) {
            __swapNativeAssetToToken(incomingAsset, outgoingAsset, outgoingAssetAmount, minExpectedRate);
        }
        else if (incomingAsset == nativeAsset) {
            __swapTokenToNativeAsset(incomingAsset, outgoingAsset, outgoingAssetAmount, minExpectedRate);
        }
        else {
            __swapTokenToToken(incomingAsset, outgoingAsset, outgoingAssetAmount, minExpectedRate);
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
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
        return abi.decode(
            _encodedCallArgs,
            (
                address,
                uint256,
                address,
                uint256
            )
        );
    }

    /// @dev Executes a swap of ETH to ERC20
    function __swapNativeAssetToToken(
        address _incomingAsset,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    )
        private
    {
        // Convert WETH to ETH
        WETH(payable(_outgoingAsset)).withdraw(_outgoingAssetAmount);

        // Swap tokens
        IKyberNetworkProxy(EXCHANGE)
            .swapEtherToToken
            {value: _outgoingAssetAmount}
            (
                _incomingAsset,
                _minExpectedRate
            );
    }

    /// @dev Executes a swap of ERC20 to ETH
    function __swapTokenToNativeAsset(
        address _incomingAsset,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    )
        private
    {
        IERC20(_outgoingAsset).approve(EXCHANGE, _outgoingAssetAmount);

        uint256 preEthBalance = payable(address(this)).balance;
        IKyberNetworkProxy(EXCHANGE).swapTokenToEther(
            _outgoingAsset,
            _outgoingAssetAmount,
            _minExpectedRate
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_incomingAsset)).deposit{value: ethFilledAmount}();
    }

    /// @dev Executes a swap of ERC20 to ERC20
    function __swapTokenToToken(
        address _incomingAsset,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        uint256 _minExpectedRate
    )
        private
    {
        IERC20(_outgoingAsset).approve(EXCHANGE, _outgoingAssetAmount);
        IKyberNetworkProxy(EXCHANGE).swapTokenToToken(
            _outgoingAsset,
            _outgoingAssetAmount,
            _incomingAsset,
            _minExpectedRate
        );
    }
}
