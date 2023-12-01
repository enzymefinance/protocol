// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ITermFinanceV1BidLocker {
    struct TermAuctionBidSubmission {
        bytes32 id;
        address bidder;
        bytes32 bidPriceHash;
        uint256 amount;
        uint256[] collateralAmounts;
        address purchaseToken;
        address[] collateralTokens;
    }

    function lockBids(TermAuctionBidSubmission[] calldata _bidSubmissions)
        external
        returns (bytes32[] memory bidIds_);

    function revealBids(bytes32[] calldata _ids, uint256[] calldata _prices, uint256[] calldata _nonces) external;

    function revealTime() external view returns (uint256 revealTime_);
}
