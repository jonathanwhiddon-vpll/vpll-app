// api/stripe-webhook.js

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Required raw body support for Stripe signatures
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  // Stripe requires the raw body to verify the webhook signature
  let rawBody = "";
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => (rawBody += chunk));
    req.on("end", resolve);
    req.on("error", reject);
  });

  const signature = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed:", err.message);
    res.statusCode = 400;
    res.end(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle successful checkout
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email =
      (session.customer_details && session.customer_details.email) ||
      session.customer_email;

    console.log("🎉 Payment completed for:", email);

    // Save to Supabase — mark user as paid
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/payments`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email: email,
        paid: true,
        purchased_at: new Date().toISOString(),
      }),
    }).catch((err) => {
      console.error("Supabase error:", err);
    });
  }

  // Respond to Stripe
  res.statusCode = 200;
  res.end("Webhook received");
};
