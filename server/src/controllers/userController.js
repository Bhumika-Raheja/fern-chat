import mongoose from "mongoose";
import User from "../models/User.js";

function isValidHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function searchUsers(req, res, next) {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.json({ users: [] });
    if (query.length > 80) {
      return res.status(400).json({ message: "Search must be 80 characters or fewer" });
    }

    // Treat search text literally, including punctuation in email addresses.
    const pattern = new RegExp(query.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&"), "i");
    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select("_id name avatarUrl")
      .sort({ name: 1, _id: 1 })
      .limit(20)
      .lean();

    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function getUserProfile(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id)
      .select("_id name avatarUrl statusMessage lastSeenAt")
      .lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { name, statusMessage, avatarUrl } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({ message: "Name must be a string" });
      }
      const trimmedName = name.trim();
      if (!trimmedName || trimmedName.length > 60) {
        return res.status(400).json({ message: "Name must be between 1 and 60 characters" });
      }
      updates.name = trimmedName;
    }

    if (statusMessage !== undefined) {
      if (typeof statusMessage !== "string") {
        return res.status(400).json({ message: "Status message must be a string" });
      }
      const trimmedStatus = statusMessage.trim();
      if (trimmedStatus.length > 100) {
        return res.status(400).json({ message: "Status message must be 100 characters or fewer" });
      }
      updates.statusMessage = trimmedStatus;
    }

    if (avatarUrl !== undefined) {
      if (typeof avatarUrl !== "string") {
        return res.status(400).json({ message: "Avatar URL must be a string" });
      }
      const trimmedAvatar = avatarUrl.trim();
      if (trimmedAvatar && (trimmedAvatar.length > 500 || !isValidHttpsUrl(trimmedAvatar))) {
        return res.status(400).json({ message: "Avatar URL must be a valid HTTPS URL" });
      }
      updates.avatarUrl = trimmedAvatar;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Provide at least one profile field to update" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: updated._id,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatarUrl,
        statusMessage: updated.statusMessage,
        lastSeenAt: updated.lastSeenAt,
      },
    });
  } catch (err) {
    next(err);
  }
}
