// api/test-checkout.js

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// TEMPORARY: hard-coded test Price ID from your Stripe product
const PRICE_ID = "price_1SaNxoLKDHbEWq7Mibfw2NKB";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: "https://vpll-app.vercel.app/?success=1",
      cancel_url: "https://vpll-app.vercel.app/?canceled=1",
    });

    // Redirect the browser straight to Stripe Checkout
    res.writeHead(303, { Location: session.url });
    res.end();
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe error" });
  }
};
