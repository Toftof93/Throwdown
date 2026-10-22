import { Features } from "@/components/Features";

export const metadata = { title: "How it works · Throwdown" };

const FAQ = [
  ["How is a winner decided?", "By net ETH in: every ETH spent buying a coin counts, every ETH taken out by selling counts against it. Buying and selling back scores almost nothing, so wash trading doesn't help. The only way up the card is real money staying in your coin."],
  ["Where does the prize come from?", "10% of the ETH side of every coin's trading fees goes to the Arena prize pool. When the round ends, the top three coins split it 50/30/20, and each share buys that coin back and burns it, which shrinks supply for every holder."],
  ["How do challenges work?", "Launch a coin and name the ticker you're calling out. Anyone can answer in the next hour by launching that coin. Both open at the same second and fight for 24 hours; 20% of both sides' ETH fees go into a pot that buys back the winner."],
  ["Who settles rounds and fights?", "Anyone. When the clock runs out, the Arena page and the fight page show a button. Whoever presses it pays the gas; the result is decided by the contract, not by us."],
  ["What's a bond?", "A creator can lock ETH as a promise their wallet won't sell or move their coin for 30 days. Keep it and the ETH comes back. Break it and anyone can spend the bond buying the coin back and burning it."],
  ["What does it cost to launch?", "Just gas, plus a bond if you choose one. Your coin's pool is seeded with the coin itself, so you don't need to bring ETH."],
  ["Can anyone pull the liquidity?", "No. It's held by the Throwdown contract and there's no way to remove it. The owner can only change settings for future launches, never touch prize pools, pots, bonds or anyone's money."],
  ["Is this safe?", "The rules are fair, but meme coins are risky and most go to zero. Only use money you can afford to lose."],
];

export default function How() {
  return (
    <main className="how wrap">
      <p className="eyebrow">How it works</p>
      <h1 className="display">
        Coins that <em>fight.</em>
      </h1>
      <p className="lead">Throwdown turns every launch into a fight. Your coin enters the daily Arena, you can call out a rival, and the winners eat the losers' fees.</p>
      <ol className="steps">
        <li>
          <div>
            <h3>Launch</h3>
            <p>Name, ticker, picture. Pick the Arena, or call out a rival. Add a bond if you want buyers to trust you.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>The bell rings</h3>
            <p>Arena coins open five minutes after launch; challenges open together after the one-hour answer window. Snipers pay a tax for the first two minutes.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>Rally your side</h3>
            <p>Every ETH that flows into your coin moves you up the card. Bring your people.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>Winner eats</h3>
            <p>At the final bell, the prize pool and battle pots buy back the winners and burn them. Then a new round starts.</p>
          </div>
        </li>
      </ol>
      <div className="faq">
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <Features />
    </main>
  );
}
