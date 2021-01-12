// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../release/utils/MathHelpers.sol";
import "../prices/CentralizedRateProvider.sol";
import "../utils/SwapperBase.sol";

contract MockKyberIntegratee is SwapperBase, Ownable, MathHelpers {
    using SafeMath for uint256;

    address private immutable CENTRALIZED_RATE_PROVIDER;
    address private immutable WETH;

    uint256 private constant PRECISION = 18;

    // Deviation set in % defines the MAX deviation per block from the mean rate
    uint256 private blockNumberDeviation;

    constructor(
        address _centralizedRateProvider,
        address _weth,
        uint256 _blockNumberDeviation
    ) public {
        CENTRALIZED_RATE_PROVIDER = _centralizedRateProvider;
        WETH = _weth;
        blockNumberDeviation = _blockNumberDeviation;
    }

    function swapEtherToToken(address _destToken, uint256) external payable returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(WETH, msg.value, _destToken, blockNumberDeviation);

        __swapAssets(msg.sender, ETH_ADDRESS, msg.value, _destToken, destAmount);
        return msg.value;
    }

    function swapTokenToEther(
        address _srcToken,
        uint256 _srcAmount,
        uint256
    ) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(_srcToken, _srcAmount, WETH, blockNumberDeviation);

        __swapAssets(msg.sender, _srcToken, _srcAmount, ETH_ADDRESS, destAmount);
        return _srcAmount;
    }

    function swapTokenToToken(
        address _srcToken,
        uint256 _srcAmount,
        address _destToken,
        uint256
    ) external returns (uint256) {
        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomized(_srcToken, _srcAmount, _destToken, blockNumberDeviation);

        __swapAssets(msg.sender, _srcToken, _srcAmount, _destToken, destAmount);
        return _srcAmount;
    }

    function setBlockNumberDeviation(uint256 _deviationPct) external onlyOwner {
        blockNumberDeviation = _deviationPct;
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

        uint256 destAmount = CentralizedRateProvider(CENTRALIZED_RATE_PROVIDER)
            .calcLiveAssetValueRandomizedBySender(_srcToken, _amount, _destToken);
        rate_ = __calcNormalizedRate(
            ERC20(_srcToken).decimals(),
            _amount,
            ERC20(_destToken).decimals(),
            destAmount
        );
        worstRate_ = rate_.mul(uint256(100).sub(blockNumberDeviation)).div(100);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    function getCentralizedRateProvider() public view returns (address) {
        return CENTRALIZED_RATE_PROVIDER;
    }

    function getWeth() public view returns (address) {
        return WETH;
    }

    function getBlockNumberDeviation() public view returns (uint256) {
        return blockNumberDeviation;
    }

    function getPrecision() public pure returns (uint256) {
        return PRECISION;
    }
}
