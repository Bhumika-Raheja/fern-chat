import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        body: { type: String, required: true, trim: true, maxlength: 4000 },
        clientId: { type: String },
    },
    { timestamps: true }
);

// Fast "latest messages of this conversation" lookups
messageSchema.index({ conversationId: 1, _id: -1 });

// The same sender can't save the same clientId twice in one conversation
messageSchema.index(
    { conversationId: 1, senderId: 1, clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }
);

const Message = mongoose.model("Message", messageSchema);
export default Message;