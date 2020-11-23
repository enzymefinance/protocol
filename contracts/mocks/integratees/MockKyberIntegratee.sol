// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../prices/CentralizedRateProvider.sol";
import "../utils/SwapperBase.sol";

contract MockKyberIntegratee is SwapperBase {
    using SafeMath for uint256;

    address private immutable MOCK_CENTRALIZED_RATE_PROVIDER;
    address private immutable WETH;

    uint256 private constant PRECISION = 18;

    // Deviation set in % defines the MAX deviation per block from the mean rate
    uint256 private constant BLOCK_NUMBER_DEVIATION = 3;

    constructor(address _mockCentralizedRateProvider, address _weth) public {
        MOCK_CENTRALIZED_RATE_PROVIDER = _mockCentralizedRateProvider;
        WETH = _weth;
    }

    function swapEtherToToken(address _destToken, uint256) external payable returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(MOCK_CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(WETH, msg.value, _destToken, BLOCK_NUMBER_DEVIATION);

        __swapAssets(msg.sender, ETH_ADDRESS, msg.value, _destToken, destAmount);
        return msg.value;
    }

    function swapTokenToEther(
        address _srcToken,
        uint256 _srcAmount,
        uint256
    ) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(MOCK_CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(_srcToken, _srcAmount, WETH, BLOCK_NUMBER_DEVIATION);

        __swapAssets(msg.sender, _srcToken, _srcAmount, ETH_ADDRESS, destAmount);
        return _srcAmount;
    }

    function swapTokenToToken(
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256
    ) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(MOCK_CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(
            _srcToken,
            _srcAmount,
            _destToken,
            BLOCK_NUMBER_DEVIATION
        );

        __swapAssets(msg.sender, _srcToken, _srcAmount, _destToken, destAmount);
        return _srcAmount;
    }

    function getExpectedRate(
        address _srcToken,
        address _destToken,
        uint256 _amount
    ) external returns (uint256 rate_, uint256 worstRate_) {
        if (_srcToken == ETH_ADDRESS) {
            _srcToken = WETH;
        }
        if (_destToken == ETH_ADDRESS) {
            _destToken = WETH;
        }

        uint256 destAmount = CentralizedRateProvider(MOCK_CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(_srcToken, _amount, _destToken, BLOCK_NUMBER_DEVIATION);
        rate_ = destAmount.mul(10**PRECISION).div(_amount);
        worstRate_ = rate_.mul(uint256(100).sub(BLOCK_NUMBER_DEVIATION)).div(100);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getCentralizedRateProvider() public view returns (address) {
        return MOCK_CENTRALIZED_RATE_PROVIDER;
    }

    function getWeth() public view returns (address) {
        return WETH;
    }

    function getPrecision() public pure returns (uint256) {
        return PRECISION;
    }

    function getBlockNumberDeviation() public pure returns (uint256) {
        return BLOCK_NUMBER_DEVIATION;
    }
}
