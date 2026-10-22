"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, keccak256, concat, pad, toHex, getContractAddress, type Address, type Chain, type Hex } from "viem";
import { CHAINS } from "@/lib/chains";
import { factoryAbi, showcaseAbi } from "@/lib/abi";
import factoryArt from "@/lib/abi/ThrowdownFactory.json";
import routerArt from "@/lib/abi/ThrowRouter.json";
import deployerArt from "@/lib/abi/ThrowDeployer.json";
import showcaseArt from "@/lib/abi/ThrowShowcase.json";
import pmArt from "@/lib/abi/PoolManager.json";
import { connect, walletMessage } from "@/lib/wallet";
import { tickForMcap, mcapForTick } from "@/lib/math";

const OFFICIAL_PM: Record<number, Address> = { 4663: "0x8366a39cc670b4001a1121b8f6a443a643e40951" };
// beforeInitialize, beforeSwap and afterSwap
const FLAGS = (1n << 13n) | (1n << 7n) | (1n << 6n);

type Saved = { poolManager?: Address; deployer?: Address; factory?: Address; startBlock?: string; hook?: Address; router?: Address; showcase?: Address; showcaseBlock?: string };

const storeKey = (id: number) => `throwdown:deploy:${id}`;
const load = (id: number): Saved => {
  try {
    return JSON.parse(localStorage.getItem(storeKey(id)) || "{}");
  } catch {
    return {};
  }
};

