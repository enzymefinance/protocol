// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface ITermFinanceV1OfferLocker {
    struct TermAuctionOffer {
        bytes32 id;
        address offeror;
        bytes32 offerPriceHash;
        uint256 offerPriceRevealed;
        uint256 amount;
        address purchaseToken;
        bool isRevealed;
    }

    function auctionStartTime() external view returns (uint256 startTime);

    function lockedOffer(bytes32 _offerId) external view returns (TermAuctionOffer memory offer_);

    function revealOffers(bytes32[] calldata _ids, uint256[] calldata _prices, uint256[] calldata _nonces) external;
}
