import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
    if (!env.MONGODB_URI) {
        throw new Error("MONGODB_URI is missing in server/.env");
    }
    await mongoose.connect(env.MONGODB_URI);
    console.log("MongoDB connected");
}