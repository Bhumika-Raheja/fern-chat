import multer from "multer";

const allowed = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
];

// Keep the file in memory (not on disk), maximum 5 MB
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowed.includes(file.mimetype)) return cb(null, true);
    const err = new Error("Only PNG, JPG, GIF, WebP and PDF files are allowed");
    err.status = 400;
    cb(err);
  },
});