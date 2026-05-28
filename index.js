const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const authRoute = require("./routes/auth");
const tenantRoute = require("./routes/tenants");
const roomsRoute = require("./routes/rooms");
const visitorsRoute = require("./routes/visitors");
const bookingRoute = require("./routes/booking");
const issueRoute = require("./routes/issueReport");
const advertRoute = require("./routes/adverts");
const checkoutRoute = require("./routes/rentCheckout");
const emailRoute = require("./routes/emailService");
const notificationRoute = require("./routes/notifications");
const usersRoute = require("./routes/users");
const paymentRoutes = require("./routes/payments");
const metrictsRoute = require("./routes/metrics")

//Import PG client from the config directory
require("./config/db");

dotenv.config();
const app = express();

//Webhook Route
app.use("/prestige-hostel/v1/webhook", require("./routes/webhook"));

//JSON
app.use(express.json());

//CORS Implementation
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://prestige.skirill.org",
  "https://admin.prestige.skirill.org"

];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS!"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

//Cookie Parser
app.use(cookieParser());

//Track Requests
const { httpRequestCounter } = require("./controllers/metrics");

app.use((req, res, next) => {
  res.on("finish", () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode
    });
  });
  next();
});


//Routes
app.use("/prestige-hostel/v1/auth", authRoute);
app.use("/prestige-hostel/v1/metrics", metrictsRoute)
app.use("/prestige-hostel/v1/verify", emailRoute);
app.use("/prestige-hostel/v1/tenants", tenantRoute);
app.use("/prestige-hostel/v1/rooms", roomsRoute);
app.use("/prestige-hostel/v1/visitors", visitorsRoute);
app.use("/prestige-hostel/v1/booking", bookingRoute);
app.use("/prestige-hostel/v1/issue", issueRoute);
app.use("/prestige-hostel/v1/advertisements", advertRoute);
app.use("/prestige-hostel/v1/checkout", checkoutRoute);
app.use("/prestige-hostel/v1/notifications", notificationRoute);
app.use("/prestige-hostel/v1/users", usersRoute);
app.use("/prestige-hostel/v1/payments", paymentRoutes);
app.use("/prestige-hostel/v1/password", require("./routes/password"));

//No Serving
// Start the server only if not in test environment
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 5900;
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}
