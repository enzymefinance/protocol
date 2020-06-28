// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../dependencies/WETH.sol";
import "../interfaces/IKyberNetworkProxy.sol";
import "../utils/AdapterBase.sol";

/// @title KyberAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for interacting with Kyber Network
contract KyberAdapter is AdapterBase {
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

    /// @notice Trades assets on Kyber
    /// @param _encodedArgs Encoded order parameters
    function takeOrder(bytes calldata _encodedArgs)
        external
        onlyVault
        fundAssetsTransferHandler(_encodedArgs)
    {
        (
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount
        ) = __decodeArgs(_encodedArgs);

        // Validate args
        require(minIncomingAssetAmount > 0, "takeOrder: minIncomingAssetAmount must be >0");
        require(outgoingAssetAmount > 0, "takeOrder: outgoingAssetAmount must be >0");
        require(incomingAsset != outgoingAsset, "takeOrder: incomingAsset and outgoingAsset asset cannot be the same");
        require(incomingAsset != address(0), "takeOrder: incomingAsset cannot be empty");
        require(outgoingAsset != address(0), "takeOrder: outgoingAsset cannot be empty");

        // Execute fill
        address nativeAsset = Registry(__getRegistry()).nativeAsset();
        if (outgoingAsset == nativeAsset) {
            __swapNativeAssetToToken(incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount);
        }
        else if (incomingAsset == nativeAsset) {
            __swapTokenToNativeAsset(incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount);
        }
        else {
            __swapTokenToToken(incomingAsset, minIncomingAssetAmount, outgoingAsset, outgoingAssetAmount);
        }
    }

    // PUBLIC FUNCTIONS

    /// @notice Parses the expected assets to receive from a call on integration 
    /// @param _selector The function selector for the callOnIntegration
    /// @param _encodedArgs The encoded parameters for the callOnIntegration
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes memory _encodedArgs)
        public
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
            ) = __decodeArgs(_encodedArgs);

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

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the encoded arguments
    function __decodeArgs(bytes memory _encodedArgs)
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
            _encodedArgs,
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
        uint256 _minIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount
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
                _minIncomingAssetAmount
            );
    }

    /// @dev Executes a swap of ERC20 to ETH
    function __swapTokenToNativeAsset(
        address _incomingAsset,
        uint256 _minIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount
    )
        private
    {
        IERC20(_outgoingAsset).approve(EXCHANGE, _outgoingAssetAmount);

        uint256 preEthBalance = payable(address(this)).balance;
        IKyberNetworkProxy(EXCHANGE).swapTokenToEther(
            _outgoingAsset,
            _outgoingAssetAmount,
            _minIncomingAssetAmount
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_incomingAsset)).deposit{value: ethFilledAmount}();
    }

    /// @dev Executes a swap of ERC20 to ERC20
    function __swapTokenToToken(
        address _incomingAsset,
        uint256 _minIncomingAssetAmount,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount
    )
        private
    {
        IERC20(_outgoingAsset).approve(EXCHANGE, _outgoingAssetAmount);
        IKyberNetworkProxy(EXCHANGE).swapTokenToToken(
            _outgoingAsset,
            _outgoingAssetAmount,
            _incomingAsset,
            _minIncomingAssetAmount
        );
    }
}
