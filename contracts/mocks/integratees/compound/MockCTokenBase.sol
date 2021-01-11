// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "../../prices/CentralizedRateProvider.sol";
import "../../utils/SwapperBase.sol";

contract MockCTokenBase is ERC20, SwapperBase, Ownable {
    address internal immutable TOKEN;
    address internal immutable CENTRALIZED_RATE_PROVIDER;

    uint256 internal rate;

    mapping(address => mapping(address => uint256)) internal _allowances;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _token,
        address _centralizedRateProvider,
        uint256 _initialRate
    ) public ERC20(_name, _symbol) {
        _setupDecimals(_decimals);
        TOKEN = _token;
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        rate = _initialRate;
    }

    function approve(address _spender, uint256 _amount) public virtual override returns (bool) {
        _allowances[msg.sender][_spender] = _amount;
        return true;
    }

    /// @dev Overriden `allowance` function, give the integratee infinite approval by default
    function allowance(address _owner, address _spender) public view override returns (uint256) {
        if (_spender == address(this) || _owner == _spender) {
            return 2**256 - 1;
        } else {
            return _allowances[_owner][_spender];
        }
    }

    /// @dev Necessary as this contract doesn't directly inherit from MockToken
    function mintFor(address _who, uint256 _amount) external onlyOwner {
        _mint(_who, _amount);
    }

    /// @dev Necessary to allow updates on persistent deployments (e.g Kovan)
    function setRate(uint256 _rate) public onlyOwner {
        rate = _rate;
    }

    function transferFrom(
        address _sender,
        address _recipient,
        uint256 _amount
    ) public virtual override returns (bool) {
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    // INTERNAL FUNCTIONS

    /// @dev Calculates the cTokenAmount given a tokenAmount
    /// Makes use of a inverse rate with the CentralizedRateProvider as a derivative can't be used as quoteAsset
    function __calcCTokenAmount(uint256 _tokenAmount) internal returns (uint256 cTokenAmount_) {
        uint256 tokenDecimals = ERC20(TOKEN).decimals();
        uint256 cTokenDecimals = decimals();

        // Result in Token Decimals
        uint256 tokenPerCTokenUnit = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(address(this), 10**uint256(cTokenDecimals), TOKEN);

        // Result in cToken decimals
        uint256 inverseRate = uint256(10**tokenDecimals).mul(10**uint256(cTokenDecimals)).div(
            tokenPerCTokenUnit
        );

        // Amount in token decimals, result in cToken decimals
        cTokenAmount_ = _tokenAmount.mul(inverseRate).div(10**tokenDecimals);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @dev Part of ICERC20 token interface
    function underlying() public view returns (address) {
        return TOKEN;
    }

    /// @dev Part of ICERC20 token interface.
    /// Called from CompoundPriceFeed, returns the actual Rate cToken/Token
    function exchangeRateStored() public view returns (uint256) {
        return rate;
    }

    function getCentralizedRateProvider() public view returns (address) {
        return CENTRALIZED_RATE_PROVIDER;
    }
}
