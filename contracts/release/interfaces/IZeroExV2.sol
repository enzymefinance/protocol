// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @dev Minimal interface for our interactions with the ZeroEx Exchange contract
interface IZeroExV2 {
    struct Order {
        address makerAddress;
        address takerAddress;
        address feeRecipientAddress;
        address senderAddress;
        uint256 makerAssetAmount;
        uint256 takerAssetAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationTimeSeconds;
        uint256 salt;
        bytes makerAssetData;
        bytes takerAssetData;
    }

    struct OrderInfo {
        uint8 orderStatus;
        bytes32 orderHash;
        uint256 orderTakerAssetFilledAmount;
    }

    struct FillResults {
        uint256 makerAssetFilledAmount;
        uint256 takerAssetFilledAmount;
        uint256 makerFeePaid;
        uint256 takerFeePaid;
    }

    function ZRX_ASSET_DATA() external view returns (bytes memory);

    function filled(bytes32) external view returns (uint256);

    function cancelled(bytes32) external view returns (bool);

    function getOrderInfo(Order calldata) external view returns (OrderInfo memory);

    function getAssetProxy(bytes4) external view returns (address);

    function isValidSignature(
        bytes32,
        address,
        bytes calldata
    ) external view returns (bool);

    function preSign(
        bytes32,
        address,
        bytes calldata
    ) external;

    function cancelOrder(Order calldata) external;

    function fillOrder(
        Order calldata,
        uint256,
        bytes calldata
    ) external returns (FillResults memory);
}
