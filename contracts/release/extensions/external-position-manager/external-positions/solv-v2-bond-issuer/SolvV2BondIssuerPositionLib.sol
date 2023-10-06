// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {ERC20} from "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import {ISolvV2BondPool} from "../../../../../external-interfaces/ISolvV2BondPool.sol";
import {ISolvV2BondVoucher} from "../../../../../external-interfaces/ISolvV2BondVoucher.sol";
import {ISolvV2InitialConvertibleOfferingMarket} from
    "../../../../../external-interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {AssetHelpers} from "../../../../../utils/0.6.12/AssetHelpers.sol";
import {Uint256ArrayLib} from "../../../../../utils/0.6.12/Uint256ArrayLib.sol";
import {SolvV2BondIssuerPositionLibBase1} from "./bases/SolvV2BondIssuerPositionLibBase1.sol";
import {ISolvV2BondIssuerPosition} from "./ISolvV2BondIssuerPosition.sol";
import {SolvV2BondIssuerPositionDataDecoder} from "./SolvV2BondIssuerPositionDataDecoder.sol";

/// @title SolvV2BondIssuerPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Solv V2 Bond Issuer Positions
contract SolvV2BondIssuerPositionLib is
    ISolvV2BondIssuerPosition,
    SolvV2BondIssuerPositionLibBase1,
    SolvV2BondIssuerPositionDataDecoder,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using Uint256ArrayLib for uint256[];

    ISolvV2InitialConvertibleOfferingMarket private immutable INITIAL_BOND_OFFERING_MARKET_CONTRACT;

    constructor(address _initialBondOfferingMarket) public {
        INITIAL_BOND_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(_initialBondOfferingMarket);
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

        ERC20(ISolvV2BondVoucher(voucher).underlying()).safeApprove(
            address(INITIAL_BOND_OFFERING_MARKET_CONTRACT), mintParameter.tokenInAmount
        );

        uint24 offerId = INITIAL_BOND_OFFERING_MARKET_CONTRACT.offer(
            voucher, currency, min, max, startTime, endTime, useAllowList, priceType, priceData, mintParameter
        );

        if (!issuedVouchers.storageArrayContains(voucher)) {
            issuedVouchers.push(voucher);
            emit IssuedVoucherAdded(voucher);
        }

        offers.push(offerId);
        emit OfferAdded(offerId);
    }

    /// @dev Helper to reconcile receivable currencies
    function __actionReconcile() private {
        uint24[] memory offersMem = getOffers();

        // Build an array of unique receivableCurrencies from created offers
        address[] memory receivableCurrencies;
        uint256 offersLength = offersMem.length;
        for (uint256 i; i < offersLength; i++) {
            receivableCurrencies = receivableCurrencies.addUniqueItem(
                INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offersMem[i]).currency
            );
        }

        __pushFullAssetBalances(msg.sender, receivableCurrencies);
    }

    /// @dev Helper to refund a voucher slot
    function __actionRefund(bytes memory _actionArgs) private {
        (address voucher, uint256 slotId) = __decodeRefundActionArgs(_actionArgs);
        ISolvV2BondPool voucherPoolContract = ISolvV2BondPool(ISolvV2BondVoucher(voucher).bondPool());

        ISolvV2BondPool.SlotDetail memory slotDetail = voucherPoolContract.getSlotDetail(slotId);

        ERC20 currencyToken = ERC20(slotDetail.fundCurrency);

        currencyToken.safeApprove(address(voucherPoolContract), type(uint256).max);
        voucherPoolContract.refund(slotId);
        currencyToken.safeApprove(address(voucherPoolContract), 0);
    }

    /// @dev Helper to remove an IVO
    function __actionRemoveOffer(bytes memory _actionArgs) private {
        uint24 offerId = __decodeRemoveOfferActionArgs(_actionArgs);

        // Retrieve offer details before removal

        ISolvV2InitialConvertibleOfferingMarket.Offering memory offer =
            INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offerId);

        ERC20 currencyToken = ERC20(offer.currency);
        ERC20 underlyingToken = ERC20(ISolvV2BondVoucher(offer.voucher).underlying());

        INITIAL_BOND_OFFERING_MARKET_CONTRACT.remove(offerId);

        uint256 offersLength = offers.length;

        // Remove the offerId from the offers array
        for (uint256 i; i < offersLength; i++) {
            if (offers[i] == offerId) {
                // Reconcile offer currency before it is removed from storage
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

                emit OfferRemoved(offerId);

                break;
            }
        }
    }

    /// @dev Helper to withdraw outstanding underlying from a post-maturity issued voucher
    function __actionWithdraw(bytes memory _actionArgs) private {
        (address voucher, uint256 slotId) = __decodeWithdrawActionArgs(_actionArgs);

        ISolvV2BondVoucher voucherContract = ISolvV2BondVoucher(voucher);
        ISolvV2BondPool(voucherContract.bondPool()).withdraw(slotId);

        ERC20 underlyingToken = ERC20(voucherContract.underlying());
        uint256 underlyingBalance = underlyingToken.balanceOf(address(this));

        if (underlyingBalance > 0) {
            underlyingToken.safeTransfer(msg.sender, underlyingBalance);
        }
    }

    ////////////////////
    // POSITION VALUE //
    ////////////////////

    /// @notice Retrieves the debt assets (negative value) of the external position
    /// @return assets_ Debt assets
    /// @return amounts_ Debt asset amounts
    function getDebtAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        return (assets_, amounts_);
    }

    /// @notice Retrieves the managed assets (positive value) of the external position
    /// @return assets_ Managed assets
    /// @return amounts_ Managed asset amounts
    /// @dev There are 3 types of assets that contribute value to this position:
    /// 1. Underlying balance outstanding in IVO offers (collateral not yet used for minting)
    /// 2. Unreconciled assets received for an IVO sale
    /// 3. Outstanding assets that are withdrawable from issued vouchers (post-maturity)
    function getManagedAssets() external override returns (address[] memory assets_, uint256[] memory amounts_) {
        uint24[] memory offersMem = getOffers();

        // Balance of assets that are withdrawable from issued vouchers (post-maturity)
        (assets_, amounts_) = __getWithdrawableAssetAmountsAndRemoveWithdrawnVouchers();

        // Underlying balance outstanding in non-closed IVO offers
        (address[] memory underlyingAssets, uint256[] memory underlyingAmounts) =
            __getOffersUnderlyingBalance(offersMem);
        uint256 underlyingAssetsLength = underlyingAssets.length;
        for (uint256 i; i < underlyingAssetsLength; i++) {
            assets_ = assets_.addItem(underlyingAssets[i]);
            amounts_ = amounts_.addItem(underlyingAmounts[i]);
        }

        // Balance of currencies that could have been received on IVOs sales
        (address[] memory currencies, uint256[] memory currencyBalances) = __getReceivableCurrencyBalances(offersMem);

        uint256 currenciesLength = currencies.length;
        for (uint256 i; i < currenciesLength; i++) {
            assets_ = assets_.addItem(currencies[i]);
            amounts_ = amounts_.addItem(currencyBalances[i]);
        }

        return __aggregateAssetAmounts(assets_, amounts_);
    }

    /// @dev Gets the outstanding underlying balances from unsold IVO vouchers on offer
    function __getOffersUnderlyingBalance(uint24[] memory _offers)
        private
        view
        returns (address[] memory underlyings_, uint256[] memory amounts_)
    {
        uint256 offersLength = _offers.length;

        underlyings_ = new address[](offersLength);
        amounts_ = new uint256[](offersLength);

        for (uint256 i; i < offersLength; i++) {
            ISolvV2InitialConvertibleOfferingMarket.Offering memory offering =
                INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(_offers[i]);

            ISolvV2InitialConvertibleOfferingMarket.MintParameter memory mintParameters =
                INITIAL_BOND_OFFERING_MARKET_CONTRACT.mintParameters(_offers[i]);

            uint256 refundAmount = uint256(offering.units).div(mintParameters.lowestPrice);

            underlyings_[i] = ISolvV2BondVoucher(offering.voucher).underlying();
            amounts_[i] = refundAmount;
        }

        return (underlyings_, amounts_);
    }

    /// @dev Retrieves the receivable (proceeds from IVO sales) currencies balances of the external position
    function __getReceivableCurrencyBalances(uint24[] memory _offers)
        private
        view
        returns (address[] memory currencies_, uint256[] memory balances_)
    {
        uint256 offersLength = _offers.length;

        for (uint256 i; i < offersLength; i++) {
            address currency = INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(_offers[i]).currency;
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
    /// Reverts if one of the issued voucher slots has not reached maturity
    /// Removes stored issued vouchers that have been fully withdrawn
    function __getWithdrawableAssetAmountsAndRemoveWithdrawnVouchers()
        private
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        address[] memory vouchersMem = getIssuedVouchers();
        uint256 vouchersLength = vouchersMem.length;

        for (uint256 i; i < vouchersLength; i++) {
            uint256 preAssetsLength = assets_.length;

            ISolvV2BondPool voucherPoolContract = ISolvV2BondPool(ISolvV2BondVoucher(vouchersMem[i]).bondPool());
            uint256[] memory slots = voucherPoolContract.getIssuerSlots(address(this));

            uint256 withdrawableUnderlying;

            for (uint256 j; j < slots.length; j++) {
                ISolvV2BondPool.SlotDetail memory slotDetail =
                    ISolvV2BondVoucher(vouchersMem[i]).getSlotDetail(slots[j]);

                // If the vault has issued at least one voucher that has not reached maturity, revert
                require(
                    block.timestamp >= slotDetail.maturity,
                    "__getWithdrawableAssetAmountsAndRemoveWithdrawnVouchers: pre-mature issued voucher slot"
                );
                uint256 withdrawTokenAmount = voucherPoolContract.getWithdrawableAmount(slots[j]);

                if (withdrawTokenAmount > 0) {
                    withdrawableUnderlying = withdrawableUnderlying.add(withdrawTokenAmount);
                }
            }

            if (withdrawableUnderlying > 0) {
                assets_ = assets_.addItem(ISolvV2BondVoucher(vouchersMem[i]).underlying());
                amounts_ = amounts_.addItem(withdrawableUnderlying);
            }

            // If assets length is the same as before iterating through the issued slots.
            // All issued slots are withdrawn and the voucher can be removed from storage.
            if (assets_.length == preAssetsLength) {
                // Remove the voucher from the vouchers array
                issuedVouchers.removeStorageItem(vouchersMem[i]);

                emit IssuedVoucherRemoved(vouchersMem[i]);
            }
        }
        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the issued vouchers
    /// @return vouchers_ The array of issued voucher addresses
    function getIssuedVouchers() public view returns (address[] memory vouchers_) {
        return issuedVouchers;
    }

    /// @notice Gets the created offers
    /// @return offers_ The array of created offer ids
    function getOffers() public view override returns (uint24[] memory offers_) {
        return offers;
    }
}
