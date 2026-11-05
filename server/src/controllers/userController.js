import User from "../models/User.js";

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
