import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import Conversation from "./models/Conversation.js";
import Message from "./models/Message.js";

await connectDB();

const conv = await Conversation.findOne({ name: "general" });
if (!conv) {
    console.log("No channel named general found");
    process.exit(1);
}

const sender = conv.memberIds[0];
const docs = [];
for (let i = 1; i <= 100; i++) {
    docs.push({
        conversationId: conv._id,
        senderId: sender,
        body: `Test message ${i}`,
    });
}

await Message.insertMany(docs);
await Conversation.updateOne({ _id: conv._id }, { lastMessageAt: new Date() });
console.log("Added 100 messages to #general");

await mongoose.disconnect();