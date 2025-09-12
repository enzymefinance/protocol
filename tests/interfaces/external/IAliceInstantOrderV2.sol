// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IAliceInstantOrderV2 Interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IAliceInstantOrderV2 {
    function aliceKey() external view returns (address aliceKeyAddress_);

    function cancelOrder(
        uint256 _orderId,
        address _user,
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        uint256 _timestamp
    ) external;

    function cancelOrderWithReference(
        uint256 _orderId,
        address _user,
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        uint256 _timestamp,
        address _receiver,
        bytes32 _refId
    ) external;

    function feeRate(address _user) external view returns (uint256 feeRate_);

    function getMostRecentOrderId() external view returns (uint256 orderId_);

    function getOrderHash(uint256 _orderId) external view returns (bytes32 orderHash_);

    function liquidityPoolContract() external view returns (address liquidityPoolContractAddress_);

    function settleOrder(
        uint256 _orderId,
        address _user,
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        uint256 _timestamp,
        uint256 _quantityReceivedPreFee
    ) external;

    function settleOrderWithReference(
        uint256 _orderId,
        address _user,
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        uint256 _timestamp,
        uint256 _quantityReceivedPreFee,
        address _receiver,
        bytes32 _refId
    ) external;

    function refundTimeoutSeconds() external view returns (uint256 refundTimeoutSeconds_);

    function whitelistContract() external returns (address whitelistContractAddress_);
}
