pragma solidity ^0.4.21;

/// @title Risk Management Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying RiskMgmt Contract
/* Remark: Checks for:
 *  1) Liquidity: All positions have to be fairly simple to liquidate.
 *    E.g. Cap at percentage of 30 day average trading volume of this pair
 *  2) Market Impact: If w/in above liquidity restrictions, trade size also
 *    restricted to have market impact below certain threshold
 *  3) Best execution: Ensure the best execution possible for Melon fund
 *    investors' orders.
 */
interface RiskMgmtInterface {

    // METHODS
    // PUBLIC VIEW METHODS

    /// @notice Checks if the makeOrder price is reasonable and not manipulative
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
    ) view returns (bool);

    /// @notice Checks if the takeOrder price is reasonable and not manipulative
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
    ) view returns (bool);
}
