// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../../../external-interfaces/IZeroExV2.sol";
import "../../../../../utils/AssetHelpers.sol";
import "../../../../../utils/MathHelpers.sol";

/// @title ZeroExV2ActionsMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with the ZeroExV2 exchange functions
abstract contract ZeroExV2ActionsMixin is AssetHelpers, MathHelpers {
    address private immutable ZERO_EX_V2_EXCHANGE;

    constructor(address _exchange) public {
        ZERO_EX_V2_EXCHANGE = _exchange;
    }

    /// @dev Helper to execute takeOrder
    function __zeroExV2TakeOrder(
        IZeroExV2.Order memory _order,
        uint256 _takerAssetFillAmount,
        bytes memory _signature
    ) internal {
        // Approve spend assets as needed
        __approveAssetMaxAsNeeded(
            __getAssetAddress(_order.takerAssetData),
            __getAssetProxy(_order.takerAssetData),
            _takerAssetFillAmount
        );
        // Ignores whether makerAsset or takerAsset overlap with the takerFee asset for simplicity
        if (_order.takerFee > 0) {
            bytes memory zrxData = IZeroExV2(ZERO_EX_V2_EXCHANGE).ZRX_ASSET_DATA();
            __approveAssetMaxAsNeeded(
                __getAssetAddress(zrxData),
                __getAssetProxy(zrxData),
                __calcRelativeQuantity(
                    _order.takerAssetAmount,
                    _order.takerFee,
                    _takerAssetFillAmount
                ) // fee calculated relative to taker fill amount
            );
        }

        // Execute order
        IZeroExV2(ZERO_EX_V2_EXCHANGE).fillOrder(_order, _takerAssetFillAmount, _signature);
    }

    /// @dev Parses the asset address from 0x assetData
    function __getAssetAddress(bytes memory _assetData)
        internal
        pure
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }

    /// @dev Gets the 0x assetProxy address for an ERC20 token
    function __getAssetProxy(bytes memory _assetData) internal view returns (address assetProxy_) {
        bytes4 assetProxyId;

        assembly {
            assetProxyId := and(
                mload(add(_assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy_ = IZeroExV2(getZeroExV2Exchange()).getAssetProxy(assetProxyId);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `ZERO_EX_V2_EXCHANGE` variable value
    /// @return zeroExV2Exchange_ The `ZERO_EX_V2_EXCHANGE` variable value
    function getZeroExV2Exchange() public view returns (address zeroExV2Exchange_) {
        return ZERO_EX_V2_EXCHANGE;
    }
}
