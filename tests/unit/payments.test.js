// Keep payment reads isolated from a real database.
jest.mock("../../config/db", () => ({ query: jest.fn() }));

const client = require("../../config/db");
const { authTenant } = require("../../middleware/jwt");
const { getAllPayments, getUsersPayment } = require("../../controllers/payments");

// A small response double makes status/json assertions explicit.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// All Payments test
describe("getAllPayments", () => {
    it("returns all payments with tenant details", async () => {
        const payments = [{ payment_id: 1, tenantname: "Jane Doe", amount: 5000, payment_status: "Paid" }];
        client.query.mockResolvedValueOnce({ rows: payments });
        const res = createResponse();

        await getAllPayments({}, res);

        expect(client.query).toHaveBeenCalledWith(expect.stringContaining("JOIN"));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(payments);
    });

    it("returns 500 when fetching all payments fails", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation();
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getAllPayments({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Could not fetch payments." });
        errorSpy.mockRestore();
    });
});

// My Payments test
describe("getUsersPayment", () => {
    it("returns 401 before the controller when there is no authenticated tenant", () => {
        const res = createResponse();
        const next = jest.fn();

        // authTenant normally adds req.tenantId before getUsersPayment runs.
        authTenant({ cookies: {} }, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized. Please login as tenant." });
        expect(next).not.toHaveBeenCalled();
        expect(client.query).not.toHaveBeenCalled();
    });

    it("returns payments for the authenticated tenant", async () => {
        const payments = [{ payment_id: 1, tenant_id: 4, amount: 5000 }];
        client.query.mockResolvedValueOnce({ rows: payments });
        const res = createResponse();

        await getUsersPayment({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(payments);
    });

    it("returns 500 when fetching the tenant's payments fails", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation();
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getUsersPayment({ tenantId: 4 }, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Could not fetch user's payments." });
        errorSpy.mockRestore();
    });
});
