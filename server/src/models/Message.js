import mongoose from "mongoose";
import { REACTION_EMOJIS } from "../../../shared/reactions.mjs";

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: "file" },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },
    kind: { type: String, enum: ["image", "file"], default: "file" },
    width: { type: Number },
    height: { type: Number },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true, enum: REACTION_EMOJIS.map((item) => item.emoji) },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { _id: false });

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
    // A message can be only a file, so the text may be empty
    body: { type: String, trim: true, maxlength: 4000, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    clientId: { type: String },
    reactions: { type: [reactionSchema], default: [] },
    reactionVersion: { type: Number, default: 0, min: 0 },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
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