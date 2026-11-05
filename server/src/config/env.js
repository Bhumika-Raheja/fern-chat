import "dotenv/config";

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  MONGODB_URI: process.env.MONGODB_URI || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
};