/** Finds a CREATE2 salt that puts the hook at an address with exactly the right permission bits. */
async function mineSalt(deployer: Address, initHash: Hex, onProgress: (n: number) => void): Promise<Hex> {
  const pre = concat(["0xff", deployer]);
  for (let i = 0n; ; i++) {
    const salt = pad(toHex(i), { size: 32 });
    const a = BigInt("0x" + keccak256(concat([pre, salt, initHash])).slice(-40));
    if ((a & 0x3fffn) === FLAGS) return salt;
    if (i % 2000n === 0n) {
      onProgress(Number(i));
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

export function Admin() {
  // The local chain is only offered when developing, for end-to-end tests.
  const options = CHAINS.filter((c) => c.id !== 31337 || process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_CHAIN_ID === "31337");
  const [chainId, setChainId] = useState<number>(options[1]?.id ?? options[0].id);
  const chain = options.find((c) => c.id === chainId) as Chain;
  const pc = createPublicClient({ chain, transport: http() });
  const [s, setS] = useState<Saved>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null);
  const [treasury, setTreasury] = useState("");
  const [mcap, setMcap] = useState("1.5");
  const [leadMin, setLeadMin] = useState("5");
  const [protocolPct, setProtocolPct] = useState("20");
  const [current, setCurrent] = useState<{ tick: number; lead: number; protocol: number; owner: Address } | null>(null);
  const [showFee, setShowFee] = useState("5");
  const [hideId, setHideId] = useState("");
  const [showNow, setShowNow] = useState<{ fee: number; count: number } | null>(null);

  useEffect(() => {
    const saved = load(chainId);
    setS({ ...saved, poolManager: saved.poolManager ?? OFFICIAL_PM[chainId] });
    setMsg(null);
  }, [chainId]);
  const save = (patch: Saved) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(storeKey(chainId), JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!s.factory) return setCurrent(null);
    const f = s.factory;
    Promise.all(["startTick", "minLead", "protocolBps", "owner"].map((fn) => pc.readContract({ address: f, abi: factoryAbi, functionName: fn })))
      .then(([tick, lead, protocol, owner]) => setCurrent({ tick: Number(tick), lead: Number(lead), protocol: Number(protocol), owner: owner as Address }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.factory, chainId, busy]);

  useEffect(() => {
    if (!s.showcase) return setShowNow(null);
    const a = s.showcase;
    Promise.all(["feeBps", "projectCount"].map((fn) => pc.readContract({ address: a, abi: showcaseAbi, functionName: fn })))
      .then(([fee, count]) => setShowNow({ fee: Number(fee), count: Number(count) }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.showcase, chainId, busy]);

  async function step(label: string, f: (w: Awaited<ReturnType<typeof connect>>) => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await f(await connect(chain));
      setMsg({ text: `${label}: done.`, kind: "ok" });
    } catch (e) {
      setMsg({ text: walletMessage(e), kind: "err" });
    } finally {
      setBusy(null);
    }
  }

  const wait = async (hash: Hex) => {
    setMsg({ text: "Waiting for the network…" });
    const rc = await pc.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error("The transaction failed.");
    return rc;
  };

  const deployContract = async (w: Awaited<ReturnType<typeof connect>>, art: { abi: unknown; bytecode: string }, args: unknown[]) => {
    setMsg({ text: "Confirm in your wallet…" });
    const hash = await w.wallet.deployContract({ account: w.account, chain, abi: art.abi as never, bytecode: art.bytecode as Hex, args: args as never });
    return wait(hash);
  };

  const call = (label: string, address: Address, abi: unknown, functionName: string, args: unknown[]) =>
    step(label, async (w) => {
      setMsg({ text: "Confirm in your wallet…" });
      await wait(await w.wallet.writeContract({ account: w.account, chain, address, abi: abi as never, functionName, args: args as never }));
    });

  const deployHook = () =>
    step("Hook", async (w) => {
      const initHash = (await pc.readContract({ address: s.deployer!, abi: deployerArt.abi, functionName: "hookInitCodeHash", args: [s.poolManager, s.factory] })) as Hex;
      const salt = await mineSalt(s.deployer!, initHash, (n) => setMsg({ text: `Finding the hook address… ${n.toLocaleString()} tries` }));
      const hook = getContractAddress({ opcode: "CREATE2", from: s.deployer!, salt, bytecodeHash: initHash });
      setMsg({ text: "Confirm the hook deployment in your wallet…" });
      await wait(await w.wallet.writeContract({ account: w.account, chain, address: s.deployer!, abi: deployerArt.abi as never, functionName: "deployHook", args: [salt, s.poolManager, s.factory] as never }));
      setMsg({ text: "Confirm connecting the hook in your wallet…" });
      await wait(await w.wallet.writeContract({ account: w.account, chain, address: s.factory!, abi: factoryAbi, functionName: "setHook", args: [hook] }));
      save({ hook });
    });

  const envs =
    s.factory && s.router && s.poolManager && s.hook
      ? [
          `NEXT_PUBLIC_CHAIN_ID=${chain.id}`,
          !OFFICIAL_PM[chain.id] || OFFICIAL_PM[chain.id].toLowerCase() !== s.poolManager.toLowerCase() ? `NEXT_PUBLIC_POOL_MANAGER=${s.poolManager}` : null,
          `NEXT_PUBLIC_FACTORY=${s.factory}`,
          `NEXT_PUBLIC_ROUTER=${s.router}`,
          `NEXT_PUBLIC_START_BLOCK=${s.startBlock ?? 0}`,
          s.showcase ? `NEXT_PUBLIC_SHOWCASE=${s.showcase}` : null,
          s.showcase ? `NEXT_PUBLIC_SHOWCASE_BLOCK=${s.showcaseBlock ?? 0}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : null;
  const done = (v: unknown) => (v ? <span className="done-tick">✓</span> : null);
  const code = (v?: string) => (v ? <code>{v}</code> : null);

  return (
    <main className="admin wrap">
      <p className="eyebrow">Admin</p>
      <h1 className="display">Set up Throwdown</h1>
      <p className="muted">Deploy the contracts from your own wallet, one step at a time. Do it on testnet first. Your progress is saved in this browser.</p>
      <div className="chips" style={{ margin: "18px 0" }}>
        {options.map((c) => (
          <button key={c.id} className={c.id === chainId ? "on" : ""} onClick={() => setChainId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {chain.id === 4663 && <p className="notice warn">This is mainnet. Every step costs real ETH and the contracts are permanent.</p>}
      {msg && (
        <p className={`notice ${msg.kind ?? ""}`} style={{ margin: "12px 0" }}>
          {msg.text}
        </p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <section className="panel stepcard">
          <h3>
            <i>01</i> Uniswap v4 pool manager {done(s.poolManager)}
          </h3>
          {s.poolManager ? (
            <p className="muted" style={{ margin: 0 }}>
              {code(s.poolManager)} {OFFICIAL_PM[chain.id] ? "(Uniswap's official deployment)" : "(your test copy)"}
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>Uniswap v4 isn't on this network, so deploy a test copy of Uniswap's own pool manager.</p>
              <button className="btn" disabled={!!busy} onClick={() => step("Test pool manager", async (w) => save({ poolManager: (await deployContract(w, pmArt, [w.account])).contractAddress! }))}>
                Deploy test pool manager
              </button>
            </>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>02</i> Deployer {done(s.deployer)}
          </h3>
          {s.deployer ? (
            <p className="muted" style={{ margin: 0 }}>{code(s.deployer)}</p>
          ) : (
            <button className="btn" disabled={!!busy} onClick={() => step("Deployer", async (w) => save({ deployer: (await deployContract(w, deployerArt, [])).contractAddress! }))}>
              Deploy deployer
            </button>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>03</i> Factory {done(s.factory)}
          </h3>
          {s.factory ? (
            <p className="muted" style={{ margin: 0 }}>
              {code(s.factory)} · owner {code(current?.owner)}
            </p>
          ) : (
            <>
              <div className="two">
                <label className="field">
                  <span>Treasury (receives the platform's share)</span>
                  <input value={treasury} onChange={(e) => setTreasury(e.target.value.trim())} placeholder="Leave empty to use your wallet" />
                </label>
                <label className="field">
                  <span>Starting market cap (ETH)</span>
                  <input value={mcap} onChange={(e) => setMcap(e.target.value)} inputMode="decimal" />
                </label>
              </div>
              <button
                className="btn"
                disabled={!!busy || !s.poolManager || !s.deployer || !Number(mcap)}
                onClick={() =>
                  step("Factory", async (w) => {
                    const tr = /^0x[0-9a-fA-F]{40}$/.test(treasury) ? treasury : w.account;
                    const rc = await deployContract(w, factoryArt, [s.poolManager, s.deployer, w.account, tr, tickForMcap(Number(mcap), 18)]);
                    save({ factory: rc.contractAddress!, startBlock: String(rc.blockNumber), hook: undefined });
                  })
                }
              >
                Deploy factory
              </button>
            </>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>04</i> Hook (bell, sniper tax, scorecard) {done(s.hook)}
          </h3>
          {s.hook ? (
            <p className="muted" style={{ margin: 0 }}>{code(s.hook)}</p>
          ) : (
            <button className="btn" disabled={!!busy || !s.factory} onClick={deployHook}>
              Find address, deploy and connect hook
            </button>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>05</i> Router {done(s.router)}
          </h3>
          {s.router ? (
            <p className="muted" style={{ margin: 0 }}>{code(s.router)}</p>
          ) : (
            <button className="btn" disabled={!!busy || !s.poolManager} onClick={() => step("Router", async (w) => save({ router: (await deployContract(w, routerArt, [s.poolManager])).contractAddress! }))}>
              Deploy router
            </button>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>06</i> Settings
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            Now: coins start at {current ? mcapForTick(current.tick, 18).toFixed(3) : "…"} ETH market cap, open {current ? current.lead / 60 : "…"} min after launch, platform takes {current ? current.protocol / 100 : "…"}% of what's left after the Arena and battle cuts.
          </p>
          <div className="three">
            <label className="field">
              <span>Starting market cap (ETH)</span>
              <input value={mcap} onChange={(e) => setMcap(e.target.value)} inputMode="decimal" />
            </label>
            <div className="field" style={{ alignContent: "end" }}>
              <button className="btn" disabled={!!busy || !s.factory || !Number(mcap)} onClick={() => call("Starting price", s.factory!, factoryAbi, "setStartTick", [tickForMcap(Number(mcap), 18)])}>
                Save starting price
              </button>
            </div>
          </div>
          <div className="three">
            <label className="field">
              <span>Wait before trading (minutes, max 60)</span>
              <input value={leadMin} onChange={(e) => setLeadMin(e.target.value)} inputMode="numeric" />
            </label>
            <div className="field" style={{ alignContent: "end" }}>
              <button className="btn" disabled={!!busy || !s.factory} onClick={() => call("Wait time", s.factory!, factoryAbi, "setMinLead", [Math.round(Number(leadMin) * 60)])}>
                Save wait time
              </button>
            </div>
          </div>
          <div className="three">
            <label className="field">
              <span>Platform share (%, max 30)</span>
              <input value={protocolPct} onChange={(e) => setProtocolPct(e.target.value)} inputMode="decimal" />
            </label>
            <div className="field" style={{ alignContent: "end" }}>
              <button className="btn" disabled={!!busy || !s.factory} onClick={() => call("Platform fee", s.factory!, factoryAbi, "setProtocolBps", [Math.round(Number(protocolPct) * 100)])}>
                Save platform fee
              </button>
            </div>
          </div>
        </section>

        <section className="panel stepcard">
          <h3>
            <i>07</i> Project Showcase (projects without a token) {done(s.showcase)}
          </h3>
          {s.showcase ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                {code(s.showcase)} · platform fee {showNow ? showNow.fee / 100 : "…"}% · {showNow ? showNow.count : "…"} projects
              </p>
              <div className="three">
                <label className="field">
                  <span>Platform fee on backing (%, max 10)</span>
                  <input value={showFee} onChange={(e) => setShowFee(e.target.value)} inputMode="decimal" />
                </label>
                <div className="field" style={{ alignContent: "end" }}>
                  <button className="btn" disabled={!!busy} onClick={() => call("Showcase fee", s.showcase!, showcaseAbi, "setFeeBps", [Math.round(Number(showFee) * 100)])}>
                    Save fee
                  </button>
                </div>
              </div>
              <div className="three">
                <label className="field">
                  <span>Hide or unhide a project (number from its page)</span>
                  <input value={hideId} onChange={(e) => setHideId(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 3" />
                </label>
                <div className="field" style={{ alignContent: "end" }}>
                  <button className="btn" disabled={!!busy || !hideId} onClick={() => call("Hide project", s.showcase!, showcaseAbi, "setHidden", [BigInt(hideId), true])}>
                    Hide
                  </button>
                </div>
                <div className="field" style={{ alignContent: "end" }}>
                  <button className="btn" disabled={!!busy || !hideId} onClick={() => call("Unhide project", s.showcase!, showcaseAbi, "setHidden", [BigInt(hideId), false])}>
                    Unhide
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>A separate contract where builders list projects without a token and people back them with ETH. The fee goes to the same treasury as the launchpad.</p>
              <div className="two">
                <label className="field">
                  <span>Platform fee on backing (%, max 10)</span>
                  <input value={showFee} onChange={(e) => setShowFee(e.target.value)} inputMode="decimal" />
                </label>
              </div>
              <button
                className="btn"
                disabled={!!busy || !s.factory}
                onClick={() =>
                  step("Showcase", async (w) => {
                    const tr = s.factory ? ((await pc.readContract({ address: s.factory, abi: factoryAbi, functionName: "treasury" })) as Address) : w.account;
                    const rc = await deployContract(w, showcaseArt, [w.account, tr, Math.round(Number(showFee) * 100)]);
                    save({ showcase: rc.contractAddress!, showcaseBlock: String(rc.blockNumber) });
                  })
                }
              >
                Deploy Showcase
              </button>
            </>
          )}
        </section>

        <section className="panel stepcard">
          <h3>
            <i>08</i> Switch the site on {done(envs)}
          </h3>
          {envs ? (
            <>
              <p className="muted" style={{ margin: 0 }}>In Vercel, open the project, then Settings → Environment Variables, and add each line below (name on the left of =, value on the right). Then redeploy.</p>
              <pre className="envs">{envs}</pre>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Finish the steps above to get your settings.</p>
          )}
        </section>
      </div>
    </main>
  );
}
