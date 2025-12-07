// api/create-checkout-session.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a Stripe Checkout session for the $1.99 app purchase.
 * Expects JSON body: { email: "user@example.com" }
 */
module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    // For static hosting on Vercel, origin can be taken from headers
    const origin =
      req.headers.origin ||
      `https://${req.headers.host}` ||
      "https://vpll-app.vercel.app";

    let body = "";
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", resolve);
      req.on("error", reject);
    });

    const { email } = JSON.parse(body || "{}");

    if (!email) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing email" }));
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.PRICE_ID,
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/paywall.html`,
      metadata: {
        email,
      },
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: session.url }));
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
