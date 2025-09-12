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
    function placeOrder(address _tokenToSell, address _tokenToBuy, uint256 _quantityToSell, uint256 _limitAmountToGet)
        external
        payable;

    function placeOrder(
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        address _receiver,
        bytes32 _referenceId
    ) external payable;

    function refundOrder(
        uint256 _orderId,
        address _user,
        address _tokenToSell,
        address _tokenToBuy,
        uint256 _quantityToSell,
        uint256 _limitAmountToGet,
        uint256 _timestamp
    ) external;

    function getOrderHash(uint256 _orderId) external view returns (bytes32 orderHash_);

    function getMostRecentOrderId() external view returns (uint256 orderId_);
}
