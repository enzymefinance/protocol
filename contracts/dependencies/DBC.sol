pragma solidity ^0.4.11;

/// @title Desing by contract (Hoare logic) contract
/// @author Melonport AG <team@melonport.com>
/// @notice Gives deriving contract design by contract-style assertions
contract DBC {

    // MODIFIERS

    modifier pre_cond(bool condition) {
        require(condition);
        _;
    }

    modifier post_cond(bool condition) {
        _;
        assert(condition);
    }

    modifier invariant(bool condition) {
        require(condition);
        _;
        assert(condition);
    }

}
