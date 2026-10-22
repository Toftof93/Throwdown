# Throwdown

**Projects that fight.** The first launchpad where projects fight on Robinhood Chain. Memecoins, communities and real projects launch their token and fight. Launch into the Arena or challenge a rival, and the winners eat the losers' fees.

- **The Arena.** Every coin fights in a 24-hour round (UTC days). When the round ends, the three coins with the most **net ETH in** (buys minus sells, counted on-chain by the hook) win the prize pool, split 50/30/20. Each prize buys the coin back and burns it.
- **Challenges.** Launch a coin that calls out a rival ticker. Anyone can answer within an hour; both coins open at the same second and fight for 24 hours. 20% of both sides' ETH fees go to a pot that buys back the winner.
- **Can't be faked.** Scores are net flows, so buying and selling back scores nothing.
- **Bonds.** Creators can lock ETH promising their wallet won't move the coin for 30 days. Keep it and it's refunded; break it and the bond buys back and burns the coin.
- **Safe defaults.** Fixed 1B supply, ETH pairs only, liquidity locked forever on Uniswap v4, a two-minute sniper tax at the open, optional creator allocation with lockups.

Fees from each coin's locked liquidity: 10% of the ETH side to the Arena pool, 20% to the battle pot while a fight runs, then the rest is split creator/platform (platform 20% by default, hard-capped at 30%). ETH payouts are pull-based (`withdraw`). Anyone can collect fees, settle rounds, settle fights and settle bonds.

## Contracts (`contracts/`)

| Contract | What it does |
|---|---|
| `ThrowToken` | Fixed-supply ERC20 (1B). No owner, mint, tax or pause. Burnable. Records if a bonded creator moves it. |
| `ThrowHook` | v4 hook: blocks swaps before the open, sets the decaying dynamic fee, and keeps each coin's net-ETH scorecard. |
| `ThrowdownFactory` | Launches coins into Arena rounds, runs challenges, books fees, settles rounds/fights/bonds with buybacks, holds lockups. |
| `ThrowDeployer` | Holds the coin and hook creation code so the factory fits the size limit. |
| `ThrowRouter` | Exact-input swap router with ETH refunds, minOut, deadline, and an `eth_call` quote. |

```bash
npm install
npm test            # contract tests on a local chain with Uniswap's own PoolManager
npm run compile     # compile and export ABIs to the web app
```

## Deploying

1. Open `/admin`, pick the network, and run each step from your wallet: pool manager (testnet only), deployer, factory, hook (the page finds the CREATE2 salt and connects it), router, settings.
2. Copy the settings it prints into Vercel's environment variables and redeploy.

Uniswap v4 PoolManager on Robinhood Chain mainnet: `0x8366a39cc670b4001a1121b8f6a443a643e40951`.

These contracts have tests but no external audit. Test on testnet first.
