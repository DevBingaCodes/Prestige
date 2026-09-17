// Mock anything that would otherwise talk to Postgres or another service.
jest.mock("../../config/db", () => ({
    query: jest.fn(),
}));

const client = require("../../config/db");
const { getBookings, usersBookings, bookARoom } = require("../../controllers/booking");

// Add methods here only when the controller being tested calls them.
const createResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
});

//Fetch Booking test
describe("getBookings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns all bookings", async () => {
        const bookings = [{ booking_id: 1, tenant_id: 4 }];
        client.query.mockResolvedValueOnce({ rows: bookings });
        const res = createResponse();

        await getBookings({}, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(bookings);
    });
})

//Fetch My Bookings test(user bookings)
describe("myBookings", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns bookings for the authenticated tenant", async () => {
        const bookings = [{ booking_id: 1, tenant_id: 4, room_price: 5000 }];
        client.query.mockResolvedValueOnce({ rows: bookings });
        const res = createResponse();

        await usersBookings({ tenantId: 4 }, res);

        expect(client.query).toHaveBeenCalledWith(expect.any(String), [4]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(bookings);
    });
})

//Book a Room
describe("bookARoom", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("creates a booking for an available room", async () => {
        const booking = { booking_id: 1, tenant_id: 4, room_id: 2, payment_status: "Unpaid" };
        // Queue database results in the same order bookARoom calls them:
        // tenant, active booking, room, new booking, then room update.
        client.query
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 0 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [booking] })
            .mockResolvedValueOnce({});
        const res = createResponse();

        await bookARoom({
            tenantId: 4,
            body: { roomId: 2, checkInDate: "2026-01-15", checkOutDate: "2026-04-15" },
        }, res);

        expect(client.query).toHaveBeenCalledTimes(5);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            message: "Room booked successfully. Payment is pending.",
            booking,
        });
    });
})
