import axios from "axios";

export const http = axios.create();

const APP_PROXY_HOST = process.env.APP_PROXY_HOST;
const APP_PROXY_PORT = process.env.APP_PROXY_PORT;

if (APP_PROXY_HOST && APP_PROXY_PORT) {
  http.defaults.proxy = {
    host: APP_PROXY_HOST,
    port: Number(APP_PROXY_PORT),
    protocol: "http",
  };
}
