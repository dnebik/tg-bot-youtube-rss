import axios from "axios";
import {
  createLogger,
  extractAxiosErrorDetails,
} from "@/helpers/logger";

const log = createLogger("http");

const APP_PROXY_HOST = process.env.APP_PROXY_HOST;
const APP_PROXY_PORT = process.env.APP_PROXY_PORT;

export const http = axios.create();

if (APP_PROXY_HOST && APP_PROXY_PORT) {
  http.defaults.proxy = {
    protocol: "http",
    host: APP_PROXY_HOST,
    port: Number(APP_PROXY_PORT),
  };
  log.info("Proxy configured", {
    host: APP_PROXY_HOST,
    port: APP_PROXY_PORT,
  });
} else {
  log.info("No proxy configured, using direct connection");
}

http.interceptors.response.use(undefined, (error) => {
  log.error("Request failed", extractAxiosErrorDetails(error));
  return Promise.reject(error);
});
