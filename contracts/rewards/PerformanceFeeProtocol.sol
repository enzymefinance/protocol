pragma solidity ^0.4.11;

/// @title PerformanceFee Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying PerformanceFee Contract
contract PerformanceFeeProtocol {
  /* Function invariant
   *  for deltaDifference == 0 => returns 0
   */
  function calculateFee(uint sharePriceDifference, uint totalSupply)
      constant returns (uint)
  {}
}
