pragma solidity 0.6.8;

import './PreminedToken.sol';

contract DAI is PreminedToken {
    constructor() public PreminedToken('DAI', 18, '') {}
}
