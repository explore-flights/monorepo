export interface RequestConfig extends RequestInit {
  headers?: Record<string, string>;
}

export class HTTPClient {
  private readonly baseRequestConfig: RequestConfig;

  constructor() {
    this.baseRequestConfig = {
      credentials: 'same-origin',
    };
  }

  fetch(url: RequestInfo | URL, config?: RequestConfig): Promise<Response> {
    return fetch(url, this.buildRequestInit(url, config));
  }

  private buildRequestInit(url: RequestInfo | URL, config?: RequestConfig): RequestConfig {
    const resultConfig = { ...this.baseRequestConfig, ...(config ?? {}) };

    if (resultConfig.method !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(resultConfig.method)) {
      const headers = resultConfig.headers ?? {};

      if (HTTPClient.isInternalRequest(url)) {
        const csrfToken = HTTPClient.readCookie('XSRF-TOKEN');
        if (csrfToken !== undefined) {
          headers['X-XSRF-TOKEN'] = csrfToken;
        }
      }

      if (resultConfig.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      resultConfig.headers = headers;
    }

    return resultConfig;
  }

  private static isInternalRequest(url: RequestInfo | URL): boolean {
    return url.toString().startsWith('/');
  }

  private static readCookie(searchForName: string): string | undefined {
    const searchForNameEncoded = HTTPClient.escapeRegExp(encodeURIComponent(searchForName));
    const result = RegExp(`(?:^| |,|;)${searchForNameEncoded}=(.*?)(?:;|,|$)`).exec(document.cookie);
    if (result !== null && result.length >= 2) {
      return decodeURIComponent(result[1]);
    }

    return undefined;
  }

  private static escapeRegExp(v: string): string {
    return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
