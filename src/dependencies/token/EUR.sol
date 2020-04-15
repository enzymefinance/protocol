pragma solidity 0.6.4;

import './PreminedToken.sol';

contract EUR is PreminedToken {
    constructor() public PreminedToken('EUR', 18, '') {}
}
