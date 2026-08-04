import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP 标准头，不可改名
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器
instance.interceptors.request.use(
  (config) =>
    // 可在此处添加 token 等
    config
  ,
  (error) => Promise.reject(error),
);

// 响应拦截器
instance.interceptors.response.use(
  (response: AxiosResponse) => {
    const { data } = response;
    // 按约定，返回 { code: 0, data: ..., message: '' }，code === 0 表示成功
    if (data.code !== undefined && data.code !== 0) {
      console.error(`[API Error] ${data.message || '未知错误'}`);
      return Promise.reject(new Error(data.message || '请求失败'));
    }
    return data;
  },
  (error) => {
    console.error(`[Network Error] ${error.message}`);
    return Promise.reject(error);
  },
);

export const get = async <T = unknown>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> => instance.get(url, { params, ...config });

export const post = async <T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> => instance.post(url, data, config);

export default instance;
