import { getReactionSnapshots } from "../services/reactionService.js";

export async function getReactions(req, res, next) {
  try {
    res.json({ reactions: await getReactionSnapshots(req.params.id, req.user._id, req.query.ids) });
  } catch (err) {
    next(err);
  }
}
