import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { env } from "../config/env.js";

export const googleClient = new OAuth2Client();

export async function googleAuth(req, res, next) {
    if (!env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({ message: "Google sign-in is not configured yet." });
    }
    const { credential, password } = req.body || {};
    if (typeof credential !== "string" || !credential || credential.length > 16384) {
        return res.status(400).json({ message: "A Google credential is required." });
    }
    let profile;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential, audience: env.GOOGLE_CLIENT_ID,
        });
        profile = ticket.getPayload();
        if (!profile?.sub || !profile.email || profile.email_verified !== true) {
            throw new Error("Unverified identity");
        }
    } catch {
        return res.status(401).json({ message: "Google sign-in could not be verified. Please try again." });
    }
    try {
        const email = profile.email.trim().toLowerCase();
        let user = await User.findOne({ googleId: profile.sub }).select("+googleId");
        let created = false;
        if (!user) {
            user = await User.findOne({ email }).select("+passwordHash +googleId");
            if (user) {
                if (user.googleId && user.googleId !== profile.sub) {
                    return res.status(409).json({ message: "This account is linked to a different Google account." });
                }
                // Email alone is not sufficient proof to link an existing account.
                if (!user.passwordHash) {
                    return res.status(409).json({ message: "This account cannot be linked automatically." });
                }
                if (typeof password !== "string" || !password) {
                    return res.status(409).json({ code: "PASSWORD_REQUIRED", message: "Enter your Fern password once to link this account to Google." });
                }
                if (!(await bcrypt.compare(password, user.passwordHash))) {
                    return res.status(401).json({ code: "PASSWORD_REQUIRED", message: "Incorrect Fern password. Please try again." });
                }
                user.googleId = profile.sub;
                await user.save();
            } else {
                user = await User.create({
                    googleId: profile.sub, email,
                    name: (profile.name || email.split("@")[0]).trim().slice(0, 60) || "Fern user",
                    avatarUrl: profile.picture || "",
                });
                created = true;
            }
        }
        return res.status(created ? 201 : 200).json({
            token: jwt.sign({ id: user._id }, env.JWT_SECRET, { expiresIn: "7d" }),
            user: { id: user._id, name: user.name, email: user.email,
                avatarUrl: user.avatarUrl, statusMessage: user.statusMessage },
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "This account changed during sign-in. Please try Google sign-in again." });
        }
        next(err);
    }
}
