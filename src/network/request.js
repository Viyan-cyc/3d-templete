import axios from "axios";
const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 1e4,
  headers: {
    "Content-Type": "application/json"
  }
});
instance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
instance.interceptors.response.use(
  (response) => {
    const { data } = response;
    if (data.code !== void 0 && data.code !== 0) {
      console.error(`[API Error] ${data.message || "\u672A\u77E5\u9519\u8BEF"}`);
      return Promise.reject(new Error(data.message || "\u8BF7\u6C42\u5931\u8D25"));
    }
    return data;
  },
  (error) => {
    console.error(`[Network Error] ${error.message}`);
    return Promise.reject(error);
  }
);
async function get(url, params, config) {
  return instance.get(url, { params, ...config });
}
async function post(url, data, config) {
  return instance.post(url, data, config);
}
var request_default = instance;
export {
  request_default as default,
  get,
  post
};
