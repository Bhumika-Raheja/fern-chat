import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["dm", "group", "channel"], required: true },
        name: { type: String, trim: true, maxlength: 40, default: "" },
        description: { type: String, trim: true, maxlength: 200, default: "" },
        memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        adminIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        lastMessageAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true }
);

// Two public channels can't share a name
conversationSchema.index(
    { name: 1 },
    { unique: true, partialFilterExpression: { type: "channel" } }
);

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;