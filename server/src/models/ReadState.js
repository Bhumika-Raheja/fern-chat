import mongoose from "mongoose";

const readStateSchema = new mongoose.Schema(
    {
        conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        lastReadMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    { timestamps: true }
);

// One pointer per person per conversation
readStateSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

const ReadState = mongoose.model("ReadState", readStateSchema);
export default ReadState;