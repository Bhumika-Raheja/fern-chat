import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 60 },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: { type: String, select: false },
        avatarUrl: { type: String, default: "" },
        statusMessage: { type: String, default: "", maxlength: 100 },
        lastSeenAt: { type: Date, default: null },
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;