// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../../persistent/external-positions/solv-v2-convertible-issuer/SolvV2ConvertibleIssuerPositionLibBase1.sol";
import "../../../../interfaces/ISolvV2ConvertiblePool.sol";
import "../../../../interfaces/ISolvV2ConvertibleVoucher.sol";
import "../../../../interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "../../../../utils/Uint256ArrayLib.sol";
import "./ISolvV2ConvertibleIssuerPosition.sol";
import "./SolvV2ConvertibleIssuerPositionDataDecoder.sol";

/// @title SolvV2ConvertibleIssuerPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Solv V2 Convertible Issuer Positions
contract SolvV2ConvertibleIssuerPositionLib is
    ISolvV2ConvertibleIssuerPosition,
    SolvV2ConvertibleIssuerPositionLibBase1,
    SolvV2ConvertibleIssuerPositionDataDecoder,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using Uint256ArrayLib for uint256[];

    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT;

    constructor(address _initialConvertibleOfferingMarket) public {
        INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(
            _initialConvertibleOfferingMarket
        );
    }

    /// @notice Initializes the external position
    /// @dev Nothing to initialize for this contract
    function init(bytes memory) external override {}

    /// @notice Receives and executes a call from the Vault
    /// @param _actionData Encoded data to execute the action
    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        if (actionId == uint256(Actions.CreateOffer)) {
            __actionCreateOffer(actionArgs);
        } else if (actionId == uint256(Actions.Reconcile)) {
            __actionReconcile();
        } else if (actionId == uint256(Actions.Refund)) {
            __actionRefund(actionArgs);
        } else if (actionId == uint256(Actions.RemoveOffer)) {
            __actionRemoveOffer(actionArgs);
        } else if (actionId == uint256(Actions.Withdraw)) {
            __actionWithdraw(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Helper to create an Initial Voucher Offering
    function __actionCreateOffer(bytes memory _actionArgs) private {
        (
            address voucher,
            address currency,
            uint128 min,
            uint128 max,
            uint32 startTime,
            uint32 endTime,
            bool useAllowList,
            ISolvV2InitialConvertibleOfferingMarket.PriceType priceType,
            bytes memory priceData,
            ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameter
        ) = __decodeCreateOfferActionArgs(_actionArgs);

        ERC20(ISolvV2ConvertibleVoucher(voucher).underlying()).safeApprove(
            address(INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT),
            mintParameter.tokenInAmount
        );

        uint24 offerId = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offer(
            voucher,
            currency,
            min,
            max,
            startTime,
            endTime,
            useAllowList,
            priceType,
            priceData,
            mintParameter
        );

        offers.push(Offer({offerId: offerId, currency: currency}));

        emit OfferAdded(offerId, currency);
    }

    /// @dev Helper to reconcile receivable currencies
    function __actionReconcile() private {
        Offer[] memory offersMem = getOffers();

        // Build an array of unique receivableCurrencies from existing offers
        address[] memory receivableCurrencies;
        uint256 offersLength = offersMem.length;
        for (uint256 i; i < offersLength; i++) {
            receivableCurrencies = receivableCurrencies.addUniqueItem(offersMem[i].currency);
        }

        __pushFullAssetBalances(msg.sender, receivableCurrencies);
    }

    /// @dev Helper to refund a voucher slot
    function __actionRefund(bytes memory _actionArgs) private {
        (address voucher, uint256 slotId) = __decodeRefundActionArgs(_actionArgs);
        ISolvV2ConvertiblePool voucherPoolContract = ISolvV2ConvertiblePool(
            ISolvV2ConvertibleVoucher(voucher).convertiblePool()
        );

        ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherPoolContract.getSlotDetail(
            slotId
        );

        ERC20 currencyToken = ERC20(slotDetail.fundCurrency);

        currencyToken.safeApprove(address(voucherPoolContract), type(uint256).max);
        voucherPoolContract.refund(slotId);
        currencyToken.safeApprove(address(voucherPoolContract), 0);
    }

    /// @dev Helper to remove an IVO
    function __actionRemoveOffer(bytes memory _actionArgs) private {
        uint24 offerId = __decodeRemoveOfferActionArgs(_actionArgs);

        // Retrieve underlying token from offerId before removal
        ERC20 underlyingToken = ERC20(
            ISolvV2ConvertibleVoucher(
                INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT
                    .offerings(offerId)
                    .voucher
            )
                .underlying()
        );
        INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.remove(offerId);

        uint256 offersLength = offers.length;

        // Remove the offerId from the offers array
        for (uint256 i; i < offersLength; i++) {
            Offer memory offerMem = offers[i];

            if (offerMem.offerId == offerId) {
                // Reconcile offer currency before it is removed from storage
                ERC20 currencyToken = ERC20(offerMem.currency);
                uint256 currencyBalance = currencyToken.balanceOf(address(this));
                if (currencyBalance > 0) {
                    currencyToken.safeTransfer(msg.sender, currencyBalance);
                }

                // Reconcile underlying before voucher is removed from storage
                uint256 underlyingBalance = underlyingToken.balanceOf(address(this));
                if (underlyingBalance > 0) {
                    underlyingToken.safeTransfer(msg.sender, underlyingBalance);
                }

                // Remove offer from storage
                if (i < offersLength - 1) {
                    offers[i] = offers[offersLength - 1];
                }
                offers.pop();

                emit OfferRemoved(offerId, address(currencyToken));

                break;
            }
        }
    }

    /// @dev Helper to withdraw outstanding assets from an offered voucher
    function __actionWithdraw(bytes memory _actionArgs) private {
        (address voucher, uint256 slotId) = __decodeWithdrawActionArgs(_actionArgs);
        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(voucher);
        ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherContract.getSlotDetail(
            slotId
        );
        ISolvV2ConvertiblePool(voucherContract.convertiblePool()).withdraw(slotId);

        address[] memory assets = new address[](2);
        assets[0] = voucherContract.underlying();
        assets[1] = slotDetail.fundCurrency;

        __pushFullAssetBalances(msg.sender, assets);
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 3 types of assets that contribute value to this position:
    /// 1. Underlying balance oustanding in IVO offers (collateral not yet used for minting)
    /// 2. Unreconciled assets received for an IVO sale
    /// 3. Oustanding assets that are withdrawable from issued vouchers (post-maturity)
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        Offer[] memory offersMem = getOffers();

        // Balance of assets that are withdrawable from issued vouchers (post-maturity)
        (assets_, amounts_) = __getWithdrawableAssetAmounts(offersMem);

        // Underlying balance oustanding in non-closed IVO offers
        (
            address[] memory underlyingAssets,
            uint256[] memory underlyingAmounts
        ) = __getOffersUnderlyingBalance(offersMem);
        uint256 underlyingAssetsLength = underlyingAssets.length;
        for (uint256 i; i < underlyingAssetsLength; i++) {
            assets_ = assets_.addItem(underlyingAssets[i]);
            amounts_ = amounts_.addItem(underlyingAmounts[i]);
        }

        // Balance of currencies that could have been received on IVOs sales
        (
            address[] memory currencies,
            uint256[] memory currencyBalances
        ) = __getReceivableCurrencyBalances(offersMem);

        uint256 currenciesLength = currencies.length;
        for (uint256 i; i < currenciesLength; i++) {
            assets_ = assets_.addItem(currencies[i]);
            amounts_ = amounts_.addItem(currencyBalances[i]);
        }

        return __aggregateAssetAmounts(assets_, amounts_);
    }

    /// @dev Gets the outstanding underlying balances from unsold IVO vouchers on offer
    function __getOffersUnderlyingBalance(Offer[] memory _offers)
        private
        returns (address[] memory underlyings_, uint256[] memory amounts_)
    {
        uint256 offersLength = _offers.length;

        underlyings_ = new address[](offersLength);
        amounts_ = new uint256[](offersLength);

        for (uint256 i; i < offersLength; i++) {

                ISolvV2InitialConvertibleOfferingMarket.Offering memory offering
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(_offers[i].offerId);


                ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameters
             = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.mintParameters(_offers[i].offerId);

            uint256 refundAmount = uint256(offering.units).div(mintParameters.lowestPrice);

            underlyings_[i] = ISolvV2ConvertibleVoucher(
                INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT
                    .offerings(_offers[i].offerId)
                    .voucher
            )
                .underlying();
            amounts_[i] = refundAmount;
        }

        return (underlyings_, amounts_);
    }

    /// @dev Retrieves the receivable (proceeds from IVO sales) currencies balances of the external position
    function __getReceivableCurrencyBalances(Offer[] memory _offers)
        private
        view
        returns (address[] memory currencies_, uint256[] memory balances_)
    {
        uint256 offersLength = _offers.length;

        for (uint256 i; i < offersLength; i++) {
            address currency = _offers[i].currency;
            // Go to next item if currency has already been checked
            if (currencies_.contains(currency)) {
                continue;
            }
            uint256 balance = ERC20(currency).balanceOf(address(this));
            if (balance > 0) {
                currencies_ = currencies_.addItem(currency);
                balances_ = balances_.addItem(balance);
            }
        }

        return (currencies_, balances_);
    }

    /// @dev Retrieves the withdrawable assets by the issuer (post voucher maturity)
    /// @dev Reverts if one of the issued vouchers has not reached maturity
    function __getWithdrawableAssetAmounts(Offer[] memory _offers)
        private
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        uint256 offersLength = _offers.length;

        for (uint256 i; i < offersLength; i++) {
            ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(
                INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(_offers[i].offerId).voucher
            );
            ISolvV2ConvertiblePool voucherPoolContract = ISolvV2ConvertiblePool(
                voucherContract.convertiblePool()
            );

            uint256[] memory slots = voucherPoolContract.getIssuerSlots(address(this));
            uint256 slotsLength = slots.length;

            uint256 withdrawableUnderlying;

            for (uint256 j; j < slotsLength; j++) {
                ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherContract
                    .getSlotDetail(slots[j]);

                // If the vault has issued at least one voucher that has not reached maturity, revert
                require(
                    block.timestamp >= slotDetail.maturity,
                    "__getWithdrawableAssetAmounts: pre-mature issued voucher slot"
                );
                (uint256 withdrawCurrencyAmount, uint256 withdrawTokenAmount) = voucherPoolContract
                    .getWithdrawableAmount(slots[j]);

                if (withdrawCurrencyAmount > 0) {
                    assets_ = assets_.addItem(slotDetail.fundCurrency);
                    amounts_ = amounts_.addItem(withdrawCurrencyAmount);
                }

                if (withdrawTokenAmount > 0) {
                    withdrawableUnderlying = withdrawableUnderlying.add(withdrawTokenAmount);
                }
            }

            if (withdrawableUnderlying > 0) {
                assets_ = assets_.addItem(voucherContract.underlying());
                amounts_ = amounts_.addItem(withdrawableUnderlying);
            }
        }
        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the Offer[] var
    /// @return offers_ The Offer[] var
    function getOffers() public view override returns (Offer[] memory offers_) {
        return offers;
    }
}
