import factory from "./abi/ThrowdownFactory.json";
import router from "./abi/ThrowRouter.json";
import hook from "./abi/ThrowHook.json";
import token from "./abi/ThrowToken.json";
import showcase from "./abi/ThrowShowcase.json";
import { parseAbi, type Abi } from "viem";

export const factoryAbi = factory.abi as Abi;
export const routerAbi = router.abi as Abi;
export const hookAbi = hook.abi as Abi;
export const tokenAbi = token.abi as Abi;
export const showcaseAbi = showcase.abi as Abi;

export const poolManagerAbi = parseAbi([
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  "function extsload(bytes32 slot) view returns (bytes32)",
]);

export const erc20Abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
