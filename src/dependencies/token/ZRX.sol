pragma solidity 0.6.8;

import './PreminedToken.sol';

contract ZRX is PreminedToken {
    constructor() public PreminedToken('ZRX', 18, '') {}
}
