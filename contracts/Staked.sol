pragma solidity ^0.4.11;

import './Fund.sol';

/// @title Fund Staked Contract
/// @author Melonport AG <team@melonport.com>
/// @notice To allow for Melon fund assets to leave the reach of the blockchain
contract Staked is Fund {

    function increaseStake(uint shareQuantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(shareQuantity))
        pre_cond(balancesOfHolderAtLeast(msg.sender, shareQuantity))
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(msg.sender, shareQuantity);
        addShares(this, shareQuantity);
    }

    function decreaseStake(uint shareQuantity)
        external
        pre_cond(isOwner())
        pre_cond(notShutDown())
        pre_cond(isPastZero(shareQuantity))
        pre_cond(balancesOfHolderAtLeast(this, shareQuantity))
        post_cond(prevTotalSupply == totalSupply)
    {
        uint prevTotalSupply = totalSupply;
        subShares(this, shareQuantity);
        addShares(msg.sender, shareQuantity);
    }

    /// @notice Reduce exposure without exchange interaction
    /// @dev After funds have been sent manually back to Melon fund, 'settle' them manually
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    function manualSettlement(address sellAsset, address buyAsset)
        constant
    {
        // TODO TradeEvent
        bytes32 assetPair = sha3(sellAsset, buyAsset);
        if (isFalse(internalAccounting.existsMakeOrder[assetPair])) {
            LogError(0);
            return;
        }

        uint id = internalAccounting.makeOrderId[assetPair];
        Order memory order = orders[id];
        if (proofOfEmbezzlement(order.sellAsset, order.buyAsset)) {
            LogError(1);
            return;
        }
        // TODO: update order.status = OrderStatus.fullyFilled;
        // TODO: Close make order for asset pair sha3(sellAsset, buyAsset)
        // TODO: abstract below into function
        internalAccounting.numberOfMakeOrders--;
        internalAccounting.quantitySentToExchange[order.sellAsset] =
            quantitySentToExchange(order.sellAsset)
            .sub(order.sellQuantity);
        internalAccounting.quantityExpectedToReturn[order.buyAsset] =
            quantityExpectedToReturn(order.buyAsset)
            .sub(order.buyQuantity);
        // Update prev holdings
        internalAccounting.holdingsAtLastManualSettlement[order.sellAsset] = ERC20(order.sellAsset).balanceOf(this);
        internalAccounting.holdingsAtLastManualSettlement[order.buyAsset] = ERC20(order.buyAsset).balanceOf(this);
    }

    /// @notice Whether embezzlement happened
    /// @dev Asset pair corresponds to unsettled (== make) order
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    /// @return True if embezzled otherwise false
    function proofOfEmbezzlement(address sellAsset, address buyAsset)
        constant
        returns (bool)
    {
        // Accounted for sell quanity is less than what is held in custody (good)
        uint factor = MELON_IN_BASE_UNITS; // Want to receive proportionally as much as sold
        uint divisor = factor; // To reduce inaccuracy due to rounding errors
        if (isLessThan(
            internalAccounting.holdingsAtLastManualSettlement[sellAsset].sub(quantitySentToExchange(sellAsset)), // Accounted for
            ERC20(sellAsset).balanceOf(this) // Actual quantity held in fund
        )) { // Sold less than intended
            factor = divisor
                .mul(internalAccounting.holdingsAtLastManualSettlement[sellAsset].sub(ERC20(sellAsset).balanceOf(this)))
                .div(quantitySentToExchange(sellAsset));
        } else { // Held in custody is less than accounted for (PoE)
            // TODO: Allocate staked shares from this to msg.sender
            // TODO: error log
            isShutDown = true;
            return true;
        }

        // Revise return expectations, for example in case of partial fill of order
        uint revisedReturnExpectations = quantityExpectedToReturn(buyAsset).mul(factor).div(divisor);

        // Held in custody is more than revised return expectations of buy asset (good)
        if (isLargerThan(
            internalAccounting.holdingsAtLastManualSettlement[buyAsset].add(revisedReturnExpectations), // Expected qty bought
            ERC20(buyAsset).balanceOf(this) // Actual quantity held in fund
        )) {
            return false;
        } else { // Held in custody is less than accounted for (PoE)
            // TODO: Allocate staked shares from this to msg.sender
            // TODO: error log
            isShutDown = true;
            return true;
        }
    }
}
