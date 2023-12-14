// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ERC20} from "openzeppelin-solc-0.8/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.8/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "openzeppelin-solc-0.8/utils/math/SafeCast.sol";
import {ITermFinanceV1Auction} from "../../../../../external-interfaces/ITermFinanceV1Auction.sol";
import {ITermFinanceV1AuctionOfferLocker} from "../../../../../external-interfaces/ITermFinanceV1AuctionOfferLocker.sol";
import {ITermFinanceV1RepoServicer} from "../../../../../external-interfaces/ITermFinanceV1RepoServicer.sol";
import {ITermFinanceV1RepoToken} from "../../../../../external-interfaces/ITermFinanceV1RepoToken.sol";
import {AddressArrayLib} from "../../../../../utils/0.8.19/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.8.19/AssetHelpers.sol";
import {TermFinanceV1LendingPositionLibBase1} from "./bases/TermFinanceV1LendingPositionLibBase1.sol";
import {ITermFinanceV1LendingPosition} from "./ITermFinanceV1LendingPosition.sol";
import {TermFinanceV1LendingPositionDataDecoder} from "./TermFinanceV1LendingPositionDataDecoder.sol";

/// @title TermFinanceV1LendingPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An External Position library contract for Term Finance V1 Lending Positions
/// @dev See "POSITION VALUE" section for notes on pricing mechanism that must be considered by funds
contract TermFinanceV1LendingPositionLib is
    ITermFinanceV1LendingPosition,
    TermFinanceV1LendingPositionDataDecoder,
    TermFinanceV1LendingPositionLibBase1,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeERC20 for ERC20;

    address internal immutable REFERRER_ADDRESS;
    uint256 internal constant SCALING_FACTOR = 1e18;
    uint256 internal constant DOUBLE_SCALING_FACTOR = SCALING_FACTOR * SCALING_FACTOR;
    uint256 internal constant THREESIXTY_DAYCOUNT_SECONDS = 360 days;

    constructor(address _referrerAddress) {
        REFERRER_ADDRESS = _referrerAddress;
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.AddOrUpdateOffers)) {
            __addOrUpdateOffers(actionArgs);
        } else if (actionId == uint256(Actions.RemoveOffers)) {
            __removeOffers(actionArgs);
        } else if (actionId == uint256(Actions.Redeem)) {
            __redeem(actionArgs);
        } else if (actionId == uint256(Actions.Sweep)) {
            __sweep(actionArgs);
        }
    }

    /// @dev Creates Term Finance offers (lending side).
    /// This action allows new offers to be added, or existing offers to be updated.
    /// To add a new offer, the submittedOfferId must not correspond to an existing order ID.
    /// To modify an existing offer, the submittedOfferId must correspond to an existing order ID.
    /// Note that when adding new offers, a new orderId will be generated. This orderId differs from the submitted offerId.
    /// When modifying an existing offer, the orderId will remain unchanged.
    function __addOrUpdateOffers(bytes memory _actionArgs) private {
        (
            ITermFinanceV1Auction termAuction,
            bytes32[] memory submittedOfferIds,
            bytes32[] memory offerPriceHashes,
            int256[] memory amountsChange
        ) = __decodeAddOrUpdateOffersActionArgs(_actionArgs);

        uint256 submittedOffersLength = submittedOfferIds.length;

        // Ensure that the submittedOffers array is not-empty. (Term Finance does not revert on empty arrays)
        // This is necessary to prevent adding duplicate termAuctions to storage.
        require(submittedOffersLength > 0, "__addOrUpdateOffers: Empty submittedOfferIds");

        address purchaseTokenAddress = termAuction.purchaseToken();

        ITermFinanceV1AuctionOfferLocker.TermAuctionOfferSubmission[] memory offerSubmissions =
            new ITermFinanceV1AuctionOfferLocker.TermAuctionOfferSubmission[](submittedOffersLength);

        bool containsDecrease;
        for (uint256 i; i < submittedOffersLength; i++) {
            // Compute the absolute amounts from the amountsChange
            uint256 existingOfferAmount = ITermFinanceV1AuctionOfferLocker(termAuction.termAuctionOfferLocker())
                .lockedOffer(submittedOfferIds[i]).amount;

            if (amountsChange[i] < 0) {
                containsDecrease = true;
            }

            uint256 nextOfferAmount = (existingOfferAmount.toInt256() + amountsChange[i]).toUint256();

            require(nextOfferAmount > 0, "addOrUpdateOffers: Offer amount must be > 0");

            offerSubmissions[i] = ITermFinanceV1AuctionOfferLocker.TermAuctionOfferSubmission({
                id: submittedOfferIds[i],
                offeror: address(this),
                offerPriceHash: offerPriceHashes[i],
                amount: nextOfferAmount,
                purchaseToken: purchaseTokenAddress
            });
        }

        // Update the termAuctionToOfferIds mapping
        bytes32[] storage currentOffersIds = termAuctionToOfferIds[address(termAuction)];

        // If the TermAuction has no offerId, we need to add it to storage and approve the termAuction spend
        if (currentOffersIds.length == 0) {
            termAuctions.push(address(termAuction));

            emit TermAuctionAdded(address(termAuction));

            // neededAmount is set to 1 to approve max once, since a max allowance can never be used up in practice
            __approveAssetMaxAsNeeded({
                _asset: purchaseTokenAddress,
                _target: ITermFinanceV1RepoServicer(termAuction.termRepoServicer()).termRepoLocker(),
                _neededAmount: 1
            });
        }

        bytes32[] memory offerIds = ITermFinanceV1AuctionOfferLocker(termAuction.termAuctionOfferLocker())
            .lockOffersWithReferral({_offerSubmissions: offerSubmissions, _referralAddress: REFERRER_ADDRESS});

        // Assert that the generated offerIds are unique. This ensures that:
        // An offer can't be created and updated
        // An offer can't be updated multiple times
        require(__isUniqueSet(offerIds), "__addOrUpdateOffers: Duplicate offerIds");

        // Add the new offerIds to storage
        for (uint256 i; i < offerIds.length; i++) {
            bytes32 offerId = offerIds[i];

            // If a submitted offerId equals the generated offerId, the order is already in storage (only its amount is being modified)
            if (offerIds[i] == submittedOfferIds[i]) {
                continue;
            }

            // The offer is new, add it to storage
            currentOffersIds.push(offerId);

            emit OfferAdded(address(termAuction), offerId);
        }

        if (containsDecrease) {
            // Transfer excess purchaseToken if an existing order amount has been decreased
            __sweepTermAuctionPurchaseToken({_termAuction: termAuction});
        }
    }

    /// @dev Removes and refunds existing Term Finance offers.
    function __removeOffers(bytes memory _actionArgs) private {
        (ITermFinanceV1Auction termAuction, bytes32[] memory offerIds) = __decodeRemoveOffersActionArgs(_actionArgs);

        ITermFinanceV1AuctionOfferLocker(termAuction.termAuctionOfferLocker()).unlockOffers({_offerIds: offerIds});

        bytes32[] storage currentOffers = termAuctionToOfferIds[address(termAuction)];

        for (uint256 i; i < offerIds.length; i++) {
            uint256 currentOffersLength = currentOffers.length;

            // Find and delete the offer from storage
            for (uint256 j; j < currentOffersLength; j++) {
                if (offerIds[i] == currentOffers[j]) {
                    if (j != currentOffersLength - 1) {
                        currentOffers[j] = currentOffers[currentOffersLength - 1];
                    }
                    currentOffers.pop();

                    emit OfferRemoved(address(termAuction), offerIds[i]);

                    break;
                }
            }
        }

        if (currentOffers.length == 0) {
            // If there are no more offers, we can delete the termAuction
            __removeTermAuction({_termAuctionAddress: address(termAuction)});
        }

        // Transfer the refund back to the Vault
        __sweepTermAuctionPurchaseToken({_termAuction: termAuction});
    }

    /// @dev Redeems a redeemable Term Finance offer.
    function __redeem(bytes memory _actionArgs) private {
        (ITermFinanceV1Auction termAuction, uint256 repoTokenAmount) = __decodeRedeemActionArgs(_actionArgs);

        ITermFinanceV1RepoServicer termRepoServicer = ITermFinanceV1RepoServicer(termAuction.termRepoServicer());

        termRepoServicer.redeemTermRepoTokens({_redeemer: address(this), _amountToRedeem: repoTokenAmount});

        __sweepTermAuctionPurchaseToken({_termAuction: termAuction});

        if (ERC20(termRepoServicer.termRepoToken()).balanceOf(address(this)) == 0) {
            // If there is no repoToken balance left, we can delete the termAuction
            __removeTermAuction({_termAuctionAddress: address(termAuction)});
        }
    }

    /// @dev Helper to sweep the purchaseToken balances from stored termAuctions.
    /// Used for cleaning up unfulfilled orders that have been refunded to the EP.
    /// If possible, removes the termAuction from storage
    function __sweep(bytes memory _actionArgs) internal {
        (ITermFinanceV1Auction[] memory submittedTermAuctions) = __decodeSweepActionArgs(_actionArgs);

        for (uint256 i; i < submittedTermAuctions.length; i++) {
            ITermFinanceV1Auction termAuction = submittedTermAuctions[i];

            __sweepTermAuctionPurchaseToken({_termAuction: termAuction});

            // If the auction has been completed (and therefore all unrevealed or unmatched offers have been refunded)
            // and if the EP's repoToken balance is 0,
            // the termAuction can be removed from storage (it can never contain additional value).
            if (
                termAuction.auctionCompleted()
                    && ERC20(ITermFinanceV1RepoServicer(termAuction.termRepoServicer()).termRepoToken()).balanceOf(
                        address(this)
                    ) == 0
            ) {
                __removeTermAuction({_termAuctionAddress: address(termAuction)});
            }
        }
    }

    /// @dev Removes a termAuction from storage. Also deletes the corresponding termAuctionToOfferIds mapping entry.
    function __removeTermAuction(address _termAuctionAddress) internal {
        termAuctions.removeStorageItem(_termAuctionAddress);
        delete termAuctionToOfferIds[_termAuctionAddress];
        emit TermAuctionRemoved(_termAuctionAddress);
    }

    /// @dev Helper to sweep the purchaseToken balance from a termAuction.
    function __sweepTermAuctionPurchaseToken(ITermFinanceV1Auction _termAuction) internal {
        ERC20 purchaseToken = ERC20(_termAuction.purchaseToken());
        uint256 purchaseTokenBalance = purchaseToken.balanceOf(address(this));

        if (purchaseTokenBalance > 0) {
            purchaseToken.safeTransfer(msg.sender, purchaseTokenBalance);
        }
    }

    /// @dev Helper to verify if bytes32 array is a set of unique values.
    /// Does not assert length > 0.
    function __isUniqueSet(bytes32[] memory _items) internal pure returns (bool isUnique_) {
        if (_items.length <= 1) {
            return true;
        }

        uint256 arrayLength = _items.length;
        for (uint256 i; i < arrayLength; i++) {
            for (uint256 j = i + 1; j < arrayLength; j++) {
                if (_items[i] == _items[j]) {
                    return false;
                }
            }
        }

        return true;
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    // CONSIDERATIONS FOR FUND MANAGERS:
    // 1. Assumes that the full expected loan value will be repaid at maturity,
    // i.e., does not consider under-collateralization or failure to repay, even post-maturity.
    // 2. After an auction ends and until loan maturity, lent value is not redeemable.
    // During this time, value is estimated based on simple interest accrual, pro-rata for the time elapsed.

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external pure override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 4 ways that Term Auctions can contribute value to this position:
    /// 1. Purchase tokens (loan underlyings) that have been refunded to the EP due to actions outside of the EP's control
    /// 2. Outstanding offers in open auctions (refundable)
    /// 3. Repo tokens (loans) that have not reached maturity and are still accruing interest
    /// 4. Repo tokens (loans) that have reached maturity and are redeemable
    function getManagedAssets() external view override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint256 termAuctionsLength = termAuctions.length;

        // If no termAuction is stored, return empty arrays.
        if (termAuctionsLength == 0) {
            return (assets_, amounts_);
        }

        // The only asset that will ever be received for a given auction (and loan) is its purchaseToken
        address[] memory rawAssets = new address[](termAuctionsLength);
        uint256[] memory rawAmounts = new uint256[](termAuctionsLength);

        for (uint256 i; i < termAuctionsLength; i++) {
            ITermFinanceV1Auction termAuction = ITermFinanceV1Auction(termAuctions[i]);
            rawAssets[i] = termAuction.purchaseToken();

            if (!termAuction.auctionCompleted()) {
                // (2) Auction is still open. Offers are worth their refundable value.
                rawAmounts[i] += __getLockedOffersValue(termAuction);
            } else {
                // (3) and (4) Auction is complete, offers have either been matched or refunded.
                // Refunds are already handled by the balance check, so only need to check active loans.
                rawAmounts[i] += __getLoanValue(termAuction);
            }
        }

        // Does not remove 0-amount items
        (assets_, amounts_) = __aggregateAssetAmounts(rawAssets, rawAmounts);

        // (1) Outstanding balance of purchaseTokens
        // We calculate the balance after aggregating to avoid double-counting
        for (uint256 i; i < assets_.length; i++) {
            amounts_[i] += ERC20(assets_[i]).balanceOf(address(this));
        }
    }

    /// @dev Helper to get active (filled) loan value
    function __getLoanValue(ITermFinanceV1Auction _termAuction) private view returns (uint256 loanValue_) {
        ITermFinanceV1RepoServicer termRepoServicer = ITermFinanceV1RepoServicer(_termAuction.termRepoServicer());
        ITermFinanceV1RepoToken repoToken = ITermFinanceV1RepoToken(termRepoServicer.termRepoToken());
        uint256 repoTokenBalance = ERC20(address(repoToken)).balanceOf(address(this));

        // If the repoToken balance is 0, there is no active loan
        if (repoTokenBalance == 0) {
            return 0;
        }

        if (block.timestamp < termRepoServicer.redemptionTimestamp()) {
            // (3) We have not reached the redemption window but auction is complete
            return
                (repoTokenBalance * __getEstimatedRepoTokenPresentValue({_termAuction: _termAuction})) / SCALING_FACTOR;
        } else {
            // (4) We have reached the redemption window, use the redemption value
            // Redemptions are valued in two ways depending on the health of the repayments ("repurchases"):
            // 1. If the loans were fully repurchased, the redemption value is the full loan value ("par redemptions")
            // 2. If the loans were not fully repurchased, the redemption value is prorated based on the repurchased amounts ("pro-rata redemptions")
            // Not fully repurchased loans result from "undercollateralized" borrowers.
            // Since we are not able to accurately detect and price undercollateralized borrowers while the loan is active,
            // we are fully disregarding the possibility of pro-rata redemptions, therefore considering all redemptions to be "par redemptions".

            // Copied from Term Finance's logic: https://github.com/term-finance/term-finance-contracts/blob/f766367dfc33ba7b93f6e29f27f12e65c132d242/contracts/TermRepoToken.sol#L150
            // redemptionValue is always specified in 18 decimal notation
            // repoTokenBalance is specified in the same decimal notation as the purchaseToken
            // repoToken.redemptionValue() / SCALING_FACTOR therefore represents the "percentage of the repoToken that will actually be paid out".
            loanValue_ = repoTokenBalance * repoToken.redemptionValue() / SCALING_FACTOR;
        }

        return loanValue_;
    }

    /// @dev Helper to get locked offers value for a particular termAuction
    function __getLockedOffersValue(ITermFinanceV1Auction _termAuction)
        private
        view
        returns (uint256 lockedOffersValue_)
    {
        bytes32[] memory offerIds = termAuctionToOfferIds[address(_termAuction)];

        ITermFinanceV1AuctionOfferLocker termAuctionOfferLocker =
            ITermFinanceV1AuctionOfferLocker(_termAuction.termAuctionOfferLocker());

        // Add up the amounts of all locked offers
        for (uint256 i; i < offerIds.length; i++) {
            lockedOffersValue_ += termAuctionOfferLocker.lockedOffer(offerIds[i]).amount;
        }
    }

    /// @dev Helper to calculate an estimate of the present value of a term auction's repoToken,
    /// based on the percentage of the loan term that has elapsed and the expected interest at maturity,
    /// assuming full repayment and using simple (non-compounding) interest calculations.
    function __getEstimatedRepoTokenPresentValue(ITermFinanceV1Auction _termAuction)
        private
        view
        returns (uint256 accruedLoanValue_)
    {
        // The clearing price is specified as a percentage increase over a 360 day period. It is represented with 18 decimals.
        uint256 interestRate = _termAuction.clearingPrice();
        uint256 dayCountFractionMantissa = _termAuction.dayCountFractionMantissa();

        // TermStart is not stored directly, but it can be retrieved by reversing the dayCountFractionMantissa calculation from the auction initializer
        // src: https://github.com/term-finance/term-finance-contracts/blob/47d0675c92aac3b55663a6e0065a6f3a85998e07/contracts/TermAuction.sol#L157-L159
        uint256 termStart = ITermFinanceV1RepoServicer(_termAuction.termRepoServicer()).redemptionTimestamp()
            - (dayCountFractionMantissa * THREESIXTY_DAYCOUNT_SECONDS / SCALING_FACTOR);

        // Using the same logic as Term's dayCountFractionMantissa calculation, we calculate a partial mantissa for the elapsed time
        uint256 partialDayCountFractionMantissa =
            ((block.timestamp - termStart) * SCALING_FACTOR) / THREESIXTY_DAYCOUNT_SECONDS;

        // To get the current accrued value, we must first retrieve the initial principal value
        // This is a peculiarity of simple (non-compounding) interest, which is what Term Finance uses.
        uint256 totalInterestAccruedFactor = SCALING_FACTOR + interestRate * dayCountFractionMantissa / SCALING_FACTOR;
        uint256 principalValue = DOUBLE_SCALING_FACTOR / totalInterestAccruedFactor;

        // Calculate how much interest has accrued from the principalValue
        uint256 interestAccruedFactor = SCALING_FACTOR + interestRate * partialDayCountFractionMantissa / SCALING_FACTOR;
        uint256 presentValue = principalValue * interestAccruedFactor / SCALING_FACTOR;

        return presentValue;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the offerIds for a particular termAuction address
    /// @param _termAuctionAddress The address of the Term Finance termAuction
    /// @return offerIds_ The offerIds from the termAuctionToOfferIds mapping for the specified termAuction address
    function getOfferIdsFromTermAuction(address _termAuctionAddress)
        public
        view
        override
        returns (bytes32[] memory offerIds_)
    {
        return termAuctionToOfferIds[_termAuctionAddress];
    }

    /// @notice Gets the termAuctions var
    /// @return termAuctions_ The Term Finance termAuction addresses
    function getTermAuctions() public view override returns (address[] memory termAuctions_) {
        return termAuctions;
    }
}
