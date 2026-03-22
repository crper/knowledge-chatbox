/**
 * @file Access Token 内存存储模块。
 */

let accessToken: string | null = null;

/**
 * 读取当前 access token。
 */
export function getAccessToken() {
  return accessToken;
}

/**
 * 设置当前 access token。
 */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

/**
 * 清空当前 access token。
 */
export function clearAccessToken() {
  accessToken = null;
}
