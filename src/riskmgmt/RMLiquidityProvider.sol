pragma solidity ^0.4.19;

import './RiskMgmtInterface.sol';

/// @title Risk Management Liquidity Provider Contract
/// @author Melonport AG <team@melonport.com>
contract RMLiquididtyProvider is RiskMgmtInterface {

      // FIELDS

      address public constant LIQUIDITY_PROVIDER = 0x00360d2b7D240Ec0643B6D819ba81A09e40E5bCd;

      // NON-CONSTANT METHODS

      /// @notice All makeOrders disabled
      /// @param orderPrice Price of Order
      /// @param referencePrice Reference price obtained through PriceFeed contract
      /// @param sellAsset Asset (as registered in Asset registrar) to be sold
      /// @param buyAsset Asset (as registered in Asset registrar) to be bought
      /// @param sellQuantity Quantity of sellAsset to be sold
      /// @param buyQuantity Quantity of buyAsset to be bought
      /// @return isPermitted If makeOrder is permitted
      function isMakePermitted(
          uint orderPrice,
          uint referencePrice,
          address sellAsset,
          address buyAsset,
          uint sellQuantity,
          uint buyQuantity
      )
          returns (bool isPermitted)
      {
          return false; // Inital version of risk management does not allow to make orders
      }

      /// @notice takeOrders are checked if the order owner matches liquidity provider
      /// @param orderPrice Price of Order
      /// @param referencePrice Reference price obtained through PriceFeed contract
      /// @param sellAsset Asset (as registered in Asset registrar) to be sold
      /// @param buyAsset Asset (as registered in Asset registrar) to be bought
      /// @param sellQuantity Quantity of sellAsset to be sold
      /// @param buyQuantity Quantity of buyAsset to be bought
      /// @return isPermitted If takeOrder is permitted
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
          returns (bool isPermitted)
      {
          return orderOwner == LIQUIDITY_PROVIDER; // Initial version of risk management restricts trading to liquidity provider
      }
}
