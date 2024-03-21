// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.0;

import {IPendleV2Market as IPMarket} from "./interfaces/IPendleV2Market.sol";
import {MarketMathCore, MarketPreCompute} from "./MarketMathCore.sol";
import {PendlePtOracleLib} from "./PendlePtOracleLib.sol";
import {LogExpMath} from "./LogExpMath.sol";
import {PMath} from "./PMath.sol";
import {PYIndex, PYIndexLib} from "./PYIndex.sol";

// Copied over from Pendle contracts.
// src: https://github.com/pendle-finance/pendle-core-v2-public/blob/e6184df2d37be670bd058651e68bd98e2723411a/contracts/oracles/PendleLpOracleLib.sol
// The imports have been converted to named imports
// The MarketState struct is imported from the IPMarket interface
library PendleLpOracleLib {
    using PendlePtOracleLib for IPMarket;
    using PMath for uint256;
    using PMath for int256;
    using MarketMathCore for IPMarket.MarketState;

    /**
     * This function returns the approximated twap rate LP/asset on market, but take into account the current rate of SY
     *  This is to account for special cases where underlying asset becomes insolvent and has decreasing exchangeRate
     * @param market market to get rate from
     * @param duration twap duration
     */
    function getLpToAssetRate(IPMarket market, uint32 duration) internal view returns (uint256) {
        (uint256 syIndex, uint256 pyIndex) = PendlePtOracleLib.getSYandPYIndexCurrent(market);
        uint256 lpToAssetRateRaw = _getLpToAssetRateRaw(market, duration, pyIndex);
        if (syIndex >= pyIndex) {
            return lpToAssetRateRaw;
        } else {
            return (lpToAssetRateRaw * syIndex) / pyIndex;
        }
    }

    function _getLpToAssetRateRaw(IPMarket market, uint32 duration, uint256 pyIndex)
        private
        view
        returns (uint256 lpToAssetRateRaw)
    {
        IPMarket.MarketState memory state = market.readState(address(0));

        int256 totalHypotheticalAsset;
        if (state.expiry <= block.timestamp) {
            // 1 PT = 1 Asset post-expiry
            totalHypotheticalAsset = state.totalPt + PYIndexLib.syToAsset(PYIndex.wrap(pyIndex), state.totalSy);
        } else {
            MarketPreCompute memory comp = state.getMarketPreCompute(PYIndex.wrap(pyIndex), block.timestamp);

            (int256 rateOracle, int256 rateHypTrade) = _getPtRatesRaw(market, state, duration);
            int256 cParam = LogExpMath.exp(comp.rateScalar.mulDown((rateOracle - comp.rateAnchor)));

            int256 tradeSize =
                (cParam.mulDown(comp.totalAsset) - state.totalPt).divDown(PMath.IONE + cParam.divDown(rateHypTrade));

            totalHypotheticalAsset =
                comp.totalAsset - tradeSize.divDown(rateHypTrade) + (state.totalPt + tradeSize).divDown(rateOracle);
        }

        lpToAssetRateRaw = totalHypotheticalAsset.divDown(state.totalLp).Uint();
    }

    function _getPtRatesRaw(IPMarket market, IPMarket.MarketState memory state, uint32 duration)
        private
        view
        returns (int256 rateOracle, int256 rateHypTrade)
    {
        rateOracle = PMath.IONE.divDown(market.getPtToAssetRateRaw(duration).Int());
        int256 rateLastTrade =
            MarketMathCore._getExchangeRateFromImpliedRate(state.lastLnImpliedRate, state.expiry - block.timestamp);
        rateHypTrade = (rateLastTrade + rateOracle) / 2;
    }
}
