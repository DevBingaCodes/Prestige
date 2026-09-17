// Mock anything that would otherwise talk to Postgres or another service.
jest.mock("../../config/db", () => ({
    query: jest.fn(),
}));

jest.mock("bcrypt", () => ({
    hash: jest.fn(),
    compare: jest.fn(),
}));

// A fixed token keeps login tests independent of JWT secrets and expiry time.
jest.mock("jsonwebtoken", () => ({
    sign: jest.fn(),
}));

jest.mock("../../controllers/emailService", () => ({
    sendVerificationEmail: jest.fn(),
}));

jest.mock("../../controllers/notifications", () => ({
    createNotification: jest.fn(),
}));

const client = require("../../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { sendVerificationEmail } = require("../../controllers/emailService");
const { createNotification } = require("../../controllers/notifications");

const {
    signUpTenant,
    signInTenant,
    logoutTenant,
    signUpAdmin,
    signInAdmin,
    logoutAdmin,
} = require("../../controllers/auth");

// Small Express response double: add a method here only when a controller uses it.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
});

//SignUp Tenant test
describe("signUpTenant", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const validTenant = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phoneNumber: "0712345678",
        password: "Password1!",
    };

    it("returns 400 when required fields are missing", async () => {
        const req = {
            body: {},
        };

        const res = createResponse();

        await signUpTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "All fields are required.",
        });

        expect(client.query).not.toHaveBeenCalled();
    });

    it("returns 409 when the tenant already exists", async () => {
        // First query in signUpTenant checks for an existing email or phone number.
        client.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 1,
                    email: validTenant.email,
                    phoneNumber: validTenant.phoneNumber,
                },
            ],
        });

        const req = {
            body: validTenant,
        };

        const res = createResponse();

        await signUpTenant(req, res);

        expect(client.query).toHaveBeenCalledTimes(1);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith({
            message: "Email or phone number already registered.",
        });

        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(sendVerificationEmail).not.toHaveBeenCalled();
        expect(createNotification).not.toHaveBeenCalled();
    });

    it("successfully registers a tenant", async () => {
        const hashedPassword = "hashed-password";

        const newTenant = {
            id: 10,
            firstName: "John",
            lastName: "Doe",
            email: "john@example.com",
            phoneNumber: "0712345678",
        };

        bcrypt.hash.mockResolvedValue(hashedPassword);

        // Queue results in the same order the controller calls the database.
        client.query
            .mockResolvedValueOnce({
                rows: [],
            })
            .mockResolvedValueOnce({
                rows: [newTenant],
            });

        sendVerificationEmail.mockResolvedValue();
        createNotification.mockResolvedValue();

        const req = {
            body: validTenant,
        };

        const res = createResponse();

        await signUpTenant(req, res);

        expect(bcrypt.hash).toHaveBeenCalledWith(
            validTenant.password,
            10
        );

        expect(client.query).toHaveBeenCalledTimes(2);

        expect(sendVerificationEmail).toHaveBeenCalledWith(
            validTenant.email,
            expect.any(String)
        );

        expect(createNotification).toHaveBeenCalledWith(
            newTenant.id,
            expect.any(String)
        );

        expect(res.status).toHaveBeenCalledWith(201);

        expect(res.json).toHaveBeenCalledWith({
            message: "You have registered successfully.",
            tenant: newTenant,
        });
    });

    it("returns 500 when a database error occurs", async () => {
        const databaseError = new Error("Database error");
        const consoleError = jest.spyOn(console, "error").mockImplementation();

        client.query.mockRejectedValueOnce(databaseError);

        const req = { body: validTenant };
        const res = createResponse();

        await signUpTenant(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Internal server error.",
        });

        expect(consoleError).toHaveBeenCalledWith(
            "Tenant Registration Error:",
            databaseError
        );

        consoleError.mockRestore();
    });
});

//SignIn Tenant test
describe("loginTenant", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 when the tenant does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await signInTenant({ body: { email: "missing@example.com", password: "Password1!" } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials. Please try again." });
    });

    it("successfully logs in a tenant", async () => {
        const tenant = { id: 1, firstName: "John", email: "john@example.com", password: "hashed-password" };
        // Login needs a stored user, a matching password, and a signed session token.
        client.query.mockResolvedValueOnce({ rows: [tenant] });
        bcrypt.compare.mockResolvedValueOnce(true);
        jwt.sign.mockReturnValueOnce("tenant-token");
        const res = createResponse();

        await signInTenant({ body: { email: tenant.email, password: "Password1!" }, cookies: {} }, res);

        expect(res.cookie).toHaveBeenCalledWith("tenantPrestigeSession", "tenant-token", expect.any(Object));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Sign in successful", tenant: { id: tenant.id, firstName: tenant.firstName, email: tenant.email } });
    });
})

//Logout Tenant test
describe("logoutTenant", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 400 when no tenant session exists", async () => {
        const res = createResponse();

        await logoutTenant({ cookies: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "You are not logged in." });
    });

    it("successfully logs out a tenant", async () => {
        const res = createResponse();

        // Give the request the cookie that middleware/browser would normally send.
        await logoutTenant({ cookies: { tenantPrestigeSession: "tenant-token" } }, res);

        expect(res.clearCookie).toHaveBeenCalledWith("tenantPrestigeSession");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Logout successful" });
    });
})

//Admin Register test
describe("registerAdmin", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("successfully registers an admin", async () => {
        const admin = { id: 1, email: "admin@example.com", phoneNumber: "0712345678" };
        bcrypt.hash.mockResolvedValue("hashed-password");
        // Empty lookup result, then the row returned from INSERT.
        client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [admin] });
        const res = createResponse();

        await signUpAdmin({ body: { ...admin, password: "Password1!" } }, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: "You have registered successfully.", admin });
    });
})

// Admin Login test
describe("loginAdmin", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 401 when the admin does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await signInAdmin({ body: { email: "missing@example.com", password: "Password1!" } }, res);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials." });
    });

    it("successfully logs in an admin", async () => {
        const admin = { id: 1, email: "admin@example.com", password: "hashed-password" };
        // Keep the three login dependencies predictable for this unit test.
        client.query.mockResolvedValueOnce({ rows: [admin] });
        bcrypt.compare.mockResolvedValueOnce(true);
        jwt.sign.mockReturnValueOnce("admin-token");
        const res = createResponse();

        await signInAdmin({ body: { email: admin.email, password: "Password1!" }, cookies: {} }, res);

        expect(res.cookie).toHaveBeenCalledWith("adminPrestigeSession", "admin-token", expect.any(Object));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Sign in successful", admin: { id: admin.id, email: admin.email } });
    });
})

// Logout Admin Test
describe("logoutAdmin", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 400 when no admin session exists", async () => {
        const res = createResponse();

        await logoutAdmin({ cookies: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "You are not logged in." });
    });

    it("successfully logs out an admin", async () => {
        const res = createResponse();

        // A logout success case starts with an existing session cookie.
        await logoutAdmin({ cookies: { adminPrestigeSession: "admin-token" } }, res);

        expect(res.clearCookie).toHaveBeenCalledWith("adminPrestigeSession");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Logout successful" });
    });
})
