import path from "path";
import { Interval } from "@interval/sdk";
import "dotenv/config"; // loads environment variables from .env

const interval = new Interval({
  endpoint: `wss://${process.env.INTERVAL_SERVER_URL}/websocket`,
  apiKey: process.env.INTERVAL_KEY,
  routesDirectory: path.resolve(__dirname, "routes"),
});

interval.listen();
