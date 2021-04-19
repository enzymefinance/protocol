// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockToken is ERC20Burnable, Ownable {
    using SafeMath for uint256;

    mapping(address => bool) private addressToIsMinter;

    modifier onlyMinter() {
        require(
            addressToIsMinter[msg.sender] || owner() == msg.sender,
            "msg.sender is not owner or minter"
        );
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public ERC20(_name, _symbol) {
        _setupDecimals(_decimals);
        _mint(msg.sender, uint256(100000000).mul(10**uint256(_decimals)));
    }

    function mintFor(address _who, uint256 _amount) external onlyMinter {
        _mint(_who, _amount);
    }

    function mint(uint256 _amount) external onlyMinter {
        _mint(msg.sender, _amount);
    }

    function addMinters(address[] memory _minters) public onlyOwner {
        for (uint256 i = 0; i < _minters.length; i++) {
            addressToIsMinter[_minters[i]] = true;
        }
    }
}
