pragma solidity ^0.4.11;

/// @title Hoare (logic) contract
/// @author Melonport AG <team@melonport.com>
/// @notice Gives deriving contract design by contract-style assertions
contract Hoare {

  modifier precond(bool condition) {
      require(condition);
      _;
  }

  modifier postcond(bool condition) {
      _;
      assert(condition);
  }

  modifier invariant(bool condition) {
      require(condition);
      _;
      assert(condition);
  }


}
