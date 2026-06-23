const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello Ticketix Server");
});

const uri = process.env.TICKETIX_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME);

        const UserCollection = db.collection("user");
        const TicketCollection = db.collection("tickets");
        const BookingCollection = db.collection("bookings");
        const TransactionCollection = db.collection("transaction");

        // Ticket Add
        app.post("/api/add-ticket", async (req, res) => {
            const {
                title,
                from,
                to,
                transportType,
                price,
                quantity,
                departureDate,
                perks,
                image,
                vendorName,
                vendorEmail,
                vendorId,
            } = req.body;

            if (
                !title ||
                !from ||
                !to ||
                !transportType ||
                !price ||
                !quantity ||
                !departureDate ||
                !vendorName ||
                !vendorEmail ||
                !vendorId
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields",
                });
            }

            if (Number(price) <= 0 || Number(quantity) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Price and quantity must be greater than 0",
                });
            }

            if (new Date(departureDate) <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Departure date must be in the future",
                });
            }

            const validTransportTypes = ["Bus", "Train", "Plane", "Launch"];
            if (!validTransportTypes.includes(transportType)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid transport type",
                });
            }

            const finalData = {
                title: title.trim(),
                from: from.trim(),
                to: to.trim(),
                transportType,
                price: Number(price),
                quantity: Number(quantity),
                soldQuantity: 0,
                departureDate,
                perks: Array.isArray(perks) ? perks : [],
                image: image || "",
                vendorName: vendorName.trim(),
                vendorEmail: vendorEmail.trim().toLowerCase(),
                vendorId,
                verificationStatus: "pending",
                isAdvertised: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const result = await TicketCollection.insertOne(finalData);
            res.status(201).json({
                success: true,
                insertedId: result.insertedId,
                message: "Ticket added successfully",
            });
        });

        // SingleTicket Data
        app.get("/api/vendor/my-tickets/:id", async (req, res) => {
            const { id } = req.params;

            const query = { _id: new ObjectId(id) };

            const result = await TicketCollection.findOne(query);

            if (!result) {
                return res.status(404).send({
                    success: false,
                    message: "Ticket not found",
                });
            }

            res.send({
                success: true,
                data: result,
            });
        });

        // Get My Added Ticket
        app.get("/api/vendor/my-tickets", async (req, res) => {
            const vendorId = req.query.vendorId;

            if (!vendorId) {
                return res.status(400).send({
                    success: false,
                    message: "Vendor id is required",
                });
            }

            const result = await TicketCollection.find({ vendorId })
                .sort({ createdAt: -1 })
                .toArray();

            res.send({
                success: true,
                data: result,
            });
        });

        // Get ALL tickets (for admin manage tickets page)
        app.get("/api/admin/all-tickets", async (req, res) => {
            const result = await TicketCollection.find()
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result);
        });

        // All Tickets
        app.get("/api/users/all-tickets", async (req, res) => {
            const {
                from = "",
                to = "",
                transportType = "",
                sort = "",
                page = 1,
                limit = 6,
            } = req.query;

            const filter = {
                verificationStatus: "approved",
            };

            if (from) {
                filter.from = {
                    $regex: from,
                    $options: "i",
                };
            }

            if (to) {
                filter.to = {
                    $regex: to,
                    $options: "i",
                };
            }

            if (transportType) {
                filter.transportType = transportType;
            }

            let sortOption = { createdAt: -1 };

            if (sort === "low") {
                sortOption = { price: 1 };
            } else if (sort === "high") {
                sortOption: {
                    price: -1;
                }
            }

            const pageNumber = parseInt(page) || 1;
            const limitNumber = parseInt(limit);
            const skip = (pageNumber - 1) * limitNumber;

            const result = await TicketCollection.find(filter)
                .sort(sortOption)
                .skip(skip)
                .limit(limitNumber)
                .toArray();

            const totalItems = await TicketCollection.countDocuments(filter);
            const totalPages = Math.ceil(totalItems / limitNumber);

            res.send({
                success: true,
                data: result,
                pagination: {
                    currentPage: pageNumber,
                    totalPages,
                    totalItems,
                    perPage: limitNumber,
                },
            });
        });

        // Single Ticket By Id
        app.get("/api/tickets/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const result = await TicketCollection.findOne(query);
            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found",
                });
            }

            res.send({
                success: true,
                data: result,
            });
        });

        // Approve ticket
        app.patch("/api/admin/tickets/:ticketId/approve", async (req, res) => {
            const { ticketId } = req.params;

            const ticket = await TicketCollection.findOne({
                _id: new ObjectId(ticketId),
            });

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found",
                });
            }

            if (ticket.verificationStatus === "approved") {
                return res.status(400).json({
                    success: false,
                    message: "Ticket is already approved",
                });
            }

            const result = await TicketCollection.updateOne(
                { _id: new ObjectId(ticketId) },
                {
                    $set: {
                        verificationStatus: "approved",
                        approvedAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
            );

            if (result.modifiedCount === 0) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to approve ticket",
                });
            }

            res.json({
                success: true,
                message: "Ticket approved successfully!",
            });
        });

        // Reject ticket
        app.patch("/api/admin/tickets/:ticketId/reject", async (req, res) => {
            const { ticketId } = req.params;

            const ticket = await TicketCollection.findOne({
                _id: new ObjectId(ticketId),
            });

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found",
                });
            }

            if (ticket.verificationStatus === "rejected") {
                return res.status(400).json({
                    success: false,
                    message: "Ticket is already rejected",
                });
            }

            // If ticket was advertised, remove advertisement
            const updateData = {
                verificationStatus: "rejected",
                isAdvertised: false,
                advertisedAt: null,
                updatedAt: new Date(),
            };

            const result = await TicketCollection.updateOne(
                { _id: new ObjectId(ticketId) },
                { $set: updateData },
            );

            if (result.modifiedCount === 0) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to reject ticket",
                });
            }

            res.json({
                success: true,
                message: "Ticket rejected successfully!",
            });
        });

        // Get Tickets
        app.get("/api/admin/approved-tickets", async (req, res) => {
            const result = await TicketCollection.find({
                verificationStatus: "approved",
            })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result);
        });

        // Toggle advertise status
        app.patch(
            "/api/admin/tickets/:ticketId/advertise",
            async (req, res) => {
                const { ticketId } = req.params;
                const { isAdvertised } = req.body;

                if (isAdvertised === true) {
                    const advertisedCount =
                        await TicketCollection.countDocuments({
                            isAdvertised: true,
                        });
                    if (advertisedCount >= 6) {
                        return res.status(400).json({
                            success: false,
                            message:
                                "Maximum 6 tickets can be advertised at a time. Please unadvertise one first.",
                        });
                    }
                }

                const result = await TicketCollection.updateOne(
                    { _id: new ObjectId(ticketId) },
                    {
                        $set: {
                            isAdvertised: isAdvertised,
                            advertisedAt: isAdvertised ? new Date() : null,
                        },
                    },
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Ticket not found or no changes made",
                    });
                }

                res.json({
                    success: true,
                    message: isAdvertised
                        ? "Ticket advertised successfully!"
                        : "Ticket unadvertised successfully!",
                });
            },
        );

        // Get advertised tickets (for homepage)
        app.get("/api/advertised-tickets", async (req, res) => {
            const result = await TicketCollection.find({
                isAdvertised: true,
                verificationStatus: "approved",
            })
                .sort({ advertisedAt: -1 })
                .limit(6)
                .toArray();
            res.send(result);
        });

        // Ticket Update
        app.patch("/api/vendor/my-tickets/:id", async (req, res) => {
            const { id } = req.params;

            const {
                title,
                from,
                to,
                transportType,
                price,
                quantity,
                departureDate,
                perks,
                image,
            } = req.body;

            if (
                !id ||
                !title ||
                !from ||
                !to ||
                !transportType ||
                !price ||
                !quantity ||
                !departureDate
            ) {
                return res.status(400).send({
                    success: false,
                    message: "Missing required fields",
                });
            }

            if (Number(price) <= 0 || Number(quantity) <= 0) {
                return res.status(400).send({
                    success: false,
                    message: "Price and quantity must be greater than 0",
                });
            }

            const existingTicket = await TicketCollection.findOne({
                _id: new ObjectId(id),
            });

            if (!existingTicket) {
                return res.status(404).send({
                    success: false,
                    message: "Ticket not found",
                });
            }

            if (existingTicket.verificationStatus === "rejected") {
                return res.status(403).send({
                    success: false,
                    message: "Rejected tickets cannot be updated",
                });
            }

            const updatedDoc = {
                $set: {
                    title: title.trim(),
                    from: from.trim(),
                    to: to.trim(),
                    transportType,
                    price: Number(price),
                    quantity: Number(quantity),
                    departureDate,
                    perks: Array.isArray(perks) ? perks : [],
                    image: image || existingTicket.image || "",
                    updatedAt: new Date(),
                },
            };

            const result = await TicketCollection.updateOne(
                { _id: new ObjectId(id) },
                updatedDoc,
            );

            res.send({
                success: true,
                message: "Ticket updated successfully",
                modifiedCount: result.modifiedCount,
            });
        });

        // Delete Ticket
        app.delete("/api/vendor/my-tickets/:id", async (req, res) => {
            const { id } = req.params;

            const ticketId = { _id: new ObjectId(id) };

            const ticket = await TicketCollection.findOne(ticketId);

            if (!ticket) {
                return res.status(404).send({
                    success: false,
                    message: "Ticket not found",
                });
            }

            if (ticket.verificationStatus === "rejected") {
                return res.status(403).send({
                    success: false,
                    message: "Rejected ticket cannot be deleted",
                });
            }

            const result = await TicketCollection.deleteOne(ticketId);

            res.send({
                success: true,
                message: "Ticket deleted successfully",
                deletedCount: result.deletedCount,
            });
        });

        // Role Update
        app.patch("/api/users/:id/role", async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            const query = { _id: new ObjectId(id) };
            const updateRole = {
                $set: { role: role },
            };

            const result = await UserCollection.updateOne(query, updateRole);
            if (result.matchedCount === 0)
                return res
                    .status(404)
                    .send({ success: false, message: "User not found" });

            res.send({ success: true, message: `Role updated to ${role}` });
        });

        // Fraud Update
        app.patch("/api/users/:id/fraud", async (req, res) => {
            const { id } = req.params;
            const { isFraud } = req.body;

            const result = await UserCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        isFraud: isFraud,
                        status: isFraud ? "fraud" : "active",
                    },
                },
            );

            if (result.matchedCount === 0)
                return res
                    .status(404)
                    .send({ success: false, message: "User not found" });

            res.send({
                success: true,
                message: `Fraud status updated to ${isFraud}`,
            });
        });

        await client.db("admin").command({ ping: 1 });
        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!",
        );

        // Ticket Book By Users
        app.post("/api/bookings", async (req, res) => {
            const {
                ticketId,
                userId,
                userName,
                userEmail,
                quantity,
                unitPrice,
                totalPrice,
                title,
                from,
                to,
                transportType,
                departureDate,
                image,
                vendorId,
                vendorEmail,
                vendorName,
            } = req.body;

            if (!ticketId || !userId || !quantity || !unitPrice) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields",
                });
            }

            const ticket = await TicketCollection.findOne({
                _id: new ObjectId(ticketId),
            });

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: "Ticket not found",
                });
            }

            if (new Date(ticket.departureDate) < new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Departure date has already passed",
                });
            }

            if (ticket.quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Ticket is sold out",
                });
            }

            if (Number(quantity) > ticket.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Only ${ticket.quantity} seats available`,
                });
            }

            const booking = {
                ticketId,
                userId,
                userName,
                userEmail,
                quantity: Number(quantity),
                unitPrice: Number(unitPrice),
                totalPrice: Number(totalPrice),
                title,
                from,
                to,
                transportType,
                departureDate,
                image: image || "",
                vendorId,
                vendorEmail,
                vendorName,
                status: "pending",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const result = await BookingCollection.insertOne(booking);

            res.status(201).json({
                success: true,
                insertedId: result.insertedId,
                message: "Booking created successfully",
            });
        });

        // User Booked Tickets
        app.get("/api/users/my-bookings", async (req, res) => {
            const { userId } = req.query;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: "User id is required",
                });
            }

            let query = {};

            if (userId) {
                query = {
                    userId,
                };
            }

            const result = await BookingCollection.find(query)
                .sort({ createdAt: -1 })
                .toArray();

            res.status(200).json({
                success: true,
                data: result,
            });
        });

        // User Booked Canceled
        app.patch("/api/bookings/:id/cancel", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const updateStatus = {
                $set: { status: "cancelled", updatedAt: new Date() },
            };

            const booking = await BookingCollection.findOne(query);
            if (!booking) {
                return res
                    .status(404)
                    .json({ success: false, message: "Booking not found" });
            }

            if (booking.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message: `Cannot cancel booking. Status is currently '${booking.status}'`,
                });
            }

            await BookingCollection.updateOne(query, updateStatus);

            res.json({
                success: true,
                message: "Booking cancelled successfully",
            });
        });

        // Vendor Booking Request
        app.get("/api/vendor/booking-requests", async (req, res) => {
            const { vendorId } = req.query;

            if (!vendorId) {
                return res.status(400).json({
                    success: false,
                    message: "Vendor ID required",
                });
            }

            const matchConditions = [{ vendorId: vendorId }];
            if (ObjectId.isValid(vendorId)) {
                matchConditions.push({ vendorId: new ObjectId(vendorId) });
            }

            const bookings = await BookingCollection.aggregate([
                {
                    $match: { $or: matchConditions },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "userEmail",
                        foreignField: "email",
                        as: "userInfo",
                    },
                },
                {
                    $addFields: {
                        user: { $arrayElemAt: ["$userInfo", 0] },
                    },
                },
                {
                    $project: {
                        userInfo: 0,
                    },
                },
                { $sort: { createdAt: -1 } },
            ]).toArray();

            res.json({ success: true, data: bookings });
        });

        // Vendor Booking Accept
        app.patch("/api/vendor/bookings/:id/accept", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const booking = await BookingCollection.findOne(query);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found",
                });
            }

            if (booking.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message: `Booking is already ${booking.status}`,
                });
            }

            await BookingCollection.updateOne(query, {
                $set: {
                    status: "accepted",
                    acceptedAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            res.json({
                success: true,
                message: "Booking accepted successfully!",
            });
        });

        // Vendor Booking Reject
        app.patch("/api/vendor/bookings/:id/reject", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const booking = await BookingCollection.findOne(query);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found",
                });
            }

            if (booking.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message: `Booking is already ${booking.status}`,
                });
            }

            await BookingCollection.updateOne(query, {
                $set: {
                    status: "rejected",
                    rejectedAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            res.json({
                success: true,
                message: "Booking rejected successfully!",
            });
        });

        // Transaction Data add
        app.post("/api/payment/confirm", async (req, res) => {
            const {
                transactionId,
                bookingId,
                ticketId,
                userId,
                amount,
                userEmail,
            } = req.body;

            const bookingQuery = { _id: new ObjectId(bookingId) };
            const ticketQuery = { _id: new ObjectId(ticketId) };

            if (
                !transactionId ||
                !bookingId ||
                !ticketId ||
                !userId ||
                !amount ||
                !userEmail
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields",
                });
            }

            const isExits = await TransactionCollection.findOne({
                transactionId,
            });
            if (isExits) {
                return res.status(200).json({
                    success: true,
                    message: "Already processed",
                    alreadyProcessed: true,
                });
            }

            const booking = await BookingCollection.findOne(bookingQuery);

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found",
                });
            }

            if (booking.status === "paid") {
                return res.status(200).json({
                    success: true,
                    message: "Already paid",
                    alreadyProcessed: true,
                });
            }

            const ticket = await TicketCollection.findOne(ticketQuery);
            if (!ticket) {
                return res
                    .status(404)
                    .json({ success: false, message: "Ticket not found" });
            }

            const transactionData = {
                transactionId,
                bookingId,
                ticketId,
                userId,
                userEmail,
                ticketTitle: booking.title,
                amount: Number(amount),
                paymentDate: new Date(),
            };

            const result =
                await TransactionCollection.insertOne(transactionData);
            res.status(201).json({
                success: true,
                message: "Payment confirmed successfully",
            });

            await BookingCollection.updateOne(bookingQuery, {
                $set: {
                    status: "paid",
                    paidAt: new Date(),
                    updatedAt: new Date(),
                },
            });

            await TicketCollection.updateOne(ticketQuery, {
                $inc : {quantity : - booking.quantity , soldQuantity : booking.quantity}
            })
        });
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`This server is running on port: ${port}`);
});
