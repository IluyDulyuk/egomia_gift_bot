import "dotenv/config";
import axios from "axios";

export const axiosClassic = axios.create({
  baseURL: process.env.API_URL,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

export const axiosWithAuth = (XTelegamId: string) =>
  axios.create({
    baseURL: process.env.API_URL,
    timeout: 10_000,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Id": XTelegamId,
    },
  });
