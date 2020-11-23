// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "../prices/CentralizedRateProvider.sol";
import "../utils/SwapperBase.sol";

contract MockCTokenIntegratee is ERC20, SwapperBase {
    address private immutable TOKEN;
    address private immutable CENTRALIZED_RATE_PROVIDER;
    uint256 private RATE;

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
        RATE = _initialRate;
    }

    function mint(uint256 _amount) external returns (uint256) {
        uint256 tokenDecimals = ERC20(TOKEN).decimals();
        uint256 cTokenDecimals = decimals();

        // Calculate the amount of tokens per one unit of cToken
        uint256 tokenPerCTokenUnit = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValue(address(this), 10**uint256(cTokenDecimals), TOKEN);

        // Calculate the inverse rate to know the amount of cTokens to return from a unit of token
        uint256 inverseRate = uint256(10**tokenDecimals).mul(10**uint256(cTokenDecimals)).div(
            tokenPerCTokenUnit
        );

        // Mint and send those cTokens to sender
        uint256 destAmount = _amount.mul(inverseRate).div(10**tokenDecimals);
        _mint(address(this), destAmount);
        __swapAssets(msg.sender, TOKEN, _amount, address(this), destAmount);
        return _amount;
    }

    function redeem(uint256 _amount) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER).calcLiveAssetValue(
            address(this),
            _amount,
            TOKEN
        );

        __swapAssets(msg.sender, address(this), _amount, TOKEN, destAmount);
        _burn(address(this), _amount);
        return _amount;
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
        return RATE;
    }

    function getCentralizedRateProvider() public view returns (address) {
        return CENTRALIZED_RATE_PROVIDER;
    }
}
