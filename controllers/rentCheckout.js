const client = require("../config/db");
const dotenv = require("dotenv");
const Stripe = require("stripe");
const { createNotification } = require("./notifications");

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//Create a Stripe checkout
const createStripeCheckoutSession = async (req, res) => {
  const tenantId = req.tenantId;

  try {
    // Find tenant room number
    const tenantQuery = `SELECT room_id FROM bookings WHERE tenant_id = $1`;
    const tenantResult = await client.query(tenantQuery, [tenantId]);

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found." });
    }

    // Find tenant email and full name
    const emailQuery = `SELECT email, firstname, lastname FROM tenants WHERE id = $1`;
    const emailResult = await client.query(emailQuery, [tenantId]);

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: "Tenant email not found." });
    }

    const { email: tenantEmail, firstname, lastname } = emailResult.rows[0];
    const tenantName = `${firstname} ${lastname}`;

    const roomNumber = tenantResult.rows[0].room_id;

    // Get rent amount and room image
    const rentQuery = `SELECT price, image FROM rooms WHERE roomid = $1`;
    const rentResult = await client.query(rentQuery, [roomNumber]);

    if (rentResult.rows.length === 0) {
      return res.status(404).json({ error: "Room not found." });
    }

    const { price: rentAmount, image: roomImage } = rentResult.rows[0];

    // Check for recent payment
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoString = thirtyDaysAgo.toISOString().split("T")[0];

    const paymentCheckQuery = `
      SELECT * FROM payments
      WHERE tenant_id = $1
        AND payment_date > $2
        AND payment_status = 'pending' 
    `;

    const paymentCheckResult = await client.query(paymentCheckQuery, [
      tenantId,
      thirtyDaysAgoString,
    ]);

    if (paymentCheckResult.rows.length > 0) {
      return res.status(400).json({
        error:
          "You have already paid rent within the last 30 days. Please try again later.",
      });
    }

    // Insert new payment
    const insertPaymentQuery = `INSERT INTO payments (tenant_id, amount, payment_date, payment_method, payment_status) VALUES ($1, $2, $3, $4, $5) RETURNING payment_id`;
    const values = [tenantId, rentAmount, today, "Stripe", "pending"];
    const result = await client.query(insertPaymentQuery, values);
    const paymentId = result.rows[0].payment_id;

    // Get current month
    const currentMonth = new Date().toLocaleString("default", {
      month: "long",
    });

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "kes",
            product_data: {
              name: `Rent payment for ${tenantName} - Room ${roomNumber} for the month of ${currentMonth}.`,
              images: roomImage ? [roomImage] : [],
            },
            unit_amount: rentAmount * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/payments/success`,
      cancel_url: `${process.env.CLIENT_URL}/payments/failure`,
      metadata: {
        paymentId: paymentId.toString(),
        tenantId: tenantId.toString(),
        tenantName,
        tenantEmail,
        roomNumber: roomNumber.toString(),
        currentMonth,
      },
      payment_intent_data: {
        metadata: {
          paymentId: paymentId.toString(),
          tenantId: tenantId.toString(),
          tenantName,
          tenantEmail,
          roomNumber: roomNumber.toString(),
          currentMonth,
          rentAmount: rentAmount.toString(),
        },
      },
    });

    res.status(200).json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("Error creating rent checkout session:", error.message);
    await createNotification(
      tenantId,
      "Your rent payment attempt failed. Please try again."
    );
    res
      .status(500)
      .json({ error: "Failed to create checkout session.", error });
  }
};


module.exports = {
  createStripeCheckoutSession,
};
