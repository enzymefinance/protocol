pragma solidity 0.6.4;

import './PreminedToken.sol';

contract ZRX is PreminedToken {
    constructor() public PreminedToken('ZRX', 18, '') {}
}
