pragma solidity 0.6.1;

import "main/dependencies/token/PreminedToken.sol";

contract MaliciousToken is PreminedToken {

    bool public isReverting = false;

    constructor(string memory _symbol, uint8 _decimals, string memory _name)
        public
        PreminedToken(_symbol, _decimals, _name)
    {}

    function startReverting() public {
        isReverting = true;
    }

    function transfer(address _to, uint256 _value) public override returns (bool) {
        require(!isReverting, "I'm afraid I can't do that, Dave");
        super.transfer(_to, _value);
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    )
        public
        override
        returns (bool)
    {
        require(!isReverting, "I'm afraid I can't do that, Dave");
        super.transferFrom(_from, _to, _value);
    }
}
