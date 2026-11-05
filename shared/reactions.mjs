export const REACTION_EMOJIS = [
  ["\u{1F44D}", "Thumbs up", "Popular"], ["\u{2764}\u{FE0F}", "Heart", "Popular"],
  ["\u{1F602}", "Laughing tears", "Popular"], ["\u{1F389}", "Party", "Popular"],
  ["\u{1F525}", "Fire", "Popular"], ["\u{1F440}", "Eyes", "Popular"],
  ["\u{1F64F}", "Thank you", "Popular"], ["\u{2705}", "Check mark", "Popular"],
  ["\u{1F600}", "Grinning", "Faces"], ["\u{1F604}", "Happy", "Faces"],
  ["\u{1F60A}", "Smiling", "Faces"], ["\u{1F60D}", "Heart eyes", "Faces"],
  ["\u{1F970}", "Love", "Faces"], ["\u{1F60E}", "Cool", "Faces"],
  ["\u{1F914}", "Thinking", "Faces"], ["\u{1F62E}", "Surprised", "Faces"],
  ["\u{1F622}", "Sad", "Faces"], ["\u{1F62D}", "Crying", "Faces"],
  ["\u{1F621}", "Angry", "Faces"], ["\u{1F634}", "Sleeping", "Faces"],
  ["\u{1F605}", "Nervous laugh", "Faces"], ["\u{1F923}", "Rolling laughing", "Faces"],
  ["\u{1F607}", "Innocent", "Faces"], ["\u{1F973}", "Celebrating", "Faces"],
  ["\u{1F44E}", "Thumbs down", "Gestures"], ["\u{1F44F}", "Clapping", "Gestures"],
  ["\u{1F64C}", "Raised hands", "Gestures"], ["\u{1F44B}", "Wave", "Gestures"],
  ["\u{1F4AA}", "Strong", "Gestures"], ["\u{1F91D}", "Handshake", "Gestures"],
  ["\u{1F44C}", "Okay", "Gestures"], ["\u{270C}\u{FE0F}", "Peace", "Gestures"],
  ["\u{1F499}", "Blue heart", "Hearts"], ["\u{1F49A}", "Green heart", "Hearts"],
  ["\u{1F49B}", "Yellow heart", "Hearts"], ["\u{1F49C}", "Purple heart", "Hearts"],
  ["\u{1F494}", "Broken heart", "Hearts"], ["\u{1F496}", "Sparkling heart", "Hearts"],
  ["\u{1F680}", "Rocket", "Objects"], ["\u{1F4A1}", "Idea", "Objects"],
  ["\u{1F4AF}", "Hundred", "Objects"], ["\u{2B50}", "Star", "Objects"],
  ["\u{2728}", "Sparkles", "Objects"], ["\u{1F3C6}", "Trophy", "Objects"],
  ["\u{1F381}", "Gift", "Objects"], ["\u{1F4CC}", "Pin", "Objects"],
  ["\u{2615}", "Coffee", "Objects"], ["\u{1F355}", "Pizza", "Objects"],
  ["\u{1F33F}", "Herb", "Objects"], ["\u{1F331}", "Seedling", "Objects"],
  ["\u{1F4BB}", "Laptop", "Objects"], ["\u{1F3AF}", "Target", "Objects"],
  ["\u{26A0}\u{FE0F}", "Warning", "Objects"], ["\u{1F6A8}", "Alert", "Objects"],
  ["\u{1F4DD}", "Note", "Objects"], ["\u{1F3B5}", "Music", "Objects"],
].map(([emoji, label, category]) => ({ emoji, label, category }));

const supported = new Set(REACTION_EMOJIS.map((item) => item.emoji));
export const isReactionEmoji = (emoji) => typeof emoji === "string" && supported.has(emoji);

export function groupReactions(reactions = [], myId) {
  const groups = new Map();
  for (const reaction of reactions) {
    const person = reaction.userId;
    const id = person?._id || (typeof person === "string" ? person : null);
    if (!id || !isReactionEmoji(reaction.emoji)) continue;
    if (!groups.has(reaction.emoji)) {
      groups.set(reaction.emoji, {
        emoji: reaction.emoji,
        label: REACTION_EMOJIS.find((item) => item.emoji === reaction.emoji).label,
        users: [], mine: false,
      });
    }
    const group = groups.get(reaction.emoji);
    if (!group.users.some((user) => user._id === String(id))) {
      group.users.push({ _id: String(id), name: person.name || "Member" });
    }
    if (String(id) === String(myId)) group.mine = true;
  }
  return [...groups.values()];
}
