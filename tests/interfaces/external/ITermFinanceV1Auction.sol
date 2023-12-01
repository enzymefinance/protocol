// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ITermFinanceV1Auction {
    struct CompleteAuctionInput {
        bytes32[] revealedBidSubmissions;
        bytes32[] expiredRolloverBids;
        bytes32[] unrevealedBidSubmissions;
        bytes32[] revealedOfferSubmissions;
        bytes32[] unrevealedOfferSubmissions;
    }

    function auctionEndTime() external view returns (uint256 auctionEndTime_);

    function completeAuction(CompleteAuctionInput calldata _completeAuctionInput) external;

    function dayCountFractionMantissa() external view returns (uint256 dayCountFractionMantissa_);

    function purchaseToken() external view returns (address purchaseToken_);

    function termAuctionBidLocker() external view returns (address termAuctionBidLocker_);

    function termAuctionOfferLocker() external view returns (address termAuctionOfferLocker_);

    function termRepoServicer() external view returns (address termRepoServicer_);
}
