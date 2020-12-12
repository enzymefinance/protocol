// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../interfaces/IParaSwapAugustusSwapper.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase.sol";

/// @title ParaSwapAdapter Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Adapter for interacting with ParaSwap
contract ParaSwapAdapter is AdapterBase {
    using SafeMath for uint256;

    string private constant REFERRER = "enzyme";

    address private immutable EXCHANGE;
    address private immutable TOKEN_TRANSFER_PROXY;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _exchange,
        address _tokenTransferProxy,
        address _wethToken
    ) public AdapterBase(_integrationManager) {
        EXCHANGE = _exchange;
        TOKEN_TRANSFER_PROXY = _tokenTransferProxy;
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH refund from sent network fees
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "PARASWAP";
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
            ,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            IParaSwapAugustusSwapper.Path[] memory paths
        ) = __decodeCallArgs(_encodedCallArgs);

        // Format incoming assets
        incomingAssets_ = new address[](1);
        incomingAssets_[0] = incomingAsset;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount;

        // Format outgoing assets depending on if there are network fees
        uint256 totalNetworkFees = __calcTotalNetworkFees(paths);
        if (totalNetworkFees > 0) {
            // We are not performing special logic if the incomingAsset is the fee asset
            if (outgoingAsset == WETH_TOKEN) {
                spendAssets_ = new address[](1);
                spendAssets_[0] = outgoingAsset;

                spendAssetAmounts_ = new uint256[](1);
                spendAssetAmounts_[0] = outgoingAssetAmount.add(totalNetworkFees);
            } else {
                spendAssets_ = new address[](2);
                spendAssets_[0] = outgoingAsset;
                spendAssets_[1] = WETH_TOKEN;

                spendAssetAmounts_ = new uint256[](2);
                spendAssetAmounts_[0] = outgoingAssetAmount;
                spendAssetAmounts_[1] = totalNetworkFees;
            }
        } else {
            spendAssets_ = new address[](1);
            spendAssets_[0] = outgoingAsset;

            spendAssetAmounts_ = new uint256[](1);
            spendAssetAmounts_[0] = outgoingAssetAmount;
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @notice Trades assets on ParaSwap
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
        __takeOrder(_vaultProxy, _encodedCallArgs);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to parse the total amount of network fees (in ETH) for the multiSwap() call
    function __calcTotalNetworkFees(IParaSwapAugustusSwapper.Path[] memory _paths)
        private
        pure
        returns (uint256 totalNetworkFees_)
    {
        for (uint256 i; i < _paths.length; i++) {
            totalNetworkFees_ = totalNetworkFees_.add(_paths[i].totalNetworkFee);
        }

        return totalNetworkFees_;
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address incomingAsset_,
            uint256 minIncomingAssetAmount_,
            uint256 expectedIncomingAssetAmount_, // Passed as a courtesy to ParaSwap for analytics
            address outgoingAsset_,
            uint256 outgoingAssetAmount_,
            IParaSwapAugustusSwapper.Path[] memory paths_
        )
    {
        return
            abi.decode(
                _encodedCallArgs,
                (address, uint256, uint256, address, uint256, IParaSwapAugustusSwapper.Path[])
            );
    }

    /// @dev Helper to encode the call to ParaSwap multiSwap() as low-level calldata.
    /// Avoids the stack-too-deep error.
    function __encodeMultiSwapCallData(
        address _vaultProxy,
        address _incomingAsset,
        uint256 _minIncomingAssetAmount,
        uint256 _expectedIncomingAssetAmount, // Passed as a courtesy to ParaSwap for analytics
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        IParaSwapAugustusSwapper.Path[] memory _paths
    ) private pure returns (bytes memory multiSwapCallData) {
        return
            abi.encodeWithSelector(
                IParaSwapAugustusSwapper.multiSwap.selector,
                _outgoingAsset, // fromToken
                _incomingAsset, // toToken
                _outgoingAssetAmount, // fromAmount
                _minIncomingAssetAmount, // toAmount
                _expectedIncomingAssetAmount, // expectedAmount
                _paths, // path
                0, // mintPrice
                payable(_vaultProxy), // beneficiary
                0, // donationPercentage
                REFERRER // referrer
            );
    }

    /// @dev Helper to execute ParaSwapAugustusSwapper.multiSwap() via a low-level call.
    /// Avoids the stack-too-deep error.
    function __executeMultiSwap(bytes memory _multiSwapCallData, uint256 _totalNetworkFees)
        private
    {
        (bool success, bytes memory returnData) = EXCHANGE.call{value: _totalNetworkFees}(
            _multiSwapCallData
        );
        require(success, string(returnData));
    }

    /// @dev Helper for the inner takeOrder() logic.
    /// Avoids the stack-too-deep error.
    function __takeOrder(address _vaultProxy, bytes memory _encodedCallArgs) private {
        (
            address incomingAsset,
            uint256 minIncomingAssetAmount,
            uint256 expectedIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            IParaSwapAugustusSwapper.Path[] memory paths
        ) = __decodeCallArgs(_encodedCallArgs);

        __approveMaxAsNeeded(outgoingAsset, TOKEN_TRANSFER_PROXY, outgoingAssetAmount);

        // If there are network fees, unwrap enough WETH to cover the fees
        uint256 totalNetworkFees = __calcTotalNetworkFees(paths);
        if (totalNetworkFees > 0) {
            __unwrapWeth(totalNetworkFees);
        }

        // Get the callData for the low-level multiSwap() call
        bytes memory multiSwapCallData = __encodeMultiSwapCallData(
            _vaultProxy,
            incomingAsset,
            minIncomingAssetAmount,
            expectedIncomingAssetAmount,
            outgoingAsset,
            outgoingAssetAmount,
            paths
        );

        // Execute the trade on ParaSwap
        __executeMultiSwap(multiSwapCallData, totalNetworkFees);

        // If fees were paid and ETH remains in the contract, wrap it as WETH so it can be returned
        if (totalNetworkFees > 0) {
            __wrapEth();
        }
    }

    /// @dev Helper to unwrap specified amount of WETH into ETH.
    /// Avoids the stack-too-deep error.
    function __unwrapWeth(uint256 _amount) private {
        IWETH(payable(WETH_TOKEN)).withdraw(_amount);
    }

    /// @dev Helper to wrap all ETH in contract as WETH.
    /// Avoids the stack-too-deep error.
    function __wrapEth() private {
        uint256 ethBalance = payable(address(this)).balance;
        if (ethBalance > 0) {
            IWETH(payable(WETH_TOKEN)).deposit{value: ethBalance}();
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `EXCHANGE` variable
    /// @return exchange_ The `EXCHANGE` variable value
    function getExchange() external view returns (address exchange_) {
        return EXCHANGE;
    }

    /// @notice Gets the `TOKEN_TRANSFER_PROXY` variable
    /// @return tokenTransferProxy_ The `TOKEN_TRANSFER_PROXY` variable value
    function getTokenTransferProxy() external view returns (address tokenTransferProxy_) {
        return TOKEN_TRANSFER_PROXY;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
