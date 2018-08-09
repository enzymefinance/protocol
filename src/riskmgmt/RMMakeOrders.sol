pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../assets/Asset.sol";
import "./RiskMgmtInterface.sol";

/// @title Risk Management Make Orders Contract
/// @author Melonport AG <team@melonport.com>
contract RMMakeOrders is DSMath, RiskMgmtInterface {

    // FIELDS

    uint public constant RISK_LEVEL = 10 ** uint256(17); // Allows 10 percent deviation from referencePrice; 10 percent is expressed as 0.1 * 10 ** 18

    // PUBLIC VIEW METHODS

    /// @notice Checks if the makeOrder price is within maximum allowed deviation from reference price
    /// @param orderPrice Price of Order
    /// @param referencePrice Reference price obtained through PriceFeed contract
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @return If makeOrder is permitted
    function isMakePermitted(
        uint orderPrice,
        uint referencePrice,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        view
        returns (bool)
    {
        // Makes sure difference between orderPrice and referencePrice is less than or equal to maximum allowed deviation
        if (orderPrice < sub(referencePrice, wmul(RISK_LEVEL, referencePrice))) {
            return false;
        }
        return true;
    }

    /// @notice Checks if the takeOrder price is within maximum allowed deviation from reference price
    /// @param orderPrice Price of Order
    /// @param referencePrice Reference price obtained through PriceFeed contract
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @return If takeOrder is permitted
    function isTakePermitted(
        uint orderPrice,
        uint referencePrice,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        view
        returns (bool)
    {
        // Makes sure difference between orderPrice and referencePrice is less than or equal to maximum allowed deviation
        if (orderPrice < sub(referencePrice, wmul(RISK_LEVEL, referencePrice))) {
            return false;
        }
        return true;
    }
}
