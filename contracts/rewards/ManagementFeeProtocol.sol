pragma solidity ^0.4.11;

/// @title ManagementFee Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying ManagementFee Contract
contract ManagementFeeProtocol {
  /* Function invariant
   *  for timeDifference == 0 => returns 0
   */
  function calculateFee(uint timeDifference, uint gav)
      constant returns (uint)
  {}
}
