pragma solidity ^0.4.11;

import '../libraries/safeMath.sol';
import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RMLiquididtyProvider is RiskMgmtInterface {

      // FIELDS

      uint public constant RISK_LEVEL = 200; // Allows 2 percent deviation from referencePrice
      uint public constant RISK_DIVISOR = 10000;

      // NON-CONSTANT METHODS

      function isExchangeMakePermitted(
          ERC20   haveToken,
          ERC20   wantToken,
          uint    haveAmount,
          uint    wantAmount,
          uint    referencePrice
      )
          returns (bool)
      {
          return true;
          /*returns referencePrice >= uint256(haveAmount).div(wantAmount)*/
      }

      function isExchangeTakePermitted(
          ERC20   haveToken,
          ERC20   wantToken,
          uint    haveAmount,
          uint    wantAmount,
          uint    referencePrice,
          address orderOwner
      )
          returns (bool)
      {
          return true;
      }
}
