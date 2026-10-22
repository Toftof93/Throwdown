const FEATURES = [
  ["01", "The Arena", "Every launch fights in a 24-hour round. When the bell rings, the three projects with the most ETH flowing in win the prize pool: 50%, 30% and 20%, spent buying their tokens back and burning them."],
  ["02", "Challenges", "Call out a rival project. Whoever answers within an hour launches at the same second, and after 24 hours the side with more ETH in wins the battle pot."],
  ["03", "Can't be faked", "Scores count buys minus sells. Buying and selling back scores nothing, so the only way to win is real money staying in your project."],
  ["04", "Bonded creators", "Creators can lock ETH as a promise not to dump for 30 days. Keep it and it comes back; break it and the bond buys the token back and burns it."],
  ["05", "Liquidity locked forever", "Every token's pool is seeded with the token itself and held by the contract. There's no way to remove it. Nobody can pull the rug."],
  ["06", "Snipers pay", "At the open the fee is 50% and slides to 1% over two minutes. Bots that rush in pay heavily, and it all goes to the token's locked liquidity."],
];

export function Features() {
  return (
    <section className="sec">
      <div className="sec-row">
        <h2>House rules</h2>
      </div>
      <div className="features" style={{ marginTop: 0 }}>
        {FEATURES.map(([k, h, p]) => (
          <div className="feat" key={k}>
            <span className="k">{k}</span>
            <h3>{h}</h3>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
