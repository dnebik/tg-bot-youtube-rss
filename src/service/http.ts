import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";

export const http = axios.create();

const APP_PROXY_HOST = process.env.APP_PROXY_HOST;
const APP_PROXY_PORT = process.env.APP_PROXY_PORT;

if (APP_PROXY_HOST && APP_PROXY_PORT) {
  const agent = new SocksProxyAgent(
    `socks5h://${APP_PROXY_HOST}:${APP_PROXY_PORT}`,
  );
  http.defaults.httpsAgent = agent;
  http.defaults.httpAgent = agent;
}
