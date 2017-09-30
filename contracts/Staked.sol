pragma solidity ^0.4.11;

import './Fund.sol';

/// @title Fund Staked Contract
/// @author Melonport AG <team@melonport.com>
/// @notice To allow for Melon fund assets to leave the reach of the blockchain
contract Staked is Fund {

    struct InternalAccounting {
        uint numberOfMakeOrders; // Number of potentially unsettled orders
        mapping (bytes32 => bool) existsMakeOrder; // sha3(sellAsset, buyAsset) to boolean
        mapping (bytes32 => uint) makeOrderId; // sha3(sellAsset, buyAsset) to order id
        mapping (address => uint) quantitySentToExchange; // Quantity of asset held in custody of exchange
        mapping (address => uint) quantityExpectedToReturn; // Quantity expected to receive of asset of what has been sent to exchange
        mapping (address => uint) holdingsAtLastManualSettlement; // Quantity of asset held in custody of fund at time of manuel settlement
    }

    InternalAccounting internalAccounting; // Accounts for assets not held in custody of fund

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
    /// @dev After funds have been sent back to Melon fund, 'settle' them internally
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    function manualSettlement(address sellAsset, address buyAsset)
        returns (bool, string)
    {
        bytes32 assetPair = sha3(sellAsset, buyAsset);

        returnError(
            isFalse(internalAccounting.existsMakeOrder[assetPair]),
            "ERR: Make order for input asset pair not found"
        );

        uint id = internalAccounting.makeOrderId[assetPair];
        Order memory order = orders[id];
        var (error, ) = proofOfEmbezzlement(order.sellAsset, order.buyAsset);

        returnError(
            isFalse(error),
            "ERR: Embezzlement has been determined"
        );

        // TODO: update order.status = OrderStatus.fullyFilled;
        // TODO: abstract below into function
        internalAccounting.existsMakeOrder[assetPair] = false;
        internalAccounting.quantitySentToExchange[order.sellAsset] = 0;
        internalAccounting.quantityExpectedToReturn[order.buyAsset] = 0;
        // Update prev holdings
        internalAccounting.holdingsAtLastManualSettlement[order.sellAsset] = ERC20(order.sellAsset).balanceOf(this);
        internalAccounting.holdingsAtLastManualSettlement[order.buyAsset] = ERC20(order.buyAsset).balanceOf(this);
    }

    function quantitySentToExchange(address ofAsset) constant returns (uint) { return internalAccounting.quantitySentToExchange[ofAsset]; }
    function quantityExpectedToReturn(address ofAsset) constant returns (uint) { return internalAccounting.quantityExpectedToReturn[ofAsset]; }

    /// @notice Whether embezzlement happened
    /// @dev Asset pair corresponds to unsettled (== make) order
    /// @param sellAsset Asset (as registred in Asset registrar) to be sold
    /// @param buyAsset Asset (as registred in Asset registrar) to be bought
    /// @return True if embezzled otherwise false
    function proofOfEmbezzlement(address sellAsset, address buyAsset)
        returns (bool, string)
    {
        returnCriticalError(
            (
                ERC20(sellAsset).balanceOf(this) <=
                internalAccounting.holdingsAtLastManualSettlement[sellAsset]
                    .sub(quantitySentToExchange(sellAsset))
            ), // TODO: Allocate staked shares from this to msg.sender
            "CRITICAL ERR: Sold more than expected!"
        );

        // What is held in custody is less or equal than accounted for sell quantity (good)
        uint factor = MELON_IN_BASE_UNITS; // Want to receive proportionally as much as sold
        uint divisor = factor; // To reduce inaccuracy due to rounding errors
        factor = divisor
            .mul(internalAccounting.holdingsAtLastManualSettlement[sellAsset].sub(ERC20(sellAsset).balanceOf(this)))
            .div(quantitySentToExchange(sellAsset));
        // Revise return expectations, for example in case of partial fill of order
        uint revisedReturnExpectations = quantityExpectedToReturn(buyAsset).mul(factor).div(divisor);

        returnCriticalError(
            (
                ERC20(buyAsset).balanceOf(this) >=
                internalAccounting.holdingsAtLastManualSettlement[buyAsset]
                    .add(revisedReturnExpectations)
            ), // TODO: Allocate staked shares from this to msg.sender
            "CRITICAL ERR: Received (proportionally) less than expected buy quantity!"
        );

        return (false, "");
    }
}
