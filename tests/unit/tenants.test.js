// Tenant updates create notifications, so mock both persistence boundaries.
jest.mock("../../config/db", () => ({ query: jest.fn() }));
jest.mock("../../controllers/notifications", () => ({ createNotification: jest.fn() }));

const client = require("../../config/db");
const { createNotification } = require("../../controllers/notifications");
const { getTenants, getSingleTenant, updateInformation, deleteTenant } = require("../../controllers/tenants");

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Get tenants test
describe("getTenants", () => {
    it("returns all tenants", async () => {
        const tenants = [{ id: 1, firstname: "Jane" }];
        client.query.mockResolvedValueOnce({ rows: tenants });
        const res = createResponse();

        await getTenants({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(tenants);
    });

    it("returns 500 when tenants cannot be fetched", async () => {
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getTenants({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith("Could not fetch tenants.");
    });
});

// Single tenant test
describe("getSingleTenant", () => {
    it("returns 404 when the tenant does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await getSingleTenant({ params: { id: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "Tenant not found." });
    });

    it("returns tenant details without sensitive fields", async () => {
        const tenant = { id: 1, firstname: "Jane", email: "jane@example.com" };
        const room = { roomid: 2, price: 5000 };
        // Tenant, booking, room, then latest issue: this is the controller's query order.
        client.query
            .mockResolvedValueOnce({ rows: [{ ...tenant, password: "hash", verificationtoken: "token" }] })
            .mockResolvedValueOnce({ rows: [{ booking_id: 1, room_id: 2 }] })
            .mockResolvedValueOnce({ rows: [room] })
            .mockResolvedValueOnce({ rows: [{ status: "OPEN" }] });
        const res = createResponse();

        await getSingleTenant({ params: { id: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            tenant,
            bookings: [{ booking_id: 1, room_id: 2 }],
            room,
            latestIssue: { status: "OPEN" },
            roomPrice: 5000,
        });
    });
});

// Information update test
describe("updateInformation", () => {
    it("rejects an update with no fields", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
        const res = createResponse();

        await updateInformation({ params: { id: 1 }, body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: "No data provided for update." });
    });

    it("updates tenant information and creates a notification", async () => {
        const updatedTenant = { id: 1, firstname: "Janet" };
        client.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [updatedTenant] });
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await updateInformation({ params: { id: 1 }, body: { firstName: "Janet" } }, res);

        expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining("firstname = $1"), ["Janet", 1]);
        expect(createNotification).toHaveBeenCalledWith(1, "You recently updated your information.");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Tenant information updated successfully.", tenant: updatedTenant });
    });
});

// Soft-delete tenant test
describe("deleteTenant", () => {
    it("returns 404 when the tenant does not exist", async () => {
        client.query.mockResolvedValueOnce({ rowCount: 0 });
        const res = createResponse();

        await deleteTenant({ params: { id: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: "Tenant not found." });
    });

    it("deletes an existing tenant", async () => {
        client.query.mockResolvedValueOnce({ rowCount: 1 });
        const res = createResponse();

        await deleteTenant({ params: { id: 1 } }, res);

        expect(client.query).toHaveBeenCalledWith("DELETE FROM tenants WHERE id = $1", [1]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Tenant deleted successfully." });
    });
});
