import cloudinary from "../config/cloudinary.js";

function sendToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "fern", resource_type: "auto" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file received. Use the field name 'file'." });
    }

    const result = await sendToCloudinary(req.file.buffer);
    const isImage = req.file.mimetype.startsWith("image/");

    res.status(201).json({
      file: {
        url: result.secure_url,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        kind: isImage ? "image" : "file",
        width: result.width || null,
        height: result.height || null,
      },
    });
  } catch (err) {
        console.error("Upload failed:", err.message);
    res.status(502).json({ message: "Could not upload the file. Please try again." });
  }
}