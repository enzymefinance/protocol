pragma solidity 0.6.8;

import './PreminedToken.sol';

contract EUR is PreminedToken {
    constructor() public PreminedToken('EUR', 18, '') {}
}
