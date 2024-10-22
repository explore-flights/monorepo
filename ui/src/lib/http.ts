export interface RequestConfig extends RequestInit {
  body?: string; // to support more, implement sha256 hashing for it
  headers?: Record<string, string>;
}

export class HTTPClient {
  private readonly baseRequestConfig: RequestConfig;

  constructor() {
    this.baseRequestConfig = {
      credentials: 'same-origin',
    };
  }

  async fetch(url: RequestInfo | URL, config?: RequestConfig): Promise<Response> {
    return await fetch(url, await this.buildRequestInit(url, config));
  }

  private async buildRequestInit(url: RequestInfo | URL, config?: RequestConfig): Promise<RequestConfig> {
    const resultConfig = { ...this.baseRequestConfig, ...(config ?? {}) };

    if (resultConfig.method !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(resultConfig.method)) {
      const headers = resultConfig.headers ?? {};

      if (HTTPClient.isInternalRequest(url)) {
        const csrfToken = HTTPClient.readCookie('XSRF-TOKEN');
        if (csrfToken !== undefined) {
          headers['X-XSRF-TOKEN'] = csrfToken;
        }

        if (resultConfig.body) {
          // https://repost.aws/ja/questions/QUbHCI9AfyRdaUPCCo_3XKMQ/lambda-function-url-behind-cloudfront-invalidsignatureexception-only-on-post
          const src = new TextEncoder().encode(resultConfig.body);
          const hashBuffer = await crypto.subtle.digest('SHA-256', src);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          headers['X-Amz-Content-Sha256'] = hashArray.map((b) => b.toString(16).padStart(2, '0').toLowerCase()).join('');
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
