// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../../interfaces/ICurveAddressProvider.sol";
import "../../../../../interfaces/ICurveSwapsERC20.sol";
import "../../../../../interfaces/ICurveSwapsEther.sol";
import "../../../../../interfaces/IWETH.sol";
import "../../../../../utils/AssetHelpers.sol";

/// @title CurveExchangeActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the Curve exchange functions
/// @dev Inheriting contract must have a receive() function
abstract contract CurveExchangeActionsMixin is AssetHelpers {
    address private constant CURVE_EXCHANGE_ETH_ADDRESS =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address private immutable CURVE_EXCHANGE_ADDRESS_PROVIDER;
    address private immutable CURVE_EXCHANGE_WETH_TOKEN;

    constructor(address _addressProvider, address _wethToken) public {
        CURVE_EXCHANGE_ADDRESS_PROVIDER = _addressProvider;
        CURVE_EXCHANGE_WETH_TOKEN = _wethToken;
    }

    /// @dev Helper to execute takeOrder
    function __curveTakeOrder(
        address _recipient,
        address _pool,
        address _outgoingAsset,
        uint256 _outgoingAssetAmount,
        address _incomingAsset,
        uint256 _minIncomingAssetAmount
    ) internal {
        address swaps = ICurveAddressProvider(CURVE_EXCHANGE_ADDRESS_PROVIDER).get_address(2);

        if (_outgoingAsset == CURVE_EXCHANGE_WETH_TOKEN) {
            IWETH(CURVE_EXCHANGE_WETH_TOKEN).withdraw(_outgoingAssetAmount);

            ICurveSwapsEther(swaps).exchange{value: _outgoingAssetAmount}(
                _pool,
                CURVE_EXCHANGE_ETH_ADDRESS,
                _incomingAsset,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                _recipient
            );
        } else if (_incomingAsset == CURVE_EXCHANGE_WETH_TOKEN) {
            __approveAssetMaxAsNeeded(_outgoingAsset, swaps, _outgoingAssetAmount);

            ICurveSwapsERC20(swaps).exchange(
                _pool,
                _outgoingAsset,
                CURVE_EXCHANGE_ETH_ADDRESS,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                address(this)
            );

            // Wrap received ETH and send back to the recipient
            uint256 receivedAmount = payable(address(this)).balance;
            IWETH(payable(CURVE_EXCHANGE_WETH_TOKEN)).deposit{value: receivedAmount}();
            ERC20(CURVE_EXCHANGE_WETH_TOKEN).safeTransfer(_recipient, receivedAmount);
        } else {
            __approveAssetMaxAsNeeded(_outgoingAsset, swaps, _outgoingAssetAmount);

            ICurveSwapsERC20(swaps).exchange(
                _pool,
                _outgoingAsset,
                _incomingAsset,
                _outgoingAssetAmount,
                _minIncomingAssetAmount,
                _recipient
            );
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `CURVE_EXCHANGE_ADDRESS_PROVIDER` variable
    /// @return curveExchangeAddressProvider_ The `CURVE_EXCHANGE_ADDRESS_PROVIDER` variable value
    function getCurveExchangeAddressProvider()
        public
        view
        returns (address curveExchangeAddressProvider_)
    {
        return CURVE_EXCHANGE_ADDRESS_PROVIDER;
    }

    /// @notice Gets the `CURVE_EXCHANGE_WETH_TOKEN` variable
    /// @return curveExchangeWethToken_ The `CURVE_EXCHANGE_WETH_TOKEN` variable value
    function getCurveExchangeWethToken() public view returns (address curveExchangeWethToken_) {
        return CURVE_EXCHANGE_WETH_TOKEN;
    }
}
