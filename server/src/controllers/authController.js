import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";

function signToken(userId) {
    return jwt.sign({ id: userId }, env.JWT_SECRET, { expiresIn: "7d" });
}

export async function signup(req, res, next) {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email and password are required" });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ message: "This email is already registered" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, passwordHash });

        res.status(201).json({
            token: signToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                statusMessage: user.statusMessage,
            },
        });
    } catch (err) {
        next(err);
    }
}

export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // passwordHash is hidden by default, so we ask for it explicitly here
        const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");

        // Same message for "no such user" and "wrong password", so nobody can guess which emails exist
        if (!user || !user.passwordHash) {
            return res.status(401).json({ message: "Incorrect email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: "Incorrect email or password" });
        }

        res.json({
            token: signToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                statusMessage: user.statusMessage,
            },
        });
    } catch (err) {
        next(err);
    }
}

export async function me(req, res) {
    const user = req.user;
    res.json({
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
            statusMessage: user.statusMessage,
        },
    });
}