// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1Auction Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1Auction {
    function auctionCompleted() external view returns (bool auctionCompleted_);

    function auctionEndTime() external view returns (uint256 auctionEndTime_);

    function clearingPrice() external view returns (uint256 clearingPrice_);

    function dayCountFractionMantissa() external view returns (uint256 dayCountFractionMantissa_);

    function purchaseToken() external view returns (address purchaseToken_);

    function termAuctionOfferLocker() external view returns (address termAuctionOfferLocker_);

    function termRepoServicer() external view returns (address termRepoServicer_);
}
