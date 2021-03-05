// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../../../../interfaces/ICurveAddressProvider.sol";
import "../../../../interfaces/ICurveSwapsERC20.sol";
import "../../../../interfaces/ICurveSwapsEther.sol";
import "../../../../interfaces/IWETH.sol";
import "../utils/AdapterBase.sol";

/// @title CurveExchangeAdapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for swapping assets on Curve <https://www.curve.fi/>
contract CurveExchangeAdapter is AdapterBase {
    address private constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address private immutable ADDRESS_PROVIDER;
    address private immutable WETH_TOKEN;

    constructor(
        address _integrationManager,
        address _addressProvider,
        address _wethToken
    ) public AdapterBase(_integrationManager) {
        ADDRESS_PROVIDER = _addressProvider;
        WETH_TOKEN = _wethToken;
    }

    /// @dev Needed to receive ETH from swap and to unwrap WETH
    receive() external payable {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "CURVE_EXCHANGE";
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
            address pool,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            address incomingAsset,
            uint256 minIncomingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        require(pool != address(0), "parseAssetsForMethod: No pool address provided");

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

    /// @notice Trades assets on Curve
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _encodedCallArgs Encoded order parameters
    function takeOrder(
        address _vaultProxy,
        bytes calldata _encodedCallArgs,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            address pool,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            address incomingAsset,
            uint256 minIncomingAssetAmount
        ) = __decodeCallArgs(_encodedCallArgs);

        address swaps = ICurveAddressProvider(ADDRESS_PROVIDER).get_address(2);

        __takeOrder(
            _vaultProxy,
            swaps,
            pool,
            outgoingAsset,
            outgoingAssetAmount,
            incomingAsset,
            minIncomingAssetAmount
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode the take order encoded call arguments
    function __decodeCallArgs(bytes memory _encodedCallArgs)
        private
        pure
        returns (
            address pool_,
            address outgoingAsset_,
            uint256 outgoingAssetAmount_,
            address incomingAsset_,
            uint256 minIncomingAssetAmount_
        )
    {
        return abi.decode(_encodedCallArgs, (address, address, uint256, address, uint256));
    }

    /// @dev Helper to execute takeOrder. Avoids stack-too-deep error.
    function __takeOrder(
        address _vaultProxy,
        address _swaps,
        address _pool,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset,
        uint256 _minIncomingAssetAmount
    ) private {
        if (_outgoingAsset == WETH_TOKEN) {
            IWETH(WETH_TOKEN).withdraw(_outgoingAssetAmount);

            ICurveSwapsEther(_swaps).exchange{value: _outgoingAssetAmount}(
                _pool,
                ETH_ADDRESS,
                _incomingAsset,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                _vaultProxy
            );
        } else if (_incomingAsset == WETH_TOKEN) {
            __approveMaxAsNeeded(_outgoingAsset, _swaps, _outgoingAssetAmount);

            ICurveSwapsERC20(_swaps).exchange(
                _pool,
                _outgoingAsset,
                ETH_ADDRESS,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                address(this)
            );

            // wrap received ETH and send back to the vault
            uint256 receivedAmount = payable(address(this)).balance;
            IWETH(payable(WETH_TOKEN)).deposit{value: receivedAmount}();
            ERC20(WETH_TOKEN).safeTransfer(_vaultProxy, receivedAmount);
        } else {
            __approveMaxAsNeeded(_outgoingAsset, _swaps, _outgoingAssetAmount);

            ICurveSwapsERC20(_swaps).exchange(
                _pool,
                _outgoingAsset,
                _incomingAsset,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                _vaultProxy
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ADDRESS_PROVIDER` variable
    /// @return addressProvider_ The `ADDRESS_PROVIDER` variable value
    function getAddressProvider() external view returns (address addressProvider_) {
        return ADDRESS_PROVIDER;
    }

    /// @notice Gets the `WETH_TOKEN` variable
    /// @return wethToken_ The `WETH_TOKEN` variable value
    function getWethToken() external view returns (address wethToken_) {
        return WETH_TOKEN;
    }
}
