pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import '../libraries/safeMath.sol';
import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RMMakeOrders is RiskMgmtInterface {
      using safeMath for uint256;

      // FIELDS

      uint public constant RISK_LEVEL = 200; // Allows 2 percent deviation from referencePrice
      uint public constant RISK_DIVISOR = 10000;

      // PRE, POST, INVARIANT CONDITIONS

      function isLessOrEqualThan(uint256 x, uint256 y) internal returns (bool) { return x <= y; }

      // NON-CONSTANT METHODS

      function isExchangeMakePermitted(
          uint orderPrice,
          uint orderQuantity,
          uint referencePrice
      )
          constant
          returns (bool)
      {
          // Don't buy at much higher price
          return true;
      }

      function isExchangeTakePermitted(
          uint orderPrice,
          uint orderQuantity,
          uint referencePrice
      )
          constant
          returns (bool)
      {
          // Don't buy at much higher price
          return true;
      }
}
