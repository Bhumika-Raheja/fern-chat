import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";

export async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : null;

        if (!token) {
            return res.status(401).json({ message: "Not logged in" });
        }

        const payload = jwt.verify(token, env.JWT_SECRET);
        const user = await User.findById(payload.id);

        if (!user) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}