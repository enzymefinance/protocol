pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RMMakeOrders is RiskMgmtInterface {

      // FIELDS

      uint public constant RISK_LEVEL = 200; // Allows 2 percent deviation from referencePrice
      uint public constant RISK_DIVISOR = 10000;

      // PRE, POST, INVARIANT CONDITIONS

      function isLessOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x <= y; }

      // NON-CONSTANT METHODS

      function isMakePermitted(
          uint orderPrice,
          uint referencePrice,
          address sellAsset,
          address buyAsset,
          uint sellQuantity,
          uint buyQuantity
      )
          returns (bool)
      {
          // Don't buy at much higher price
          return true;
      }

      function isTakePermitted(
          uint orderPrice,
          uint referencePrice,
          address sellAsset,
          address buyAsset,
          uint sellQuantity,
          uint buyQuantity
      )
          returns (bool)
      {
          // Don't buy at much higher price
          return true;
      }
}
