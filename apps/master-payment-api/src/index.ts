import { Redis } from "ioredis";
import { config } from "./config.ts";
import { openStore } from "./store.ts";
import { makeApp } from "./app.ts";

const settings = config();
const store = await openStore(settings.mongoUri);
const redis = new Redis(settings.redisUrl, {lazyConnect:true,connectTimeout:5000,maxRetriesPerRequest:1,enableOfflineQueue:false});
redis.on("error", error => console.error("Redis error:",error.name));
await redis.connect();
const server = makeApp(settings,store,redis).listen(settings.port,() => {
  console.log("Sanbookpay master API listening on port " + settings.port);
});
const stop = () => {
  server.close(() => {
    redis.disconnect();
    void store.client.close();
  });
};
process.once("SIGINT",stop);
process.once("SIGTERM",stop);
