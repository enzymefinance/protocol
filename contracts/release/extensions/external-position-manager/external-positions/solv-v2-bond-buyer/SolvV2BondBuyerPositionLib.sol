// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/token/ERC20/ERC20.sol";
import "openzeppelin-solc-0.6/token/ERC20/SafeERC20.sol";
import "../../../../../persistent/external-positions/solv-v2-bond-buyer/SolvV2BondBuyerPositionLibBase1.sol";
import "../../../../../external-interfaces/ISolvV2BondVoucher.sol";
import "../../../../../external-interfaces/ISolvV2InitialConvertibleOfferingMarket.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../../../../utils/AssetHelpers.sol";
import "../../../../utils/Uint256ArrayLib.sol";
import "./ISolvV2BondBuyerPosition.sol";
import "./SolvV2BondBuyerPositionDataDecoder.sol";

/// @title SolvV2BondBuyerPositionLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Library contract for Solv V2 Bond Buyer positions
contract SolvV2BondBuyerPositionLib is
    ISolvV2BondBuyerPosition,
    SolvV2BondBuyerPositionLibBase1,
    SolvV2BondBuyerPositionDataDecoder,
    AssetHelpers
{
    using AddressArrayLib for address[];
    using SafeERC20 for ERC20;
    using SafeMath for uint256;
    using Uint256ArrayLib for uint256[];

    ISolvV2InitialConvertibleOfferingMarket
        private immutable INITIAL_BOND_OFFERING_MARKET_CONTRACT;

    constructor(address _initialBondOfferingMarket) public {
        INITIAL_BOND_OFFERING_MARKET_CONTRACT = ISolvV2InitialConvertibleOfferingMarket(
            _initialBondOfferingMarket
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
        } else if (actionId == uint256(Actions.Claim)) {
            __actionClaim(actionArgs);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Helper to buy a voucher through an Initial Voucher Offering (IVO)
    function __actionBuyOffering(bytes memory _actionArgs) private {
        (uint24 offerId, uint128 units) = __decodeBuyOfferingActionArgs(_actionArgs);

        ISolvV2InitialConvertibleOfferingMarket.Offering
            memory offering = INITIAL_BOND_OFFERING_MARKET_CONTRACT.offerings(offerId);

        ISolvV2BondVoucher voucherContract = ISolvV2BondVoucher(offering.voucher);
        uint32 nextTokenId = voucherContract.nextTokenId();

        ERC20 currencyToken = ERC20(offering.currency);
        currencyToken.safeApprove(
            address(INITIAL_BOND_OFFERING_MARKET_CONTRACT),
            type(uint256).max
        );

        INITIAL_BOND_OFFERING_MARKET_CONTRACT.buy(offerId, units);

        // Revoke the approval for safety
        currencyToken.safeApprove(address(INITIAL_BOND_OFFERING_MARKET_CONTRACT), 0);

        __addVoucherTokenId(offering.voucher, nextTokenId);
    }

    /// @dev Helper to claim a voucher post-maturity
    function __actionClaim(bytes memory _actionArgs) private {
        (address voucher, uint32 tokenId, uint256 units) = __decodeClaimActionArgs(_actionArgs);

        ISolvV2BondVoucher voucherContract = ISolvV2BondVoucher(voucher);
        uint256 unitsInToken = voucherContract.unitsInToken(tokenId);

        if (units == type(uint256).max || units == unitsInToken) {
            voucherContract.claimTo(tokenId, msg.sender, unitsInToken);

            __removeVoucherTokenId(voucher, tokenId);
        } else {
            voucherContract.claimTo(tokenId, msg.sender, units);
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
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        // Held vouchers
        VoucherTokenId[] memory voucherTokenIds = getVoucherTokenIds();
        uint256 tokenIdsLength = voucherTokenIds.length;
        for (uint256 i; i < tokenIdsLength; i++) {
            VoucherTokenId memory voucherTokenId = voucherTokenIds[i];

            (address[] memory assets, uint256[] memory amounts) = __getClaimableAmounts(
                voucherTokenId.voucher,
                voucherTokenId.tokenId
            );

            for (uint256 j; j < assets.length; j++) {
                assets_ = assets_.addItem(assets[j]);
                amounts_ = amounts_.addItem(amounts[j]);
            }
        }

        return __aggregateAssetAmounts(assets_, amounts_);
    }

    /// @dev Retrieves the claimable assets of the slotId
    /// This will always revert if the external position holds an immature voucher
    /// Pricing logic copied from Solv's claim method: https://github.com/solv-finance/solv-v2-ivo/blob/ac12b7f91a7af67993a0501dc705687801eb3673/vouchers/bond-voucher/contracts/BondPool.sol#L283
    function __getClaimableAmounts(address _voucher, uint32 _tokenId)
        private
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        ISolvV2BondVoucher voucherContract = ISolvV2BondVoucher(_voucher);
        ISolvV2BondPool poolContract = ISolvV2BondPool(voucherContract.bondPool());
        uint256 slotId = voucherContract.voucherSlotMapping(_tokenId);
        uint128 settlePrice = poolContract.getSettlePrice(slotId);

        require(settlePrice > 0, "Price not settled");

        ISolvV2BondPool.SlotDetail memory slotDetail = voucherContract.getSlotDetail(slotId);
        uint256 tokenBalance = voucherContract.unitsInToken(_tokenId);

        uint256 claimCurrencyAmount;
        uint256 claimTokenAmount;

        if (slotDetail.isIssuerRefunded) {
            claimCurrencyAmount = tokenBalance
                .mul(10**uint256(ERC20(slotDetail.fundCurrency).decimals()))
                .div(10**uint256(poolContract.valueDecimals()));

            if (settlePrice > slotDetail.highestPrice) {
                claimTokenAmount = tokenBalance.div(slotDetail.highestPrice).sub(
                    tokenBalance.div(settlePrice)
                );
            }
        } else {
            if (settlePrice < slotDetail.lowestPrice) {
                settlePrice = slotDetail.lowestPrice;
            } else if (settlePrice > slotDetail.highestPrice) {
                settlePrice = slotDetail.highestPrice;
            }
            claimTokenAmount = tokenBalance.div(settlePrice);
        }

        if (claimCurrencyAmount > 0) {
            uint256 reservedCurrencyAmount = poolContract.slotBalances(
                slotId,
                slotDetail.fundCurrency
            );

            if (claimCurrencyAmount > reservedCurrencyAmount) {
                claimCurrencyAmount = reservedCurrencyAmount;
            }

            assets_ = assets_.addItem(slotDetail.fundCurrency);
            amounts_ = amounts_.addItem(claimCurrencyAmount);
        }

        if (claimTokenAmount > 0) {
            uint256 reservedTokenAmount = poolContract.slotBalances(
                slotId,
                voucherContract.underlying()
            );

            if (claimTokenAmount > reservedTokenAmount) {
                claimTokenAmount = reservedTokenAmount;
            }

            assets_ = assets_.addItem(voucherContract.underlying());
            amounts_ = amounts_.addItem(claimTokenAmount);
        }

        return (assets_, amounts_);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

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
