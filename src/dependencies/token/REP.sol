pragma solidity 0.6.8;

import './PreminedToken.sol';

contract REP is PreminedToken {
    constructor() public PreminedToken('REP', 18, '') {}
}
