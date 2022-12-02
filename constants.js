export const PORT = process.env.PORT || 80;
export const SERVER_URL = process.env.SERVER_URL;

export const MONGO_URL = process.env.MONGO_URL;
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
export const JWT_SECRET = process.env.JWT_SECRET;

export const MINIO_URL = process.env.MINIO_URL;
export const MINIO_BUCKET = process.env.MINIO_BUCKET;
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;

export const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
export const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

export const EDEN_STABLE_DIFFUSION_URL = process.env.EDEN_STABLE_DIFFUSION_URL;

export const generators = {
  'clipx': {
    cog: "abraham-ai/clipx",
    configFile: "./generators/clipx.json"
  },
  'stable-diffusion': {
    cog: "abraham-ai/eden-stable-diffusion",
    configFile: "./generators/stable-diffusion.json",
    edenUrl: EDEN_STABLE_DIFFUSION_URL
  },
  'dreambooth-banny': {
    cog: "genekogan/banny2",
    configFile: "./generators/dreambooth-banny.json"
  }
}

