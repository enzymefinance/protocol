pragma solidity 0.6.4;

import './PreminedToken.sol';

contract KNC is PreminedToken {
    constructor() public PreminedToken('KNC', 18, '') {}
}
