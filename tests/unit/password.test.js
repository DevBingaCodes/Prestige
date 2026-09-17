// Fixed crypto values make token assertions deterministic without weakening production code.
jest.mock("../../config/db", () => ({ query: jest.fn() }));
jest.mock("bcrypt", () => ({ genSalt: jest.fn(), hash: jest.fn() }));
jest.mock("crypto", () => ({
    randomBytes: jest.fn(() => ({ toString: () => "plain-reset-token" })),
    createHash: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn(() => "hashed-reset-token"),
    })),
}));
jest.mock("../../controllers/emailService", () => ({ sendPasswordResetEmail: jest.fn() }));
jest.mock("../../controllers/notifications", () => ({ createNotification: jest.fn() }));

const client = require("../../config/db");
const bcrypt = require("bcrypt");
const { sendPasswordResetEmail } = require("../../controllers/emailService");
const { createNotification } = require("../../controllers/notifications");
const { resetPasswordEmail, resetPasswordToken } = require("../../controllers/password");

// A controller test only needs the Express response methods it calls.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Reset Password EMail
describe("resetPasswordEmail", () => {
    it("requires an email address", async () => {
        const res = createResponse();

        await resetPasswordEmail({ body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "Email is required." });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("stores a reset token and sends the reset email", async () => {
        // First query finds the tenant; second stores the token and expiry.
        client.query
            .mockResolvedValueOnce({ rows: [{ id: 4, email: "tenant@example.com" }] })
            .mockResolvedValueOnce({});
        sendPasswordResetEmail.mockResolvedValueOnce();
        const res = createResponse();

        await resetPasswordEmail({ body: { email: "tenant@example.com" } }, res);

        expect(client.query).toHaveBeenCalledTimes(2);
        expect(sendPasswordResetEmail).toHaveBeenCalledWith("tenant@example.com", "plain-reset-token");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Password reset email sent" });
    });
});

// Reset password token test
describe("resetPasswordToken", () => {
    it("rejects an invalid or expired reset token", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await resetPasswordToken({
            body: { token: "expired-token", newPassword: "NewPassword1!", confirmPassword: "NewPassword1!" },
        }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "Invalid or expired token." });
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(createNotification).not.toHaveBeenCalled();
    });

    it("updates the password, clears the token, and notifies the tenant", async () => {
        // Valid token lookup is followed by the password/reset-token update.
        client.query
            .mockResolvedValueOnce({ rows: [{ id: 4 }] })
            .mockResolvedValueOnce({});
        bcrypt.genSalt.mockResolvedValueOnce("salt");
        bcrypt.hash.mockResolvedValueOnce("hashed-password");
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await resetPasswordToken({
            body: { token: "valid-token", newPassword: "NewPassword1!", confirmPassword: "NewPassword1!" },
        }, res);

        expect(bcrypt.hash).toHaveBeenCalledWith("NewPassword1!", "salt");
        expect(createNotification).toHaveBeenCalledWith(4, "You recently reset your password.");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Password has been reset successfully." });
    });
});
