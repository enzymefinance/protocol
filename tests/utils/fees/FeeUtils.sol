// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

enum FeeHook {
    Continuous,
    PreBuyShares,
    PostBuyShares,
    PreRedeemShares
}

enum SettlementType {
    None,
    Direct,
    Mint,
    Burn,
    MintSharesOutstanding,
    BurnSharesOutstanding
}
