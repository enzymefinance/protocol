pragma solidity ^0.4.21;

import "./RiskMgmtInterface.sol";

/// @title Risk Management Liquidity Provider Contract
/// @author Melonport AG <team@melonport.com>
contract RMLiquididtyProvider is RiskMgmtInterface {

    // FIELDS

    address public constant LIQUIDITY_PROVIDER = 0x00360d2b7D240Ec0643B6D819ba81A09e40E5bCd;

    // PUBLIC VIEW METHODS

    /// @notice All makeOrders disabled
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
        return false; // Inital version of risk management does not allow to make orders
    }

    /// @notice takeOrders are checked if the order owner matches liquidity provider
    /// @param orderPrice Price of Order
    /// @param referencePrice Reference price obtained through PriceFeed contract
    /// @param orderQuantity Size of the order
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @param orderOwner Address that created the order
    /// @return If takeOrder is permitted
    function isTakePermitted(
        uint orderPrice,
        uint referencePrice,
        uint orderQuantity,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity,
        address orderOwner
    )
        view
        returns (bool)
    {
        return orderOwner == LIQUIDITY_PROVIDER; // Initial version of risk management restricts trading to liquidity provider
    }
}
