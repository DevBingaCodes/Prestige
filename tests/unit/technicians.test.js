// This read-only controller needs only a database double.
jest.mock("../../config/db", () => ({ query: jest.fn() }));

const client = require("../../config/db");
const { getTechnicians } = require("../../controllers/technicians");

const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// Fetch technicians test
describe("getTechnicians", () => {
    it("returns all technicians", async () => {
        const technicians = [{ technician_id: 1, name: "Amina", specialty: "Plumbing" }];
        client.query.mockResolvedValueOnce({ rows: technicians });
        const res = createResponse();

        await getTechnicians({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(technicians);
    });

    it("returns 500 when technicians cannot be fetched", async () => {
        client.query.mockRejectedValueOnce(new Error("Database unavailable"));
        const res = createResponse();

        await getTechnicians({}, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ message: "Failed to fetch technicians" });
    });
});
