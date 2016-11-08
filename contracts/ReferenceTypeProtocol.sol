pragma solidity ^0.4.4;

/// @title Reference Type Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying
/// Reference Type Contract
contract ReferenceTypeProtocol {
      address public owner;
      // Limited Choices for first Version
      enum References { ETH, USD, EUR }
      References public choice;
      uint256 public fee;
}
