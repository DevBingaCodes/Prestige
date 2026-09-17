const client = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendVerificationEmail } = require("./emailService");
const { createNotification } = require("./notifications");

// Register Tenant
const signUpTenant = async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  // Verify required fields
  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Name Format Validation
  const nameRegex = /^[A-Za-z]+$/;
  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    return res.status(400).json({
      message: "First name and last name must contain only letters.",
    });
  }

  // Email Format Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  // Validate Password Strength
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 8 characters long, include one uppercase letter, one lowercase letter, one number, and one special character.",
    });
  }

  // Validate Phone Number Format
  const phoneRegex = /^(07\d{8}|01\d{8})$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).json({
      message: "Phone number must start with 07 or 01 and be 10 digits long.",
    });
  }

  try {
    // Check if tenant already exists
    const checkTenantQuery =
      "SELECT * FROM tenants WHERE email = $1 OR phoneNumber = $2";
    const existingTenant = await client.query(checkTenantQuery, [
      email,
      phoneNumber,
    ]);

    if (existingTenant.rows.length > 0) {
      return res.status(409).json({
        message: "Email or phone number already registered.",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate and hash verification token
    const plainToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(plainToken)
      .digest("hex");

    const verificationTokenExpiry = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes expiry

    // Insert Tenant
    const insertTenantQuery = `
      INSERT INTO tenants (
        firstName, lastName, email, phoneNumber, password,
        verificationToken, verificationTokenExpiry, isVerified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, firstName, lastName, email, phoneNumber;
    `;

    const newTenant = await client.query(insertTenantQuery, [
      firstName,
      lastName,
      email,
      phoneNumber,
      hashedPassword,
      hashedToken,
      verificationTokenExpiry,
      false,
    ]);

    const tenantId = newTenant.rows[0].id;

    // Send email with plainToken
    await sendVerificationEmail(email, plainToken);

    //Send notification
    await createNotification(
      tenantId,
      "Thank you for signing up. Please check your email for an account verification instructions. If not in the inbox please look at the spam folder."
    );

    res.status(201).json({
      message: "You have registered successfully.",
      tenant: newTenant.rows[0],
    });
  } catch (error) {
    console.error("Tenant Registration Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Tenant Login
const signInTenant = async (req, res) => {
  const { email, password } = req.body;

  if (req.cookies?.tenantPrestigeSession) {
    return res.status(400).json({ message: "You are already logged in." });
  }

  try {
    // Check if tenant exists
    const checkTenantQuery = "SELECT * FROM tenants WHERE email = $1";
    const tenant = await client.query(checkTenantQuery, [email]);

    if (tenant.rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Invalid credentials. Please try again." });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      tenant.rows[0].password
    );

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ message: "Invalid credentials. Please try again" });
    }

    // Create JWT
    const tenantToken = jwt.sign(
      {
        id: tenant.rows[0].id,
        role: "Tenant",
        firstName: tenant.rows[0].firstName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    //Set the cookie
    res.cookie("tenantPrestigeSession", tenantToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Sign in successful",
      tenant: {
        id: tenant.rows[0].id,
        firstName: tenant.rows[0].firstName,
        email: tenant.rows[0].email,
      },
    });
  } catch (error) {
    console.error("Tenant Login Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Tenant Logout
const logoutTenant = async (req, res) => {
  try {
    if (!req.cookies?.tenantPrestigeSession) {
      return res.status(400).json({ message: "You are not logged in." });
    }

    res.clearCookie("tenantPrestigeSession");
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Tenant Logout Error:", error);
    res.status(500).json({ message: "Error occurred during logout." });
  }
};

// Admin Register
const signUpAdmin = async (req, res) => {
  const { email, phoneNumber, password } = req.body;

  // Verify required fields
  if (!email || !phoneNumber || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // Email Format Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  // Validate Password Strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 8 characters long, include one uppercase letter, one lowercase letter, one number, and one special character.",
    });
  }

  // Validate Phone Number Format
  const phoneRegex = /^(07\d{8}|01\d{8})$/;
  if (!phoneRegex.test(phoneNumber)) {
    return res.status(400).json({
      message: "Phone number must start with 07 or 01 and be 10 digits long.",
    });
  }

  try {
    // Check if admin already exists
    const checkAdminQuery =
      "SELECT * FROM admins WHERE email = $1 OR phoneNumber = $2";
    const existingAdmin = await client.query(checkAdminQuery, [
      email,
      phoneNumber,
    ]);

    if (existingAdmin.rows.length > 0) {
      return res.status(409).json({
        message: "Email or phone number already registered.",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert Admin
    const insertAdminQuery = `
      INSERT INTO admins (
        email, phoneNumber, password
      ) VALUES ($1, $2, $3)
      RETURNING id, email, phoneNumber;
    `;

    const newAdmin = await client.query(insertAdminQuery, [
      email,
      phoneNumber,
      hashedPassword,
    ]);

    res.status(201).json({
      message: "You have registered successfully.",
      admin: newAdmin.rows[0],
    });
  } catch (error) {
    console.error("Admin Registration Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Admin Login
const signInAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (req.cookies?.adminPrestigeSession) {
    return res.status(400).json({ message: "You are already logged in." });
  }

  try {
    // Check if admin exists
    const checkAdminQuery = "SELECT * FROM admins WHERE email = $1";
    const admin = await client.query(checkAdminQuery, [email]);

    if (admin.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      admin.rows[0].password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Create JWT
    const adminToken = jwt.sign(
      {
        id: admin.rows[0].id,
        role: "Administrator",
        email: admin.rows[0].email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Set cookie
    res.cookie("adminPrestigeSession", adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Sign in successful",
      admin: {
        id: admin.rows[0].id,
        email: admin.rows[0].email,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Admin Logout
const logoutAdmin = async (req, res) => {
  try {
    if (!req.cookies?.adminPrestigeSession) {
      return res.status(400).json({ message: "You are not logged in." });
    }

    res.clearCookie("adminPrestigeSession");
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Admin Logout Error:", error);
    res.status(500).json({ message: "Error occurred during logout." });
  }
};

module.exports = {
  signUpTenant,
  signInTenant,
  logoutTenant,
  signUpAdmin,
  signInAdmin,
  logoutAdmin,
};
