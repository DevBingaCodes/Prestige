// Stripe is constructed when the controller module loads, so mock its session method first.
const mockCreateCheckoutSession = jest.fn();

jest.mock("../../config/db", () => ({ query: jest.fn() }));
jest.mock("stripe", () => jest.fn(() => ({
    checkout: { sessions: { create: mockCreateCheckoutSession } },
})));
jest.mock("../../controllers/notifications", () => ({ createNotification: jest.fn() }));

const client = require("../../config/db");
const { createNotification } = require("../../controllers/notifications");
const { createStripeCheckoutSession } = require("../../controllers/rentCheckout");

// No HTTP server is required for this controller-level test.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

// Checkout prerequisities mockery
const mockCheckoutPrerequisites = () => {
    // Booking, tenant details, room details, then recent-payment check.
    client.query
        .mockResolvedValueOnce({ rows: [{ room_id: 2 }] })
        .mockResolvedValueOnce({ rows: [{ email: "tenant@example.com", firstname: "Jane", lastname: "Doe" }] })
        .mockResolvedValueOnce({ rows: [{ price: 5000, image: "https://example.com/room.jpg" }] });
};

beforeEach(() => {
    jest.clearAllMocks();
});

// Stripe checkout session mock
describe("createStripeCheckoutSession", () => {
    it("creates a Stripe checkout session for a tenant with no recent payment", async () => {
        mockCheckoutPrerequisites();
        client.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ payment_id: 12 }] });
        mockCreateCheckoutSession.mockResolvedValueOnce({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
        const res = createResponse();

        await createStripeCheckoutSession({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledTimes(5);
        expect(mockCreateCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: "payment",
            metadata: expect.objectContaining({ paymentId: "12", tenantId: "4" }),
        }));
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
    });

    it("blocks checkout when the tenant has a recent pending payment", async () => {
        mockCheckoutPrerequisites();
        client.query.mockResolvedValueOnce({ rows: [{ payment_id: 11 }] });
        const res = createResponse();

        await createStripeCheckoutSession({ tenantId: 4 }, res);

        expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "You have already paid rent within the last 30 days. Please try again later.",
        });
    });

    it("notifies the tenant when Stripe cannot create a checkout session", async () => {
        const stripeError = new Error("Stripe unavailable");
        const errorSpy = jest.spyOn(console, "error").mockImplementation();
        mockCheckoutPrerequisites();
        client.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ payment_id: 12 }] });
        mockCreateCheckoutSession.mockRejectedValueOnce(stripeError);
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await createStripeCheckoutSession({ tenantId: 4 }, res);

        expect(createNotification).toHaveBeenCalledWith(4, "Your rent payment attempt failed. Please try again.");
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to create checkout session.", error: stripeError });
        errorSpy.mockRestore();
    });
});
