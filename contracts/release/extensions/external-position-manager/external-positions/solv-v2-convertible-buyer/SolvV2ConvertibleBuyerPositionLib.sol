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
import "../../../../../persistent/external-positions/solv-v2-convertible-buyer/SolvV2ConvertibleBuyerPositionLibBase1.sol";
import "../../../../interfaces/ISolvV2ConvertibleMarket.sol";
import "../../../../interfaces/ISolvV2ConvertibleVoucher.sol";
import "../../../../interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "../../../../utils/Uint256ArrayLib.sol";
import "./ISolvV2ConvertibleBuyerPosition.sol";
import "./SolvV2ConvertibleBuyerPositionDataDecoder.sol";

/// @title SolvV2ConvertibleBuyerPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Solv V2 Convertible Buyer positions
contract SolvV2ConvertibleBuyerPositionLib is
    ISolvV2ConvertibleBuyerPosition,
    SolvV2ConvertibleBuyerPositionLibBase1,
    SolvV2ConvertibleBuyerPositionDataDecoder,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using Uint256ArrayLib for uint256[];

    ISolvV2ConvertibleMarket private immutable CONVERTIBLE_MARKET_CONTRACT;
    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT;

    constructor(address _convertibleMarketcontract, address _initialConvertibleOfferingMarket)
        public
    {
        CONVERTIBLE_MARKET_CONTRACT = ISolvV2ConvertibleMarket(_convertibleMarketcontract);
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

        if (actionId == uint256(Actions.BuyOffering)) {
            __actionBuyOffering(actionArgs);
        } else if (actionId == uint256(Actions.BuySaleByAmount)) {
            __actionBuySaleByAmount(actionArgs);
        } else if (actionId == uint256(Actions.BuySaleByUnits)) {
            __actionBuySaleByUnits(actionArgs);
        } else if (actionId == uint256(Actions.Claim)) {
            __actionClaim(actionArgs);
        } else if (actionId == uint256(Actions.CreateSaleDecliningPrice)) {
            __actionCreateSaleDecliningPrice(actionArgs);
        } else if (actionId == uint256(Actions.CreateSaleFixedPrice)) {
            __actionCreateSaleFixedPrice(actionArgs);
        } else if (actionId == uint256(Actions.Reconcile)) {
            __actionReconcile();
        } else if (actionId == uint256(Actions.RemoveSale)) {
            __actionRemoveSale(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Helper to buy a voucher through an Initial Voucher Offering (IVO)
    function __actionBuyOffering(bytes memory _actionArgs) private {
        (uint24 offerId, uint128 units) = __decodeBuyOfferingActionArgs(_actionArgs);

        ISolvV2InitialConvertibleOfferingMarket.Offering
            memory offering = INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.offerings(offerId);

        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(offering.voucher);
        uint32 nextTokenId = voucherContract.nextTokenId();

        ERC20 currencyToken = ERC20(offering.currency);
        currencyToken.safeApprove(
            address(INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT),
            type(uint256).max
        );

        INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT.buy(offerId, units);

        // Revoke the approval for safety
        currencyToken.safeApprove(address(INITIAL_CONVERTIBLE_OFFERING_MARKET_CONTRACT), 0);

        __addVoucherTokenId(offering.voucher, nextTokenId);
    }

    /// @dev Helper to buy a voucher through the marketplace for a specified amount of currency
    function __actionBuySaleByAmount(bytes memory _actionArgs) private {
        (uint24 saleId, uint256 amount) = __decodeBuySaleByAmountActionArgs(_actionArgs);

        ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

        ERC20(sale.currency).safeApprove(address(CONVERTIBLE_MARKET_CONTRACT), amount);

        CONVERTIBLE_MARKET_CONTRACT.buyByAmount(saleId, amount);

        __postBuySale(sale.voucher, sale.tokenId);
    }

    /// @dev Helper to buy specified voucher units through the marketplace
    function __actionBuySaleByUnits(bytes memory _actionArgs) private {
        (uint24 saleId, uint128 units) = __decodeBuySaleByUnitsActionArgs(_actionArgs);

        ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

        ERC20(sale.currency).safeApprove(address(CONVERTIBLE_MARKET_CONTRACT), type(uint256).max);

        CONVERTIBLE_MARKET_CONTRACT.buyByUnits(saleId, units);

        ERC20(sale.currency).safeApprove(address(CONVERTIBLE_MARKET_CONTRACT), 0);

        __postBuySale(sale.voucher, sale.tokenId);
    }

    /// @dev Helper to claim a voucher post-maturity
    function __actionClaim(bytes memory _actionArgs) private {
        (address voucher, uint32 tokenId, uint256 units) = __decodeClaimActionArgs(_actionArgs);

        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(voucher);
        uint256 unitsInToken = voucherContract.unitsInToken(tokenId);

        if (units == type(uint256).max || units == unitsInToken) {
            voucherContract.claimTo(tokenId, msg.sender, unitsInToken);

            __removeVoucherTokenId(voucher, tokenId);
        } else {
            voucherContract.claimTo(tokenId, msg.sender, units);
        }
    }

    /// @dev Helper to create a declining price marketplace sale
    function __actionCreateSaleDecliningPrice(bytes memory _actionArgs) private {
        (
            address voucher,
            uint24 tokenId,
            address currency,
            uint128 min,
            uint128 max,
            uint32 startTime,
            bool useAllowList,
            uint128 highest,
            uint128 lowest,
            uint32 duration,
            uint32 interval
        ) = __decodeCreateSaleDecliningPriceActionArgs(_actionArgs);

        __preCreateSale(tokenId, voucher);

        uint24 saleId = CONVERTIBLE_MARKET_CONTRACT.publishDecliningPrice(
            voucher,
            tokenId,
            currency,
            min,
            max,
            startTime,
            useAllowList,
            highest,
            lowest,
            duration,
            interval
        );

        __postCreateSale(saleId, currency, voucher, tokenId);
    }

    /// @dev Helper to create a fixed price marketplace sale
    function __actionCreateSaleFixedPrice(bytes memory _actionArgs) private {
        (
            address voucher,
            uint24 tokenId,
            address currency,
            uint128 min,
            uint128 max,
            uint32 startTime,
            bool useAllowList,
            uint128 price
        ) = __decodeCreateSaleFixedPriceActionArgs(_actionArgs);

        __preCreateSale(tokenId, voucher);

        uint24 saleId = CONVERTIBLE_MARKET_CONTRACT.publishFixedPrice(
            voucher,
            tokenId,
            currency,
            min,
            max,
            startTime,
            useAllowList,
            price
        );

        __postCreateSale(saleId, currency, voucher, tokenId);
    }

    /// @dev Helper to reconcile marketplace sale proceeds
    function __actionReconcile() private {
        Sale[] memory sales = getSales();

        // Build an array of unique receivableCurrencies from existing sales
        address[] memory receivableCurrencies;
        uint256 salesLength = sales.length;
        for (uint256 i; i < salesLength; i++) {
            receivableCurrencies = receivableCurrencies.addUniqueItem(sales[i].currency);
        }

        __pushFullAssetBalances(msg.sender, receivableCurrencies);
    }

    /// @dev Helper to remove a marketplace sale
    function __actionRemoveSale(bytes memory _actionArgs) private {
        uint24 saleId = __decodeRemoveSaleActionArgs(_actionArgs);

        ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(saleId);

        // isValid indicates that the order has not been completely filled
        if (sale.isValid) {
            CONVERTIBLE_MARKET_CONTRACT.remove(saleId);
            // Add unsold voucher units sent back to the External Position
            __addVoucherTokenId(sale.voucher, sale.tokenId);
        }

        uint256 salesLength = sales.length;
        for (uint256 i; i < salesLength; i++) {
            if (sales[i].saleId == saleId) {
                // Reconcile sale currency before it is removed from storage
                address saleCurrency = sales[i].currency;

                ERC20 currencyContract = ERC20(sales[i].currency);
                uint256 balance = currencyContract.balanceOf(address(this));
                if (balance > 0) {
                    currencyContract.safeTransfer(msg.sender, balance);
                }

                if (i < salesLength - 1) {
                    sales[i] = sales[salesLength - 1];
                }
                sales.pop();
                emit SaleRemoved(saleId, saleCurrency);
                break;
            }
        }
    }

    /// @dev Helper to add a VoucherTokenId to storage and emit the Added event
    function __addVoucherTokenId(address _voucher, uint32 _tokenId) private {
        voucherTokenIds.push(VoucherTokenId({tokenId: _tokenId, voucher: _voucher}));
        emit VoucherTokenIdAdded(_voucher, _tokenId);
    }

    /// @dev Helper to remove a VoucherTokenId from storage and emit the Removed event
    function __removeVoucherTokenId(address _voucher, uint32 _tokenId) private {
        uint256 voucherTokenIdsLength = voucherTokenIds.length;
        for (uint256 i; i < voucherTokenIdsLength; i++) {
            VoucherTokenId memory voucherTokenId = voucherTokenIds[i];
            if (voucherTokenId.tokenId == _tokenId && voucherTokenId.voucher == _voucher) {
                if (i < voucherTokenIdsLength - 1) {
                    voucherTokenIds[i] = voucherTokenIds[voucherTokenIdsLength - 1];
                }
                voucherTokenIds.pop();
                emit VoucherTokenIdRemoved(_voucher, _tokenId);
                break;
            }
        }
    }

    /// @dev Helper for common logic to run after both buy sale actions
    /// @param _voucher Address of the voucher sold
    /// @param _saleTokenId ID of the token of the sale
    function __postBuySale(address _voucher, uint32 _saleTokenId) private {
        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(_voucher);

        // If sale voucher token is bought in full, no new tokenId is created
        if (voucherContract.ownerOf(_saleTokenId) == address(this)) {
            __addVoucherTokenId(_voucher, _saleTokenId);
        } else {
            // The bought tokenId is the "last token id" = nextTokenId - 1
            uint32 tokenId = voucherContract.nextTokenId() - 1;
            __addVoucherTokenId(_voucher, tokenId);
        }
    }

    /// @dev Helper for common logic to run after both create sale actions
    function __postCreateSale(
        uint24 _saleId,
        address _currency,
        address _voucher,
        uint24 _tokenId
    ) private {
        __removeVoucherTokenId(_voucher, _tokenId);

        sales.push(Sale({saleId: _saleId, currency: _currency}));

        emit SaleAdded(_saleId, _currency);
    }

    /// @dev Helper for common logic to run before both create sale actions
    /// @param _tokenId ID of the token sold
    /// @param _voucher Address of the voucher sold
    function __preCreateSale(uint24 _tokenId, address _voucher) private {
        ISolvV2ConvertibleVoucher(_voucher).approve(
            address(CONVERTIBLE_MARKET_CONTRACT),
            _tokenId
        );
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
    /// 1. Held vouchers
    /// 2. Owned vouchers that are for sale on the marketplace
    /// 3. Unreconciled assets received from a sale on the marketplace
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        // Held vouchers
        VoucherTokenId[] memory voucherTokenIds = getVoucherTokenIds();
        uint256 tokenIdsLength = voucherTokenIds.length;
        assets_ = new address[](tokenIdsLength);
        amounts_ = new uint256[](tokenIdsLength);
        for (uint256 i; i < tokenIdsLength; i++) {
            VoucherTokenId memory voucherTokenId = voucherTokenIds[i];

            (address claimableAsset, uint256 claimableAmount) = __getClaimableAmount(
                voucherTokenId.voucher,
                voucherTokenId.tokenId
            );

            assets_[i] = claimableAsset;
            amounts_[i] = claimableAmount;
        }

        // Active sales
        uint256 salesLength = sales.length;
        for (uint256 i; i < salesLength; i++) {
            ISolvV2ConvertibleMarket.Sale memory sale = CONVERTIBLE_MARKET_CONTRACT.sales(
                sales[i].saleId
            );

            // If sale has been filled, we can skip it (it has no value)
            if (!sale.isValid) {
                continue;
            }

            (address claimableAsset, uint256 claimableAmount) = __getClaimableAmount(
                sale.voucher,
                sale.tokenId
            );

            if (claimableAmount > 0) {
                assets_ = assets_.addItem(claimableAsset);
                amounts_ = amounts_.addItem(claimableAmount);
            }
        }

        // Unreconciled assets received from sales
        address[] memory receivableCurrencies;
        for (uint256 i; i < salesLength; i++) {
            address currency = sales[i].currency;
            // Go to next item if currency has already been checked
            if (receivableCurrencies.contains(currency)) {
                continue;
            }
            // Add receivable currency to array so it does not get counted twice
            receivableCurrencies = receivableCurrencies.addItem(currency);

            uint256 balance = ERC20(currency).balanceOf(address(this));

            if (balance > 0) {
                assets_ = assets_.addItem(currency);
                amounts_ = amounts_.addItem(balance);
            }
        }

        return __aggregateAssetAmounts(assets_, amounts_);
    }

    /// @dev Retrieves the claimable asset of the slotId
    /// This will always revert if the external position holds an immature voucher
    /// Pricing logic copied from Solv's claim method: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/convertible-voucher/contracts/ConvertiblePool.sol#L318
    function __getClaimableAmount(address _voucher, uint32 _tokenId)
        private
        returns (address asset_, uint256 amount_)
    {
        ISolvV2ConvertibleVoucher voucherContract = ISolvV2ConvertibleVoucher(_voucher);
        ISolvV2ConvertiblePool poolContract = ISolvV2ConvertiblePool(
            voucherContract.convertiblePool()
        );
        uint256 slotId = voucherContract.voucherSlotMapping(_tokenId);
        uint128 settlePrice = poolContract.getSettlePrice(slotId);

        require(settlePrice > 0, "Price not settled");

        ISolvV2ConvertiblePool.SlotDetail memory slotDetail = voucherContract.getSlotDetail(
            slotId
        );
        uint256 tokenBalance = voucherContract.unitsInToken(_tokenId);
        // If settlement price is below highestPrice and slot has been refunded, claimable in currency
        if (settlePrice <= slotDetail.highestPrice && slotDetail.isIssuerRefunded) {
            uint256 reservedCurrencyAmount = poolContract.slotBalances(
                slotId,
                slotDetail.fundCurrency
            );

            asset_ = slotDetail.fundCurrency;

            amount_ = tokenBalance.mul(10**uint256(ERC20(slotDetail.fundCurrency).decimals())).div(
                    10**uint256(poolContract.valueDecimals())
                );

            if (amount_ > reservedCurrencyAmount) {
                amount_ = reservedCurrencyAmount;
            }

            return (asset_, amount_);
        }
        // If settlement price is above highestPrice or slot has not been refunded, claimable in underlying
        if (settlePrice < slotDetail.lowestPrice) {
            settlePrice = slotDetail.lowestPrice;
        } else if (settlePrice > slotDetail.highestPrice) {
            settlePrice = slotDetail.highestPrice;
        }

        asset_ = voucherContract.underlying();
        uint256 reservedTokenAmount = poolContract.slotBalances(slotId, asset_);
        amount_ = tokenBalance.div(settlePrice);

        if (amount_ > reservedTokenAmount) {
            amount_ = reservedTokenAmount;
        }

        return (asset_, amount_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the Sale[] var
    /// @return sales_ The Sale[] var
    function getSales() public view override returns (Sale[] memory sales_) {
        return sales;
    }

    /// @notice Gets the VoucherTokenId[] var
    /// @return voucherTokenIds_ The VoucherTokenId[] var
    function getVoucherTokenIds() public view returns (VoucherTokenId[] memory voucherTokenIds_) {
        return voucherTokenIds;
    }

    //////////
    // MISC //
    //////////

    /// @notice Handles the receipt of a VNFT token type.
    /// @return selector_ `b382cdcd  = onVNFTReceived(address,address,uint256,uint256,bytes)`
    /// @dev ERC-3525 spec: https://eips.ethereum.org/EIPS/eip-3525#erc-3525-token-receiver
    /// @dev Implementation for vouchers: https://github.com/solv-finance/solv-v2-ivo/blob/main/vouchers/vnft-core/contracts/VNFTCoreV2.sol#L318
    function onVNFTReceived(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public pure returns (bytes4 selector_) {
        return bytes4(keccak256("onVNFTReceived(address,address,uint256,uint256,bytes)"));
    }
}
