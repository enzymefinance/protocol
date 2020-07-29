pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PreminedToken is ERC20 {
    constructor (
      string memory _name,
      string memory _symbol,
      uint8 _decimals
    ) ERC20(_name, _symbol) public {
        _setupDecimals(_decimals);
        _mint(msg.sender, 1000000 * 10 ** uint256(_decimals));
    }

    function mint(address _who, uint256 _amount) external {
      _mint(_who, _amount);
    }
}
