// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./../../release/interfaces/ISynthetixProxyERC20.sol";
import "./../../release/interfaces/ISynthetixSynth.sol";
import "./MockToken.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

contract MockSynthetixToken is ISynthetixProxyERC20, ISynthetixSynth, MockToken {
    using SafeMath for uint256;

    bytes32 public immutable CURRENCY_KEY;
    uint256 public constant WAITING_PERIOD_SECS = 3 * 60;

    mapping(address => uint256) public timelockByAccount;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        bytes32 _currencyKey
    ) public MockToken(_name, _symbol, _decimals) {
        CURRENCY_KEY = _currencyKey;
    }

    function _isLocked(address account) internal view returns (bool) {
        return timelockByAccount[account] >= now;
    }

    function _beforeTokenTransfer(
        address from,
        address,
        uint256
    ) internal override {
        require(!_isLocked(from), "Cannot settle during waiting period");
    }

    function target() external view override returns (address) {
        return address(this);
    }

    function currencyKey() external view override returns (bytes32) {
        return CURRENCY_KEY;
    }

    function isLocked(address account) external view returns (bool) {
        return _isLocked(account);
    }

    function burnFrom(address account, uint256 amount) public override {
        _burn(account, amount);
    }

    function lock(address account) public {
        timelockByAccount[account] = now.add(WAITING_PERIOD_SECS);
    }

    function unlock(address account) public {
        timelockByAccount[account] = 0;
    }
}
