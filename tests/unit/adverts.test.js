// Keep controller tests outside Postgres and notification delivery.
jest.mock("../../config/db", () => ({ query: jest.fn() }));
jest.mock("../../controllers/notifications", () => ({ createNotification: jest.fn() }));

const client = require("../../config/db");
const { createNotification } = require("../../controllers/notifications");
const { authTenant } = require("../../middleware/jwt");
const {
    getAdvertisements,
    getUsersAdvertisement,
    postAdvertisement,
    approveAdvertisement,
    rejectAdvertisement,
    deleteAdvertisement,
} = require("../../controllers/adverts");

// Minimal Express response double for controller-level tests.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

//Get Adverts Test
describe("getAdvertisements", () => {
    it("returns all public adverts", async () => {
        const advertisements = [{ ad_id: 1, ad_title: "Desk" }];
        client.query.mockResolvedValueOnce({ rows: advertisements });
        const res = createResponse();

        await getAdvertisements({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(advertisements);
    });

    it("returns 500 when the database query fails", async () => {
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getAdvertisements({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Failed to retrieve adverts." });
    });
});

//My Adverts test
describe("getUsersAdvertisement", () => {
    it("returns 401 before the controller when the tenant is not logged in", () => {
        const res = createResponse();
        const next = jest.fn();

        // authTenant normally adds req.tenantId before this controller is called.
        authTenant({ cookies: {} }, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized. Please login as tenant." });
        expect(next).not.toHaveBeenCalled();
    });

    it("returns adverts belonging to the authenticated tenant", async () => {
        const advertisements = [{ ad_id: 1, tenant_id: 4 }];
        client.query.mockResolvedValueOnce({ rows: advertisements });
        const res = createResponse();

        await getUsersAdvertisement({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(advertisements);
    });
});

// Post Adverts test
describe("postAdvertisement", () => {
    const validAdvert = {
        adTitle: "Desk",
        adDescription: "Study desk in good condition",
        productCategory: "Furniture",
        durationDays: 7,
    };

    it("rejects a post with missing required fields", async () => {
        const res = createResponse();

        await postAdvertisement({ tenantId: 4, body: {} }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Missing required fields: title, description, category, and duration are required.",
        });
        expect(client.query).not.toHaveBeenCalled();
    });

    it("posts an advert for an existing tenant", async () => {
        const advertisement = { ad_id: 1, ad_title: "Desk", product_category: "Furniture", approval_status: "Pending" };
        // Tenant details are read first, then the advertisement is inserted.
        client.query
            .mockResolvedValueOnce({ rows: [{ firstname: "Jane", lastname: "Doe", email: "jane@example.com", phonenumber: "0712345678" }] })
            .mockResolvedValueOnce({ rows: [advertisement] });
        createNotification.mockResolvedValueOnce();
        const res = createResponse();

        await postAdvertisement({ tenantId: 4, body: validAdvert, file: { location: "https://example.com/desk.jpg" } }, res);

        expect(createNotification).toHaveBeenCalledWith(4, expect.any(String));
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ message: "Advertisement posted successfully.", advertisement });
    });

    it("returns 404 when the posting tenant does not exist", async () => {
        client.query.mockResolvedValueOnce({ rows: [] });
        const res = createResponse();

        await postAdvertisement({ tenantId: 4, body: validAdvert }, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Tenant not found." });
        expect(createNotification).not.toHaveBeenCalled();
    });
});

// Approve ads test
describe("approveAdvertisement", () => {
    it("approves a pending advert and notifies its tenant", async () => {
        const approvedAdvert = { ad_id: 1, ad_title: "Desk", approval_status: "Approved" };
        // First query finds the advert; second returns the updated advert.
        client.query
            .mockResolvedValueOnce({ rows: [{ ad_id: 1, tenant_id: 4, approval_status: "Pending" }] })
            .mockResolvedValueOnce({ rows: [approvedAdvert] });
        const res = createResponse();

        await approveAdvertisement({ params: { adId: 1 } }, res);

        expect(createNotification).toHaveBeenCalledWith(4, "Good news, your advertisement was approved!");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Advertisement approved successfully.",
            advertisement: approvedAdvert,
        });
    });
});

//Reject Ad test
describe("rejectAdvertisement", () => {
    it("rejects a pending advert and notifies its tenant", async () => {
        const rejectedAdvert = { ad_id: 1, ad_title: "Desk", approval_status: "Rejected" };
        client.query
            .mockResolvedValueOnce({ rows: [{ ad_id: 1, tenant_id: 4, approval_status: "Pending" }] })
            .mockResolvedValueOnce({ rows: [rejectedAdvert] });
        const res = createResponse();

        await rejectAdvertisement({ params: { adId: 1 } }, res);

        expect(createNotification).toHaveBeenCalledWith(4, "Unfortunately, your advertisement was rejected.");
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            message: "Advertisement rejected successfully.",
            advertisement: rejectedAdvert,
        });
    });

    it("does not reject an advert that is already rejected", async () => {
        client.query.mockResolvedValueOnce({ rows: [{ approval_status: "Rejected" }] });
        const res = createResponse();

        await rejectAdvertisement({ params: { adId: 1 } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "This advertisement is already rejected." });
        expect(createNotification).not.toHaveBeenCalled();
    });
});

// Delete Ad test
describe("deleteAdvertisement", () => {
    it("deletes a rejected advert", async () => {
        client.query
            .mockResolvedValueOnce({ rows: [{ approval_status: "Rejected" }] })
            .mockResolvedValueOnce({});
        const res = createResponse();

        await deleteAdvertisement({ params: { adId: 1 } }, res);

        expect(client.query).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: "Advertisement deleted successfully." });
    });
});
