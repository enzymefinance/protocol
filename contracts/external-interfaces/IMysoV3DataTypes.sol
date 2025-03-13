// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

library IMysoV3DataTypes {
    struct OptionInfo {
        address underlyingToken;
        uint48 expiry;
        address settlementToken;
        uint48 earliestExercise;
        uint128 notional;
        uint128 strike;
        AdvancedSettings advancedSettings;
    }

    struct AdvancedSettings {
        uint64 borrowCap;
        address oracle;
        bool premiumTokenIsUnderlying;
        bool votingDelegationAllowed;
        address allowedDelegateRegistry;
    }

    struct AuctionInitialization {
        address underlyingToken;
        address settlementToken;
        uint128 notional;
        AuctionParams auctionParams;
        AdvancedSettings advancedSettings;
    }

    struct AuctionParams {
        uint128 relStrike;
        uint48 tenor;
        uint48 earliestExerciseTenor;
        uint32 decayStartTime;
        uint32 decayDuration;
        uint64 relPremiumStart;
        uint64 relPremiumFloor;
        uint128 minSpot;
        uint128 maxSpot;
    }

    struct RFQInitialization {
        OptionInfo optionInfo;
        RFQQuote rfqQuote;
    }

    struct RFQQuote {
        uint128 premium;
        uint256 validUntil;
        bytes signature;
        address eip1271Maker;
    }
}
