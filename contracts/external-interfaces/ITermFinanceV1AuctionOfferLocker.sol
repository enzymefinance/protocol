// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title ITermFinanceV1AuctionOfferLocker Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITermFinanceV1AuctionOfferLocker {
    struct TermAuctionOfferSubmission {
        bytes32 id;
        address offeror;
        bytes32 offerPriceHash;
        uint256 amount;
        address purchaseToken;
    }

    struct TermAuctionOffer {
        bytes32 id;
        address offeror;
        bytes32 offerPriceHash;
        uint256 offerPriceRevealed;
        uint256 amount;
        address purchaseToken;
        bool isRevealed;
    }

    function lockOffersWithReferral(TermAuctionOfferSubmission[] calldata _offerSubmissions, address _referralAddress)
        external
        returns (bytes32[] memory offerIds_);

    function lockedOffer(bytes32 _offerId) external view returns (TermAuctionOffer memory offer_);

    function unlockOffers(bytes32[] calldata _offerIds) external;
}
