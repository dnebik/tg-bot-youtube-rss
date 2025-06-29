import axios from "axios";

const APP_PROXY_HOST = process.env.APP_PROXY_HOST;
const APP_PROXY_PORT = process.env.APP_PROXY_PORT;

export const http = axios.create();

if (APP_PROXY_HOST && APP_PROXY_PORT) {
  http.defaults.proxy = {
    protocol: "http",
    host: APP_PROXY_HOST,
    port: Number(APP_PROXY_PORT),
  };
}
