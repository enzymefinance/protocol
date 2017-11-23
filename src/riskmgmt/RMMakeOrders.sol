pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import './RiskMgmtInterface.sol';

/// @title Risk Management Make Orders Contract
/// @author Melonport AG <team@melonport.com>
contract RMMakeOrders is RiskMgmtInterface {

      // FIELDS

      uint public constant RISK_LEVEL = 1000; // Allows 10 percent deviation from referencePrice
      uint public constant RISK_DIVISOR = 10000;

      // PRE, POST, INVARIANT CONDITIONS

      function isLessOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x <= y; }

      // NON-CONSTANT METHODS

      /// @notice Checks if the makeOrder price is within maximum allowed deviation from reference price
      /// @param orderPrice Price of Order
      /// @param referencePrice Reference price obtained through DataFeed contract
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
         // 0.18 <= 0.51 - 12
          // Makes sure orderPrice is less than or equal to maximum allowed deviation from reference price
          if (orderPrice <= referencePrice - RISK_LEVEL * referencePrice / RISK_DIVISOR) {
              return false;
          }
          return true;
      }

      /// @notice Checks if the takeOrder price is within maximum allowed deviation from reference price
      /// @param orderPrice Price of Order
      /// @param referencePrice Reference price obtained through DataFeed contract
      /// @param sellAsset Asset (as registered in Asset registrar) to be sold
      /// @param buyAsset Asset (as registered in Asset registrar) to be bought
      /// @param sellQuantity Quantity of sellAsset to be sold
      /// @param buyQuantity Quantity of buyAsset to be bought
      /// @return isPermitted If takeOrder is permitted
      function isTakePermitted(
          uint orderPrice,
          uint referencePrice,
          address sellAsset,
          address buyAsset,
          uint sellQuantity,
          uint buyQuantity
      )
          returns (bool isPermitted)
      {
          // Makes sure orderPrice is less than or equal to maximum allowed deviation from reference price
          if (orderPrice <= referencePrice - RISK_LEVEL * referencePrice / RISK_DIVISOR) {
              return false;
          }
          return true;
      }
}
