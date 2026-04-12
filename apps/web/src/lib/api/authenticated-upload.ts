/**
 * @file 带鉴权恢复的上传传输模块。
 */

import { requestAccessTokenRefresh } from "@/lib/api/authenticated-fetch";
import { expireSessionIfStaleAccessToken } from "@/lib/auth/session-manager";
import { getAccessToken } from "@/lib/auth/token-store";
import { ApiRequestError } from "./api-request-error";
import { translateCommonErrorMessage } from "./error-response";

type AuthenticatedUploadResult = {
  response: Response;
  responseText: string;
};

type AuthenticatedUploadOptions = {
  body: FormData;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  url: string;
};

function buildUploadTransportError() {
  return new ApiRequestError(translateCommonErrorMessage("apiErrorServiceUnavailable"), {
    status: 503,
  });
}

function withAbortHandling(signal: AbortSignal | undefined, callback: () => void) {
  if (!signal) {
    return () => {};
  }

  if (signal.aborted) {
    callback();
    return () => {};
  }

  const handleAbort = () => callback();
  signal.addEventListener("abort", handleAbort, { once: true });
  return () => signal.removeEventListener("abort", handleAbort);
}

function createUploadPromise(
  body: FormData,
  url: string,
  {
    accessToken,
    canRetryAfterRefresh,
    onProgress,
    signal,
  }: {
    accessToken: string | null;
    canRetryAfterRefresh: boolean;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<AuthenticatedUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress || event.total <= 0) {
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onerror = () => {
      cleanupAbortListener();
      reject(buildUploadTransportError());
    };

    xhr.onabort = () => {
      cleanupAbortListener();
      reject(new DOMException("The upload was aborted.", "AbortError"));
    };

    xhr.onload = async () => {
      cleanupAbortListener();
      const responseText = xhr.responseText ?? "";
      const response = new Response(responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
      });

      if (response.status === 401 && canRetryAfterRefresh) {
        try {
          const nextAccessToken = await requestAccessTokenRefresh();
          resolve(
            await createUploadPromise(body, url, {
              accessToken: nextAccessToken,
              canRetryAfterRefresh: false,
              onProgress,
              signal,
            }),
          );
          return;
        } catch (error) {
          expireSessionIfStaleAccessToken(accessToken);
          reject(error);
          return;
        }
      }

      resolve({ response, responseText });
    };

    const cleanupAbortListener = withAbortHandling(signal, () => xhr.abort());

    xhr.send(body);
  });
}

/**
 * 发送带 access token 的 multipart 上传请求，并在 401 时自动刷新后重试一次。
 */
export function authenticatedUpload({ body, onProgress, signal, url }: AuthenticatedUploadOptions) {
  return createUploadPromise(body, url, {
    accessToken: getAccessToken(),
    canRetryAfterRefresh: true,
    onProgress,
    signal,
  });
}
